import { z } from 'zod';
import { parseSsoUrl } from 'src/services/github/parse-sso-url';
import { detectGithubTokenKind, type GithubTokenType } from 'src/types/GithubPatSchema';

const API = 'https://api.github.com';
const PER_PAGE = 100;
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_AFTER_MS = 60_000;

export type GithubPatErrorKind =
	| 'invalid_token'
	| 'missing_scope'
	| 'sso_required'
	| 'org_restricted'
	| 'pending_approval'
	| 'no_repositories'
	| 'rate_limited'
	| 'webhook_exists'
	| 'unreachable'
	| 'other';

export class GithubPatError extends Error {
	public readonly kind: GithubPatErrorKind;
	// Set only for `sso_required` — the authorization link GitHub's own
	// `X-GitHub-SSO` header names, so the browser can send the person straight to it.
	public readonly ssoUrl?: string;
	// Set only for `rate_limited` — from `Retry-After` when GitHub sends it, else
	// derived from `X-RateLimit-Reset` (AC-41).
	public readonly retryAfterMs?: number;

	constructor(kind: GithubPatErrorKind, message: string, opts?: { ssoUrl?: string; retryAfterMs?: number }) {
		super(message);
		this.name = 'GithubPatError';
		this.kind = kind;
		this.ssoUrl = opts?.ssoUrl;
		this.retryAfterMs = opts?.retryAfterMs;
	}
}

const UserSchema = z.object({ login: z.string() });

const RepoSchema = z.object({
	id: z.number(),
	full_name: z.string(),
	default_branch: z.string(),
	private: z.boolean(),
	permissions: z.object({ push: z.boolean().optional() }).optional()
});

const ErrorBodySchema = z.object({ message: z.string().optional() });

const WebhookSchema = z.object({ id: z.number(), config: z.object({ url: z.string().optional() }).optional() });

const BranchSchema = z.object({ name: z.string(), commit: z.object({ sha: z.string() }) });

// Checked before either 401 or 403 is classified further: GitHub answers both
// its primary and secondary rate limits with a 403 indistinguishable from a
// real permission refusal except by these headers, and a caller told to back
// off should never also be told its token is bad (AC-41).
function rateLimitFromHeaders(headers: Headers): number | null {
	const retryAfter = Number(headers.get('retry-after'));

	if (Number.isFinite(retryAfter) && retryAfter > 0) {
		return retryAfter * 1000;
	}

	if (headers.get('x-ratelimit-remaining') !== '0') {
		return null;
	}

	const reset = Number(headers.get('x-ratelimit-reset'));

	return Number.isFinite(reset) ? Math.max(reset * 1000 - Date.now(), DEFAULT_RETRY_AFTER_MS) : DEFAULT_RETRY_AFTER_MS;
}

// GitHub gives every one of these the same 403 with no field that names which
// one happened — only the sentence in `message` does. There is no documented,
// versioned error code to switch on instead, so the wording itself is the
// contract, checked in the order that matches GitHub's own precedence: SSO
// (carried on its own header, so it is unambiguous) first, then the two
// organization-level refusals, and a missing scope/permission last because it is
// what every other 403 this token could hit actually means.
function classifyForbidden(opts: { message: string; ssoHeader: string | null }): GithubPatError {
	const ssoUrl = parseSsoUrl(opts.ssoHeader);

	if (ssoUrl !== null) {
		return new GithubPatError('sso_required', 'This token is not authorized for the organization\'s SAML single sign-on. Authorize it, then try again.', { ssoUrl });
	}

	if (/saml enforcement/i.test(opts.message)) {
		return new GithubPatError('sso_required', 'This token is not authorized for the organization\'s SAML single sign-on. Authorize it, then try again.');
	}

	if (/(oauth app access|personal access token) (restriction|polic)/i.test(opts.message) || /restricts (personal access )?tokens?/i.test(opts.message)) {
		return new GithubPatError('org_restricted', "This organization's policy blocks personal access tokens.");
	}

	if (/not been approved|awaiting approval|pending approval/i.test(opts.message)) {
		return new GithubPatError('pending_approval', 'This fine-grained token is still waiting for an organization owner to approve it.');
	}

	return new GithubPatError('missing_scope', 'This token is missing a required scope or permission.');
}

