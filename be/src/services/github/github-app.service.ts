import crypto from 'crypto';
import { z } from 'zod';
import { parseSsoUrl } from 'src/services/github/parse-sso-url';

const API = 'https://api.github.com';
const OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const PER_PAGE = 100;
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 20_000;
// Refreshed well before GitHub would refuse it, so a token handed to a git
// credential helper does not expire halfway through a long push.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 30 * 60 * 1000;

export class GithubError extends Error {
	public readonly status: number;
	// Set only when GitHub's `X-GitHub-SSO` header names one — carried through so
	// a caller marking a PAT connection broken over this same error (a PR or
	// branch operation, not `github-pat.service.ts`'s own calls) can still surface
	// the authorization link, the same as a break noticed by that service would.
	public readonly ssoUrl?: string;

	constructor(status: number, message: string, opts?: { ssoUrl?: string }) {
		super(message);
		this.name = 'GithubError';
		this.status = status;
		this.ssoUrl = opts?.ssoUrl;
	}
}

type Permissions = Partial<Record<'contents' | 'pull_requests' | 'metadata', 'read' | 'write'>>;

const TokenRespSchema = z.object({ token: z.string(), expires_at: z.string() });

const UserInstallationsRespSchema = z.object({
	installations: z.array(z.object({ id: z.number(), account: z.object({ login: z.string().optional(), slug: z.string().optional() }).nullable() }))
});

const RepoSchema = z.object({
	id: z.number(),
	full_name: z.string(),
	default_branch: z.string(),
	private: z.boolean(),
	clone_url: z.string()
});

const InstallationReposRespSchema = z.object({ repositories: z.array(RepoSchema) });

const PullSchema = z.object({ number: z.number(), html_url: z.string() });

const GithubErrorBodySchema = z.object({
	message: z.string(),
	errors: z
		.array(
			z.union([
				z.string(),
				z.object({
					message: z.string().optional(),
					resource: z.string().optional(),
					field: z.string().optional(),
					code: z.string().optional()
				})
			])
		)
		.optional()
});

type GithubErrorEntry = NonNullable<z.infer<typeof GithubErrorBodySchema>['errors']>[number];

function describeGithubError(entry: GithubErrorEntry): string {
	if (typeof entry === 'string') {
		return entry;
	}

	return entry.message ?? [entry.resource, entry.field, entry.code].filter(Boolean).join(' ');
}

// "Validation Failed" alone names nothing to fix; the reason GitHub gives —
// "not all refs are readable", a field that is invalid — is in `errors`.
function githubReasons(json: unknown): { message: string; reasons: string[] } | null {
	const said = GithubErrorBodySchema.safeParse(json);

	if (!said.success) {
		return null;
	}

	return { message: said.data.message, reasons: (said.data.errors ?? []).map(describeGithubError).filter((reason) => reason !== '') };
}

const PullStateSchema = PullSchema.extend({
	state: z.enum(['open', 'closed']),
	merged: z.boolean().default(false),
	base: z.object({ ref: z.string(), sha: z.string() }),
	head: z.object({ ref: z.string(), sha: z.string() })
});

// `X-Hub-Signature-256` is `sha256=` and the hex HMAC of the raw body. Compared in
// constant time, over the bytes GitHub sent rather than a re-serialized parse.
export function verifyWebhookSignature(opts: { secret: string; payload: Buffer; signature: string | undefined }): boolean {
	if (!opts.signature?.startsWith('sha256=')) {
		return false;
	}

	const expected = crypto.createHmac('sha256', opts.secret).update(opts.payload).digest();
	const given = Buffer.from(opts.signature.slice('sha256='.length), 'hex');

	return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function base64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

// Env files carry a PEM either with real newlines or with `\n` escapes, and a
// key read the second way fails to parse with an error that says nothing useful.
export function normalizePrivateKey(raw: string): string {
	return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

// RS256 with node's own crypto. Backdated a minute for clock drift and kept under
// GitHub's ten-minute ceiling.
export function signAppJwt(opts: { appId: string; privateKey: string; now: number }): string {
	const seconds = Math.floor(opts.now / 1000);
	const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const body = base64url(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: opts.appId }));
	const signature = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.privateKey);

	return `${head}.${body}.${base64url(signature)}`;
}

