import { z } from 'zod';
import { detectGithubTokenKind, type GithubTokenType } from 'src/types/GithubPatSchema';

const API = 'https://api.github.com';
const PER_PAGE = 100;
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 20_000;

export type GithubPatErrorKind =
	| 'invalid_token'
	| 'missing_scope'
	| 'sso_required'
	| 'org_restricted'
	| 'pending_approval'
	| 'no_repositories'
	| 'unreachable'
	| 'other';

export class GithubPatError extends Error {
	public readonly kind: GithubPatErrorKind;
	// Set only for `sso_required` — the authorization link GitHub's own
	// `X-GitHub-SSO` header names, so the browser can send the person straight to it.
	public readonly ssoUrl?: string;

	constructor(kind: GithubPatErrorKind, message: string, opts?: { ssoUrl?: string }) {
		super(message);
		this.name = 'GithubPatError';
		this.kind = kind;
		this.ssoUrl = opts?.ssoUrl;
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

// `X-GitHub-SSO` looks like `required; url=https://github.com/orgs/acme/sso?...` —
// present only when the organization enforces SAML SSO and this token was never
// authorized for it (AC-8).
function parseSsoUrl(header: string | null): string | null {
	if (header === null) {
		return null;
	}

	const match = /url=(\S+)/.exec(header);

	return match?.[1] ?? null;
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

	async function call(opts: { url: string; pat: string }): Promise<{ status: number; json: unknown; headers: Headers }> {
		let response: Response;

		try {
			response = await fetchImpl(opts.url, {
				headers: {
					accept: 'application/vnd.github+json',
					'x-github-api-version': '2022-11-28',
					'user-agent': 'bosun',
					authorization: `Bearer ${opts.pat}`
				},
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

	return {
		listPushableRepositories,

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