export function getGithubPatService(deps: { fetchImpl?: typeof fetch }) {
	const fetchImpl = deps.fetchImpl ?? fetch;

	async function call(opts: { url: string; pat: string; method?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; json: unknown; headers: Headers }> {
		let response: Response;

		try {
			response = await fetchImpl(opts.url, {
				method: opts.method ?? 'GET',
				headers: {
					accept: 'application/vnd.github+json',
					'x-github-api-version': '2022-11-28',
					'user-agent': 'bosun',
					authorization: `Bearer ${opts.pat}`,
					...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
					...opts.headers
				},
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (error) {
			throw new GithubPatError('unreachable', `Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`);
		}

		const json: unknown = await response.json().catch(() => null);

		return { status: response.status, json, headers: response.headers };
	}

	async function throwOnKnownFailureStatus(result: { status: number; json: unknown; headers: Headers }): Promise<void> {
		if (result.status === 401) {
			throw new GithubPatError('invalid_token', 'This token is invalid or expired.');
		}

		if (result.status === 403 || result.status === 429) {
			const retryAfterMs = rateLimitFromHeaders(result.headers);

			if (retryAfterMs !== null) {
				throw new GithubPatError('rate_limited', 'GitHub is rate-limiting this token — try again shortly.', { retryAfterMs });
			}
		}

		if (result.status === 403) {
			const said = ErrorBodySchema.safeParse(result.json);

			throw classifyForbidden({ message: said.success ? (said.data.message ?? '') : '', ssoHeader: result.headers.get('x-github-sso') });
		}
	}

	async function fetchUser(pat: string): Promise<{ login: string; tokenType: GithubTokenType }> {
		const result = await call({ url: `${API}/user`, pat });

		await throwOnKnownFailureStatus(result);

		if (result.status !== 200) {
			throw new GithubPatError('other', `GitHub answered ${result.status} reading the authenticated user`);
		}

		const tokenType = detectGithubTokenKind(pat);

		// Fine-grained tokens carry no equivalent header — their permissions are
		// granular and only provable by what they can actually do, which the
		// repository listing below already checks (AC-4).
		if (tokenType === 'classic') {
			const scopes = (result.headers.get('x-oauth-scopes') ?? '').split(',').map((scope) => scope.trim());

			if (!scopes.includes('repo')) {
				throw new GithubPatError('missing_scope', "This classic token is missing the 'repo' scope.");
			}
		}

		return { login: UserSchema.parse(result.json).login, tokenType };
	}

	// Every repository this token can push to, across every organization and
	// account it can see — proof the token works, the same role
	// `azureDevOps.listRepositories` plays for a connect/rotate request.
	async function listPushableRepositories(pat: string): Promise<{ githubRepoId: number; fullName: string; defaultBranch: string; private: boolean }[]> {
		const repositories: z.infer<typeof RepoSchema>[] = [];

		for (let page = 1; page <= MAX_PAGES; page += 1) {
			const url = `${API}/user/repos?affiliation=organization_member,collaborator&per_page=${PER_PAGE}&page=${page}`;
			const result = await call({ url, pat });

			await throwOnKnownFailureStatus(result);

			if (result.status !== 200) {
				throw new GithubPatError('other', `GitHub answered ${result.status} listing repositories`);
			}

			const parsedPage = z.array(RepoSchema).parse(result.json);

			repositories.push(...parsedPage);

			if (parsedPage.length < PER_PAGE) {
				break;
			}
		}

		return repositories
			.filter((repo) => repo.permissions?.push === true)
			.map((repo) => ({ githubRepoId: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch, private: repo.private }));
	}

	const WEBHOOK_EVENTS = ['push', 'pull_request'];

	function webhookConfig(opts: { url: string; secret: string }) {
		return { url: opts.url, content_type: 'json', secret: opts.secret, insecure_ssl: '0' };
	}

	// AC-35: one hook covering both events GitHub's own webhook API lets bosun
	// subscribe to together, unlike Azure's one-subscription-per-event-type shape.
	// A 422 means a hook for this exact URL already exists — the caller
	// (`ensureGithubWebhookOnAttach`'s `createOrAdoptWebhook`) adopts it under a
	// fresh secret rather than treating that as a failure (AC-63).
	async function createWebhook(opts: { pat: string; fullName: string; url: string; secret: string }): Promise<{ githubWebhookId: number }> {
		const result = await call({
			method: 'POST',
			pat: opts.pat,
			url: `${API}/repos/${opts.fullName}/hooks`,
			body: { name: 'web', active: true, events: WEBHOOK_EVENTS, config: webhookConfig(opts) }
		});

		await throwOnKnownFailureStatus(result);

		if (result.status === 422) {
			throw new GithubPatError('webhook_exists', 'A webhook already exists for this URL');
		}

		if (result.status !== 201) {
			throw new GithubPatError('other', `GitHub answered ${result.status} creating the webhook`);
		}

		return { githubWebhookId: WebhookSchema.parse(result.json).id };
	}

	async function listWebhooks(opts: { pat: string; fullName: string }): Promise<{ id: number; url: string | null }[]> {
		const result = await call({ pat: opts.pat, url: `${API}/repos/${opts.fullName}/hooks?per_page=${PER_PAGE}` });

		await throwOnKnownFailureStatus(result);

		if (result.status !== 200) {
			throw new GithubPatError('other', `GitHub answered ${result.status} listing webhooks`);
		}

		return z.array(WebhookSchema).parse(result.json).map((hook) => ({ id: hook.id, url: hook.config?.url ?? null }));
	}

	// Reused by `createOrAdoptWebhook` to hand an already-existing hook a fresh
	// secret rather than deleting and recreating it.
	async function updateWebhookSecret(opts: { pat: string; fullName: string; webhookId: number; url: string; secret: string }): Promise<void> {
		const result = await call({
			method: 'PATCH',
			pat: opts.pat,
			url: `${API}/repos/${opts.fullName}/hooks/${opts.webhookId}`,
			body: { active: true, events: WEBHOOK_EVENTS, config: webhookConfig(opts) }
		});

		await throwOnKnownFailureStatus(result);

		if (result.status !== 200) {
			throw new GithubPatError('other', `GitHub answered ${result.status} updating the webhook`);
		}
	}

	// Null once the hook is already gone rather than 404ing the caller — used
	// from reconciliation's health check, where a missing hook and a disabled one
	// take the same recreate path (AC-38).
	async function getWebhook(opts: { pat: string; fullName: string; webhookId: number }): Promise<{ active: boolean } | null> {
		const result = await call({ pat: opts.pat, url: `${API}/repos/${opts.fullName}/hooks/${opts.webhookId}` });

		if (result.status === 404) {
			return null;
		}

		await throwOnKnownFailureStatus(result);

		if (result.status !== 200) {
			throw new GithubPatError('other', `GitHub answered ${result.status} reading the webhook`);
		}

		return { active: z.object({ active: z.boolean() }).parse(result.json).active };
	}

	// Best-effort, the same shape `azureDevOps.deleteSubscription` takes: called
	// only as a connection or a repository is already on its way out, where a
	// webhook GitHub refuses to delete is GitHub's own orphan to clean up, never
	// a reason to fail the disconnect or the switch that triggered it.
	async function deleteWebhook(opts: { pat: string; fullName: string; webhookId: number }): Promise<void> {
		await call({ method: 'DELETE', pat: opts.pat, url: `${API}/repos/${opts.fullName}/hooks/${opts.webhookId}` }).catch(() => undefined);
	}

	// One conditional GET per repository per poll (AC-40, AC-41): `etag` is what
	// the previous poll's response carried, sent back as `If-None-Match` so a
	// repository with no branch activity costs a 304 and nothing else. Only the
	// first 100 branches are read — the fallback path this exists for is meant to
	// cover ordinary repositories, and paging further would mean a second,
	// non-conditional call every cycle for the rare repository past that count.
	async function listBranchHeads(opts: { pat: string; fullName: string; etag: string | null }): Promise<{ etag: string; heads: { branch: string; sha: string }[] } | null> {
		const result = await call({
			pat: opts.pat,
			url: `${API}/repos/${opts.fullName}/branches?per_page=${PER_PAGE}`,
			headers: opts.etag === null ? {} : { 'if-none-match': opts.etag }
		});

		if (result.status === 304) {
			return null;
		}

		await throwOnKnownFailureStatus(result);

		if (result.status !== 200) {
			throw new GithubPatError('other', `GitHub answered ${result.status} listing branches`);
		}

		return {
			etag: result.headers.get('etag') ?? '',
			heads: z.array(BranchSchema).parse(result.json).map((branch) => ({ branch: branch.name, sha: branch.commit.sha }))
		};
	}

	return {
		listPushableRepositories,
		createWebhook,
		listWebhooks,
		updateWebhookSecret,
		getWebhook,
		deleteWebhook,
		listBranchHeads,

		// The whole validation chain a connect or rotate goes through: who the token
		// belongs to, what kind it is, and what it can push to — persisted only if
		// every step here succeeds (AC-3, AC-4, AC-5).
		async validateAndListRepositories(opts: { pat: string }): Promise<{
			githubLogin: string;
			tokenType: GithubTokenType;
			repositories: { githubRepoId: number; fullName: string; defaultBranch: string; private: boolean }[];
		}> {
			const user = await fetchUser(opts.pat);
			const repositories = await listPushableRepositories(opts.pat);

			if (repositories.length === 0) {
				throw new GithubPatError('no_repositories', "This token can't push to any repository.");
			}

			return { githubLogin: user.login, tokenType: user.tokenType, repositories };
		}
	};
}

export type GithubPatService = ReturnType<typeof getGithubPatService>;