function stateKey(clientSecret: string): Buffer {
	return crypto.createHash('sha256').update(`bosun:github-install-state:${clientSecret}`).digest();
}

export function signInstallState(opts: {
	clientSecret: string;
	userId: string;
	projectId: string;
	now: number;
}): string {
	const payload = base64url(JSON.stringify({ u: opts.userId, p: opts.projectId, e: opts.now + STATE_TTL_MS }));
	const mac = crypto.createHmac('sha256', stateKey(opts.clientSecret)).update(payload).digest('base64url');

	return `${payload}.${mac}`;
}

// A state names the person and the project it was issued for, so a callback link
// forwarded to somebody else — or replayed into another project — is refused.
export function verifyInstallState(opts: {
	clientSecret: string;
	state: string;
	userId: string;
	projectId: string;
	now: number;
}): boolean {
	const [payload, mac] = opts.state.split('.');

	if (!payload || !mac) {
		return false;
	}

	const expected = crypto.createHmac('sha256', stateKey(opts.clientSecret)).update(payload).digest();
	const given = Buffer.from(mac, 'base64url');

	if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
		return false;
	}

	const parsed = z
		.object({ u: z.string(), p: z.string(), e: z.number() })
		.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));

	return (
		parsed.success &&
		parsed.data.u === opts.userId &&
		parsed.data.p === opts.projectId &&
		parsed.data.e > opts.now
	);
}

// The only module that holds the App's private key. What it exposes is scoped by
// construction: minting names one repository, and every other call is made with
// a token minted that way. Nothing here lists or touches a repository outside an
// installation the caller already recorded.
export function getGithubAppService(deps: {
	appId: string;
	slug: string;
	clientId: string;
	clientSecret: string;
	privateKey: string;
	fetchImpl?: typeof fetch;
	now?: () => number;
}) {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const now = deps.now ?? Date.now;
	const privateKey = normalizePrivateKey(deps.privateKey);
	const tokens = new Map<string, { token: string; expiresAt: number }>();

	async function call(opts: {
		method?: string;
		url: string;
		token: string;
		scheme?: 'Bearer' | 'token';
		body?: unknown;
	}): Promise<{ status: number; json: unknown; headers: Headers }> {
		let response: Response;

		try {
			response = await fetchImpl(opts.url, {
				method: opts.method ?? 'GET',
				headers: {
					accept: 'application/vnd.github+json',
					'x-github-api-version': '2022-11-28',
					'user-agent': 'bosun',
					authorization: `${opts.scheme ?? 'Bearer'} ${opts.token}`,
					...(opts.body === undefined ? {} : { 'content-type': 'application/json' })
				},
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (error) {
			throw new GithubError(502, `Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`);
		}

		const json: unknown = await response.json().catch(() => null);

		return { status: response.status, json, headers: response.headers };
	}

	function failure(what: string, result: { status: number; json: unknown; headers: Headers }): GithubError {
		const said = githubReasons(result.json);
		const reasons = said === null || said.reasons.length === 0 ? '' : ` (${said.reasons.join('; ')})`;
		const ssoUrl = parseSsoUrl(result.headers.get('x-github-sso'));

		return new GithubError(
			result.status,
			`${what}: GitHub answered ${result.status}${said === null ? '' : ` — ${said.message}${reasons}`}`,
			ssoUrl === null ? undefined : { ssoUrl }
		);
	}

	async function mint(opts: {
		installationId: number;
		githubRepoIds?: number[];
		permissions: Permissions;
	}): Promise<{ token: string; expiresAt: number }> {
		const key = JSON.stringify([opts.installationId, opts.githubRepoIds ?? null, opts.permissions]);
		const cached = tokens.get(key);

		if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > now()) {
			return cached;
		}

		const result = await call({
			method: 'POST',
			url: `${API}/app/installations/${opts.installationId}/access_tokens`,
			token: signAppJwt({ appId: deps.appId, privateKey, now: now() }),
			body: {
				...(opts.githubRepoIds === undefined ? {} : { repository_ids: opts.githubRepoIds }),
				permissions: opts.permissions
			}
		});

		if (result.status !== 201) {
			throw failure('could not mint an installation token', result);
		}

		const parsed = TokenRespSchema.parse(result.json);
		const minted = { token: parsed.token, expiresAt: Date.parse(parsed.expires_at) };

		tokens.set(key, minted);

		return minted;
	}

	async function paginate<T>(opts: {
		url: string;
		token: string;
		read: (json: unknown) => T[];
	}): Promise<T[]> {
		const all: T[] = [];

		for (let page = 1; page <= MAX_PAGES; page += 1) {
			const separator = opts.url.includes('?') ? '&' : '?';
			const result = await call({ url: `${opts.url}${separator}per_page=${PER_PAGE}&page=${page}`, token: opts.token });

			if (result.status !== 200) {
				throw failure(`could not read ${opts.url.replace(API, '')}`, result);
			}

			const items = opts.read(result.json);

			all.push(...items);

			if (items.length < PER_PAGE) {
				break;
			}
		}

		return all;
	}

	// Every metadata-only read (this, and the repo lookup every write below opens
	// with) rides whatever token the caller already resolved — `metadata: read` is
	// granted to every installation token regardless of its other permissions, so
	// there is nothing narrower to mint here.
	async function repository(opts: { token: string; githubRepoId: number }) {
		const result = await call({ url: `${API}/repositories/${opts.githubRepoId}`, token: opts.token });

		if (result.status !== 200) {
			throw failure('could not read the repository', result);
		}

		return RepoSchema.parse(result.json);
	}

	async function openOrUpdatePullRequest(opts: {
		token: string;
		githubRepoId: number;
		head: string;
		base: string;
		title: string;
		body: string;
	}): Promise<{ url: string; number: number; updated: boolean }> {
		const { token } = opts;
		const repo = await repository(opts);
		const created = await call({
			method: 'POST',
			url: `${API}/repos/${repo.full_name}/pulls`,
			token,
			body: { title: opts.title, head: opts.head, base: opts.base, body: opts.body }
		});

		if (created.status === 201) {
			const pull = PullSchema.parse(created.json);

			return { url: pull.html_url, number: pull.number, updated: false };
		}

		// The same re-run behaviour `gh pr create` had: a pull request already open
		// for the branch describes the run before this one, so its body is replaced.
		const owner = repo.full_name.split('/')[0];
		const open = await call({
			url: `${API}/repos/${repo.full_name}/pulls?state=open&head=${encodeURIComponent(`${owner}:${opts.head}`)}`,
			token
		});
		const existing = open.status === 200 ? z.array(PullSchema).parse(open.json)[0] : undefined;

		if (!existing) {
			throw failure('could not open the pull request', created);
		}

		const edited = await call({
			method: 'PATCH',
			url: `${API}/repos/${repo.full_name}/pulls/${existing.number}`,
			token,
			body: { body: opts.body, base: opts.base }
		});

		if (edited.status !== 200) {
			throw failure('the pull request is open but its description could not be updated', edited);
		}

		return { url: existing.html_url, number: existing.number, updated: true };
	}

	async function getPullRequest(opts: { token: string; githubRepoId: number; number: number }) {
		const result = await call({
			url: `${API}/repositories/${opts.githubRepoId}/pulls/${opts.number}`,
			token: opts.token
		});

		if (result.status !== 200) {
			throw failure(`could not read pull request #${opts.number}`, result);
		}

		const pull = PullStateSchema.parse(result.json);

		return {
			number: pull.number,
			url: pull.html_url,
			state: pull.state,
			merged: pull.merged,
			baseRef: pull.base.ref,
			baseSha: pull.base.sha,
			headRef: pull.head.ref
		};
	}

	async function editPullRequest(opts: {
		token: string;
		githubRepoId: number;
		number: number;
		base?: string;
		body?: string;
	}): Promise<void> {
		const result = await call({
			method: 'PATCH',
			url: `${API}/repositories/${opts.githubRepoId}/pulls/${opts.number}`,
			token: opts.token,
			body: { ...(opts.base === undefined ? {} : { base: opts.base }), ...(opts.body === undefined ? {} : { body: opts.body }) }
		});

		if (result.status !== 200) {
			throw failure(`could not update pull request #${opts.number}`, result);
		}
	}

	// Created, or force-moved when it already exists: re-shipping a foundation after
	// its bullet was re-run points the branch at the new commit.
	async function pointBranch(opts: { token: string; githubRepoId: number; branch: string; sha: string }): Promise<void> {
		const { token } = opts;
		const repo = await repository(opts);
		const created = await call({
			method: 'POST',
			url: `${API}/repos/${repo.full_name}/git/refs`,
			token,
			body: { ref: `refs/heads/${opts.branch}`, sha: opts.sha }
		});

		if (created.status === 201) {
			return;
		}

		const moved = await call({
			method: 'PATCH',
			url: `${API}/repos/${repo.full_name}/git/refs/heads/${opts.branch}`,
			token,
			body: { sha: opts.sha, force: true }
		});

		if (moved.status !== 200) {
			throw failure(`could not point ${opts.branch} at ${opts.sha.slice(0, 8)}`, moved);
		}
	}

	return {
		installUrl(state: string): string {
			return `https://github.com/apps/${encodeURIComponent(deps.slug)}/installations/new?state=${encodeURIComponent(state)}`;
		},

		// Authorization alone, with no install page in between. It is how an App that
		// is already installed on an account gets connected: GitHub answers the install
		// page for such an account with its settings, which never redirect back here.
		authorizeUrl(state: string): string {
			return `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(deps.clientId)}&state=${encodeURIComponent(state)}`;
		},

		signState(opts: { userId: string; projectId: string }): string {
			return signInstallState({ ...opts, clientSecret: deps.clientSecret, now: now() });
		},

		verifyState(opts: { state: string; userId: string; projectId: string }): boolean {
			try {
				return verifyInstallState({ ...opts, clientSecret: deps.clientSecret, now: now() });
			} catch {
				return false;
			}
		},

		// The installing user's own authorization is the proof. The token is used for
		// this one listing and goes out of scope with the function.
		async installationsForCode(code: string): Promise<{ installationId: number; accountLogin: string }[]> {
			const response = await fetchImpl(OAUTH_TOKEN_URL, {
				method: 'POST',
				headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'bosun' },
				body: JSON.stringify({ client_id: deps.clientId, client_secret: deps.clientSecret, code }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
			const exchanged = z
				.object({ access_token: z.string() })
				.safeParse(await response.json().catch(() => null));

			if (!exchanged.success) {
				throw new GithubError(401, 'GitHub did not accept the authorization code — start the connection again');
			}

			const installations = await paginate({
				url: `${API}/user/installations`,
				token: exchanged.data.access_token,
				read: (json) => UserInstallationsRespSchema.parse(json).installations
			});

			return installations.map((installation) => ({
				installationId: installation.id,
				accountLogin: installation.account?.login ?? installation.account?.slug ?? String(installation.id)
			}));
		},

		async listRepositories(installationId: number) {
			const { token } = await mint({ installationId, permissions: { metadata: 'read' } });
			const repos = await paginate({
				url: `${API}/installation/repositories`,
				token,
				read: (json) => InstallationReposRespSchema.parse(json).repositories
			});

			return repos.map((repo) => ({
				githubRepoId: repo.id,
				fullName: repo.full_name,
				defaultBranch: repo.default_branch,
				private: repo.private
			}));
		},

		async getRepository(opts: { token: string; githubRepoId: number }) {
			const repo = await repository(opts);

			return { fullName: repo.full_name, defaultBranch: repo.default_branch, cloneUrl: repo.clone_url };
		},

		// Null when the file is not there.
		async readFile(opts: {
			token: string;
			githubRepoId: number;
			path: string;
			ref: string;
		}): Promise<string | null> {
			const result = await call({
				url: `${API}/repositories/${opts.githubRepoId}/contents/${opts.path}?ref=${encodeURIComponent(opts.ref)}`,
				token: opts.token
			});

			if (result.status === 404) {
				return null;
			}

			const file = z.object({ content: z.string(), encoding: z.literal('base64') }).safeParse(result.json);

			if (result.status !== 200 || !file.success) {
				throw failure(`could not read ${opts.path}`, result);
			}

			return Buffer.from(file.data.content, 'base64').toString('utf8');
		},

		// The narrowest mint this module offers: read-only, for a caller that only
		// needs to confirm a repository is still reachable (the attach flow's
		// defensive re-check) without any of the write access `installationToken`
		// below carries.
		async metadataToken(opts: { installationId: number; githubRepoId: number }): Promise<string> {
			const { token } = await mint({
				installationId: opts.installationId,
				githubRepoIds: [opts.githubRepoId],
				permissions: { metadata: 'read' }
			});

			return token;
		},

		// What a machine's git credential helper receives: one repository, contents
		// write, and nothing broader.
		async repositoryToken(opts: { installationId: number; githubRepoId: number }): Promise<{ token: string; expiresAt: Date }> {
			const minted = await mint({
				installationId: opts.installationId,
				githubRepoIds: [opts.githubRepoId],
				permissions: { contents: 'write' }
			});

			return { token: minted.token, expiresAt: new Date(minted.expiresAt) };
		},

		// What every other call in this module takes once resolved: pull requests
		// (read and write) plus contents (read and write) on one repository — the
		// union every operation below needs, since GitHub scopes "Pull requests" and
		// "Contents" separately and a token minted for one alone is refused calling
		// the other ("not all refs are readable" on a pull-requests-only token, a
		// plain 403 on a contents-only one calling `/pulls`). `repositoryToken`
		// above stays on its own, narrower mint: a machine's git credential has no
		// business calling the Pulls API at all.
		async installationToken(opts: { installationId: number; githubRepoId: number }): Promise<string> {
			const { token } = await mint({
				installationId: opts.installationId,
				githubRepoIds: [opts.githubRepoId],
				permissions: { contents: 'write', pull_requests: 'write' }
			});

			return token;
		},

		openOrUpdatePullRequest,
		getPullRequest,
		editPullRequest,
		pointBranch,

		// A branch cut from the default branch holding exactly one commit that writes
		// one file. Force-moved back to the base first, so re-proposing after an edit
		// never stacks a second commit or carries anything else along.
		async proposeFile(opts: {
			token: string;
			githubRepoId: number;
			branch: string;
			path: string;
			content: string;
			message: string;
			title: string;
			body: string;
		}): Promise<{ url: string }> {
			const { token } = opts;
			const repo = await repository(opts);
			const base = await call({ url: `${API}/repos/${repo.full_name}/git/ref/heads/${repo.default_branch}`, token });

			if (base.status !== 200) {
				throw failure(`could not read ${repo.default_branch}`, base);
			}

			const sha = z.object({ object: z.object({ sha: z.string() }) }).parse(base.json).object.sha;
			const created = await call({
				method: 'POST',
				url: `${API}/repos/${repo.full_name}/git/refs`,
				token,
				body: { ref: `refs/heads/${opts.branch}`, sha }
			});

			if (created.status !== 201) {
				const moved = await call({
					method: 'PATCH',
					url: `${API}/repos/${repo.full_name}/git/refs/heads/${opts.branch}`,
					token,
					body: { sha, force: true }
				});

				if (moved.status !== 200) {
					throw failure(`could not create ${opts.branch}`, moved);
				}
			}

			const current = await call({
				url: `${API}/repos/${repo.full_name}/contents/${opts.path}?ref=${encodeURIComponent(opts.branch)}`,
				token
			});
			const existingSha = current.status === 200 ? z.object({ sha: z.string() }).safeParse(current.json) : null;
			const written = await call({
				method: 'PUT',
				url: `${API}/repos/${repo.full_name}/contents/${opts.path}`,
				token,
				body: {
					message: opts.message,
					content: Buffer.from(opts.content, 'utf8').toString('base64'),
					branch: opts.branch,
					...(existingSha?.success ? { sha: existingSha.data.sha } : {})
				}
			});

			if (written.status !== 200 && written.status !== 201) {
				throw failure(`could not write ${opts.path}`, written);
			}

			const pull = await openOrUpdatePullRequest({
				token,
				githubRepoId: opts.githubRepoId,
				head: opts.branch,
				base: repo.default_branch,
				title: opts.title,
				body: opts.body
			});

			return { url: pull.url };
		}
	};
}

export type GithubAppService = ReturnType<typeof getGithubAppService>;
