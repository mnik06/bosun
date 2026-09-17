import { z } from 'zod';
import { azureCloneUrl, azureRepositoryFullName, stripRefsHeadsPrefix, type AvailableAzureRepository } from 'src/types/AzureSchema';

const API_VERSION = '7.1';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PAGES = 20;
// The value the Refs/Pushes APIs use to mean "this ref does not exist yet" —
// Azure's equivalent of git's own all-zero parent for a brand-new branch.
const ZERO_SHA = '0000000000000000000000000000000000000000';

export type AzureErrorKind = 'invalid_token' | 'missing_scope' | 'unreachable' | 'invalid_response' | 'rate_limited' | 'other';

export class AzureError extends Error {
	public readonly kind: AzureErrorKind;
	// Set only for `rate_limited` — the `Retry-After` header, in milliseconds.
	public readonly retryAfterMs?: number;

	constructor(kind: AzureErrorKind, message: string, opts?: { retryAfterMs?: number }) {
		super(message);
		this.name = 'AzureError';
		this.kind = kind;
		this.retryAfterMs = opts?.retryAfterMs;
	}
}

const DEFAULT_RETRY_AFTER_MS = 60_000;

const ProjectSchema = z.object({ id: z.string(), name: z.string() });

const ProjectsRespSchema = z.object({ value: z.array(ProjectSchema) });

const RepoSchema = z.object({
	id: z.string(),
	name: z.string(),
	defaultBranch: z.string().optional(),
	isDisabled: z.boolean().optional(),
	project: z.object({ id: z.string(), name: z.string(), visibility: z.string().optional() })
});

const ReposRespSchema = z.object({ value: z.array(RepoSchema) });

const RefSchema = z.object({ name: z.string(), objectId: z.string() });

const RefsRespSchema = z.object({ value: z.array(RefSchema) });

const RefUpdateResultSchema = z.object({ name: z.string(), success: z.boolean().optional(), updateStatus: z.string().optional() });

const RefUpdateRespSchema = z.object({ value: z.array(RefUpdateResultSchema) });

const ItemSchema = z.object({ content: z.string().optional() });

const CommitRefSchema = z.object({ commitId: z.string() });

const PullRequestSchema = z.object({
	pullRequestId: z.number(),
	status: z.enum(['active', 'completed', 'abandoned', 'notSet']),
	sourceRefName: z.string(),
	targetRefName: z.string(),
	lastMergeTargetCommit: CommitRefSchema.optional()
});

const PullRequestsRespSchema = z.object({ value: z.array(PullRequestSchema) });

// Everything the service itself can know about a repository — it is asked for by
// organization and PAT alone, with no notion of which bosun connection row that
// pair belongs to. The caller (list-available-azure-repositories, which does
// know the connection) fills that field in, the same way `listAvailableRepositories`
// stamps GitHub's `installationId` onto what `githubApp.listRepositories` returns.
export type AzureRepoListing = Omit<AvailableAzureRepository, 'azureConnectionId'>;

function authHeader(pat: string): string {
	return `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
}

function apiUrl(opts: { organization: string; path: string; query?: Record<string, string> }): string {
	const url = new URL(`https://dev.azure.com/${encodeURIComponent(opts.organization)}${opts.path}`);

	url.searchParams.set('api-version', API_VERSION);

	for (const [key, value] of Object.entries(opts.query ?? {})) {
		url.searchParams.set(key, value);
	}

	return url.toString();
}

// Azure's item paths are rooted (`/path/to/file`); bosun's own config path constant
// is stored without the leading slash, the same way GitHub's contents API takes it.
function itemPath(path: string): string {
	return path.startsWith('/') ? path : `/${path}`;
}

interface RepositoryScope {
	organization: string;
	pat: string;
	azureProjectId: string;
	azureRepoId: string;
}

function rateLimitError(headers: Headers): AzureError {
	const retryAfter = Number(headers.get('retry-after'));

	return new AzureError('rate_limited', 'Azure DevOps is rate-limiting this connection', {
		retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_AFTER_MS
	});
}

// Checked ahead of everything else — a caller told to back off (429) should
// never also be told its token is bad, and a dead token (401) is worth its own
// message distinct from one merely missing a scope (403) (AC-3, AC-4, AC-75).
function throwOnKnownFailureStatus(response: Response): void {
	if (response.status === 429) {
		throw rateLimitError(response.headers);
	}

	if (response.status === 401) {
		throw new AzureError('invalid_token', 'This token is invalid or expired.');
	}

	if (response.status === 403) {
		throw new AzureError(
			'missing_scope',
			'This token is missing a required scope — grant it Code (Read & Write) and the service hooks scope for this organization.'
		);
	}
}

// Azure's other known failure shape for a dead token: an HTML sign-in page
// instead of the JSON every real response carries, even on a 200 — this is
// what tells a caller downstream apart from an ordinary parse bug (AC-70).
async function parseJsonBody(response: Response): Promise<unknown> {
	const text = await response.text();

	if (text.length === 0) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new AzureError('invalid_response', 'Azure DevOps did not return JSON — the token may be invalid');
	}
}

// One error type for every failure a caller needs to tell apart: an invalid or
// expired token, one missing a required scope, and an organization bosun's IP
// cannot reach — the three messages AC-3/4/5 ask for, decided here rather than
// re-derived at each call site.
export function getAzureDevOpsService(deps: { fetchImpl?: typeof fetch }) {
	const fetchImpl = deps.fetchImpl ?? fetch;

	async function call(opts: {
		url: string;
		pat: string;
		method?: string;
		body?: unknown;
		// Statuses the caller wants back instead of a thrown `AzureError` — a 404 on
		// a file read that may legitimately not exist, or a 409 a create-pull-request
		// race is about to retry.
		allow?: number[];
	}): Promise<{ status: number; json: unknown; headers: Headers }> {
		let response: Response;

		try {
			response = await fetchImpl(opts.url, {
				method: opts.method ?? 'GET',
				headers: {
					accept: 'application/json',
					authorization: authHeader(opts.pat),
					'user-agent': 'bosun',
					...(opts.body === undefined ? {} : { 'content-type': 'application/json' })
				},
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (error) {
			throw new AzureError('unreachable', `Could not reach that organization: ${error instanceof Error ? error.message : String(error)}`);
		}

		throwOnKnownFailureStatus(response);

		const json = await parseJsonBody(response);
		const allowed = opts.allow ?? [];

		if (!response.ok && !allowed.includes(response.status)) {
			throw new AzureError('other', `Azure DevOps answered ${response.status}${json === null ? '' : ` — ${JSON.stringify(json)}`}`);
		}

		return { status: response.status, json, headers: response.headers };
	}

	// Prefixes a caught `AzureError` with what bosun was trying to do, the same
	// role `failure()` plays in `github-app.service.ts` — everything else about the
	// error (its `kind`, its being an `AzureError` at all) passes through untouched.
	async function withContext<T>(what: string, run: () => Promise<T>): Promise<T> {
		try {
			return await run();
		} catch (error) {
			if (error instanceof AzureError) {
				throw new AzureError(error.kind, `${what}: ${error.message}`, { retryAfterMs: error.retryAfterMs });
			}

			throw error;
		}
	}

	function repositoryPath(opts: RepositoryScope): string {
		return `/${encodeURIComponent(opts.azureProjectId)}/_apis/git/repositories/${encodeURIComponent(opts.azureRepoId)}`;
	}

	async function fetchRepo(opts: RepositoryScope) {
		const result = await call({ pat: opts.pat, url: apiUrl({ organization: opts.organization, path: repositoryPath(opts) }) });

		return RepoSchema.parse(result.json);
	}

	function cloneUrlOf(opts: { organization: string }, repo: z.infer<typeof RepoSchema>): string {
		return azureCloneUrl({ organization: opts.organization, projectName: repo.project.name, repoName: repo.name });
	}

	function pullRequestUrl(opts: { cloneUrl: string; pullRequestId: number }): string {
		return `${opts.cloneUrl}/pullrequest/${opts.pullRequestId}`;
	}

	async function currentRefSha(opts: RepositoryScope & { branch: string }): Promise<string | null> {
		const result = await call({
			pat: opts.pat,
			url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/refs`, query: { filter: `heads/${opts.branch}` } })
		});
		const refs = RefsRespSchema.parse(result.json).value;

		return refs.find((ref) => ref.name === `refs/heads/${opts.branch}`)?.objectId ?? null;
	}

	// Created, or force-moved when it already exists: re-shipping a foundation after
	// its bullet was re-run points the branch at the new commit, the same job
	// `githubApp.pointBranch` does with a create-then-PATCH pair. Azure's single
	// Update Refs call does both, keyed off whatever the branch's current object id
	// is (or the all-zero id when it does not exist yet).
	async function pointBranch(opts: RepositoryScope & { branch: string; sha: string }): Promise<void> {
		return withContext(`could not point ${opts.branch} at ${opts.sha.slice(0, 8)}`, async () => {
			const oldObjectId = (await currentRefSha(opts)) ?? ZERO_SHA;
			const result = await call({
				method: 'POST',
				pat: opts.pat,
				url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/refs` }),
				body: [{ name: `refs/heads/${opts.branch}`, oldObjectId, newObjectId: opts.sha }]
			});
			const updated = RefUpdateRespSchema.parse(result.json).value.find((ref) => ref.name === `refs/heads/${opts.branch}`);

			if (!updated?.success) {
				throw new AzureError('other', `Azure DevOps refused the ref update${updated?.updateStatus ? ` (${updated.updateStatus})` : ''}`);
			}
		});
	}

	// Shared by `readFile` (which wants the content back) and `proposeFile` (which
	// only needs to know whether the file exists at the parent commit, to pick
	// `add` versus `edit`) — a 404 is returned rather than thrown either way.
	async function getItem(opts: RepositoryScope & { path: string; ref: string; includeContent?: boolean }) {
		return call({
			pat: opts.pat,
			allow: [404],
			url: apiUrl({
				organization: opts.organization,
				path: `${repositoryPath(opts)}/items`,
				query: {
					path: itemPath(opts.path),
					'versionDescriptor.version': opts.ref,
					'versionDescriptor.versionType': 'branch',
					...(opts.includeContent ? { includeContent: 'true', $format: 'json' } : {})
				}
			})
		});
	}

	// Null when the file is not there. Azure returns the raw text content directly
	// on the item when `includeContent` is set, the same shape a repository config
	// read expects from every provider.
	async function readFile(opts: RepositoryScope & { path: string; ref: string }): Promise<string | null> {
		return withContext(`could not read ${opts.path}`, async () => {
			const result = await getItem({ ...opts, includeContent: true });

			if (result.status === 404) {
				return null;
			}

			const file = ItemSchema.safeParse(result.json);

			if (!file.success || file.data.content === undefined) {
				throw new AzureError('other', 'Azure DevOps did not return the file content');
			}

			return file.data.content;
		});
	}

	async function findActivePullRequest(opts: RepositoryScope & { head: string; base: string }) {
		const result = await call({
			pat: opts.pat,
			url: apiUrl({
				organization: opts.organization,
				path: `${repositoryPath(opts)}/pullrequests`,
				query: {
					'searchCriteria.sourceRefName': `refs/heads/${opts.head}`,
					'searchCriteria.targetRefName': `refs/heads/${opts.base}`,
					'searchCriteria.status': 'active'
				}
			})
		});

		return PullRequestsRespSchema.parse(result.json).value[0] ?? null;
	}

	async function updatePullRequestDescription(opts: RepositoryScope & { pullRequestId: number; title: string; body: string }): Promise<void> {
		await call({
			method: 'PATCH',
			pat: opts.pat,
			url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/pullrequests/${opts.pullRequestId}` }),
			body: { title: opts.title, description: opts.body }
		});
	}

	// AC-43/44: an existing active pull request for the same source and target is
	// found first — Azure has no equivalent of GitHub's "create, then fall back to
	// the one already open" 422, so the check happens up front. The `allow: [409]`
	// on create covers the race where one appears between that check and this call.
	async function openOrUpdatePullRequest(
		opts: RepositoryScope & { head: string; base: string; title: string; body: string }
	): Promise<{ url: string; number: number; updated: boolean }> {
		return withContext('could not open the pull request', async () => {
			const repo = await fetchRepo(opts);
			const cloneUrl = cloneUrlOf(opts, repo);
			const existing = await findActivePullRequest(opts);

			if (existing) {
				await updatePullRequestDescription({ ...opts, pullRequestId: existing.pullRequestId, title: opts.title, body: opts.body });

				return { url: pullRequestUrl({ cloneUrl, pullRequestId: existing.pullRequestId }), number: existing.pullRequestId, updated: true };
			}

			const created = await call({
				method: 'POST',
				pat: opts.pat,
				allow: [409],
				url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/pullrequests` }),
				body: { sourceRefName: `refs/heads/${opts.head}`, targetRefName: `refs/heads/${opts.base}`, title: opts.title, description: opts.body }
			});

			if (created.status === 201) {
				const pull = PullRequestSchema.parse(created.json);

				return { url: pullRequestUrl({ cloneUrl, pullRequestId: pull.pullRequestId }), number: pull.pullRequestId, updated: false };
			}

			// Lost the race: a pull request for this pair appeared between the search
			// above and the create just refused above.
			const raced = await findActivePullRequest(opts);

			if (!raced) {
				throw new AzureError('other', `Azure DevOps answered ${created.status} creating the pull request`);
			}

			await updatePullRequestDescription({ ...opts, pullRequestId: raced.pullRequestId, title: opts.title, body: opts.body });

			return { url: pullRequestUrl({ cloneUrl, pullRequestId: raced.pullRequestId }), number: raced.pullRequestId, updated: true };
		});
	}

	async function getPullRequest(opts: RepositoryScope & { number: number }) {
		return withContext(`could not read pull request !${opts.number}`, async () => {
			const [result, repo] = await Promise.all([
				call({ pat: opts.pat, url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/pullrequests/${opts.number}` }) }),
				fetchRepo(opts)
			]);
			const pull = PullRequestSchema.parse(result.json);
			const baseRef = stripRefsHeadsPrefix(pull.targetRefName);
			const baseSha = pull.lastMergeTargetCommit?.commitId ?? (await currentRefSha({ ...opts, branch: baseRef })) ?? '';

			return {
				number: pull.pullRequestId,
				url: pullRequestUrl({ cloneUrl: cloneUrlOf(opts, repo), pullRequestId: pull.pullRequestId }),
				state: (pull.status === 'active' ? 'open' : 'closed') as 'open' | 'closed',
				merged: pull.status === 'completed',
				baseRef,
				baseSha,
				headRef: stripRefsHeadsPrefix(pull.sourceRefName)
			};
		});
	}

	async function editPullRequest(opts: RepositoryScope & { number: number; base?: string; body?: string }): Promise<void> {
		return withContext(`could not update pull request !${opts.number}`, async () => {
			await call({
				method: 'PATCH',
				pat: opts.pat,
				url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/pullrequests/${opts.number}` }),
				body: {
					...(opts.base === undefined ? {} : { targetRefName: `refs/heads/${opts.base}` }),
					...(opts.body === undefined ? {} : { description: opts.body })
				}
			});
		});
	}

	// A branch cut from the default branch holding exactly one commit that writes
	// one file, same as `githubApp.proposeFile` — but Azure's Pushes API creates the
	// ref and the commit in one call when the branch does not exist yet, so the
	// first-time onboarding path never needs the separate ref-create step GitHub
	// does. Re-proposing after an edit still force-moves the branch back onto the
	// default branch first (one extra call), so it never stacks a second commit or
	// carries anything else along.
	async function proposeFile(
		opts: RepositoryScope & { branch: string; path: string; content: string; message: string; title: string; body: string }
	): Promise<{ url: string }> {
		return withContext(`could not create ${opts.branch}`, async () => {
			const repo = await fetchRepo(opts);
			const defaultBranch = stripRefsHeadsPrefix(repo.defaultBranch ?? 'refs/heads/main');
			const parentSha = await currentRefSha({ ...opts, branch: defaultBranch });

			if (parentSha === null) {
				throw new AzureError('other', `could not read the current tip of ${defaultBranch}`);
			}

			const existingBranchSha = await currentRefSha({ ...opts, branch: opts.branch });

			if (existingBranchSha !== null) {
				await pointBranch({ ...opts, sha: parentSha });
			}

			const existingItem = await getItem({ ...opts, ref: defaultBranch });
			const pushed = await call({
				method: 'POST',
				pat: opts.pat,
				url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/pushes` }),
				body: {
					refUpdates: [{ name: `refs/heads/${opts.branch}`, oldObjectId: parentSha }],
					commits: [
						{
							comment: opts.message,
							changes: [
								{
									changeType: existingItem.status === 404 ? 'add' : 'edit',
									item: { path: itemPath(opts.path) },
									newContent: { content: opts.content, contentType: 'rawtext' }
								}
							]
						}
					]
				}
			});

			if (pushed.status !== 201) {
				throw new AzureError('other', `Azure DevOps answered ${pushed.status} pushing the commit`);
			}

			const pull = await openOrUpdatePullRequest({ ...opts, head: opts.branch, base: defaultBranch, title: opts.title, body: opts.body });

			return { url: pull.url };
		});
	}

	async function listProjects(opts: { organization: string; pat: string }): Promise<{ id: string; name: string }[]> {
		const projects: { id: string; name: string }[] = [];
		let continuationToken: string | undefined;

		for (let page = 0; page < MAX_PAGES; page += 1) {
			const result = await call({
				pat: opts.pat,
				url: apiUrl({
					organization: opts.organization,
					path: '/_apis/projects',
					query: { $top: '100', ...(continuationToken ? { continuationToken } : {}) }
				})
			});

			projects.push(...ProjectsRespSchema.parse(result.json).value);

			continuationToken = result.headers.get('x-ms-continuationtoken') ?? undefined;

			if (!continuationToken) {
				break;
			}
		}

		return projects;
	}

	async function listRepositoriesForProject(opts: { organization: string; pat: string; project: { id: string; name: string } }): Promise<AzureRepoListing[]> {
		const result = await call({
			pat: opts.pat,
			url: apiUrl({ organization: opts.organization, path: `/${encodeURIComponent(opts.project.name)}/_apis/git/repositories` })
		});
		const repos = ReposRespSchema.parse(result.json).value;

		return repos
			.filter((repo) => !repo.isDisabled)
			.map((repo) => ({
				organization: opts.organization,
				azureProjectId: repo.project.id,
				azureProjectName: repo.project.name,
				azureRepoId: repo.id,
				fullName: azureRepositoryFullName({ organization: opts.organization, projectName: repo.project.name, repoName: repo.name }),
				defaultBranch: stripRefsHeadsPrefix(repo.defaultBranch ?? 'refs/heads/main'),
				cloneUrl: azureCloneUrl({ organization: opts.organization, projectName: repo.project.name, repoName: repo.name }),
				private: repo.project.visibility !== 'public'
			}));
	}

	// Every repository the PAT can see, across every project in the organization —
	// there is no single "list repositories in an org" endpoint on Azure DevOps, so
	// this is the projects list fanned out into one repositories call each. Also
	// what proves the PAT works: a token that fails here never reaches storage.
	async function listRepositories(opts: { organization: string; pat: string }): Promise<AzureRepoListing[]> {
		const projects = await listProjects(opts);
		const perProject = await Promise.all(
			projects.map((project) => listRepositoriesForProject({ organization: opts.organization, pat: opts.pat, project }))
		);

		return perProject.flat().sort((a, b) => a.fullName.localeCompare(b.fullName));
	}

	const SubscriptionSchema = z.object({ id: z.string(), status: z.string().optional() });

	// One subscription per event type — Azure has no "create both" call, and no
	// way to update an existing subscription's consumer secret, so the caller
	// (`ensureAzureWebhookSubscriptionsOnAttach` / its reconcile sibling) always
	// creates the pair together under one fresh secret rather than patching one.
	async function createSubscription(
		opts: RepositoryScope & { eventType: 'git.push' | 'git.pullrequest.updated'; url: string; secret: string }
	): Promise<{ azureSubscriptionId: string }> {
		return withContext(`could not create the ${opts.eventType} subscription`, async () => {
			const publisherInputs: Record<string, string> = { projectId: opts.azureProjectId, repository: opts.azureRepoId };

			if (opts.eventType === 'git.pullrequest.updated') {
				// AC-53: only a status change (active/completed/abandoned), never every
				// review comment or reviewer vote Azure could otherwise deliver.
				publisherInputs.notificationType = 'StatusUpdateNotification';
			}

			const result = await call({
				method: 'POST',
				pat: opts.pat,
				url: apiUrl({ organization: opts.organization, path: '/_apis/hooks/subscriptions' }),
				body: {
					publisherId: 'tfs',
					eventType: opts.eventType,
					resourceVersion: '1.0',
					consumerId: 'webHooks',
					consumerActionId: 'httpRequest',
					publisherInputs,
					consumerInputs: { url: opts.url, httpHeaders: `X-Bosun-Azure-Secret: ${opts.secret}` }
				}
			});

			return { azureSubscriptionId: SubscriptionSchema.parse(result.json).id };
		});
	}

	// 'missing' covers a 404 as well as a subscription id Azure no longer
	// recognizes at all — both mean the same thing to a caller deciding whether
	// to recreate it (AC-64).
	async function getSubscriptionStatus(opts: { organization: string; pat: string; azureSubscriptionId: string }): Promise<'enabled' | 'disabled' | 'onProbation' | 'missing'> {
		return withContext('could not read the subscription status', async () => {
			const result = await call({
				pat: opts.pat,
				allow: [404],
				url: apiUrl({ organization: opts.organization, path: `/_apis/hooks/subscriptions/${encodeURIComponent(opts.azureSubscriptionId)}` })
			});

			if (result.status === 404) {
				return 'missing';
			}

			const status = SubscriptionSchema.parse(result.json).status;

			if (status === 'disabledBySystem' || status === 'disabledByUser') {
				return 'disabled';
			}

			return status === 'onProbation' ? 'onProbation' : 'enabled';
		});
	}

	// Every branch's current tip in one call — what the polling half of sync
	// (AC-66) diffs against its previous snapshot, so a webhook nobody heard from
	// is never the only way a push is noticed.
	async function listBranchHeads(opts: RepositoryScope): Promise<{ branch: string; sha: string }[]> {
		return withContext('could not read branch refs', async () => {
			const result = await call({
				pat: opts.pat,
				url: apiUrl({ organization: opts.organization, path: `${repositoryPath(opts)}/refs`, query: { filter: 'heads/' } })
			});

			return RefsRespSchema.parse(result.json)
				.value.filter((ref) => ref.name.startsWith('refs/heads/'))
				.map((ref) => ({ branch: stripRefsHeadsPrefix(ref.name), sha: ref.objectId }));
		});
	}

	return {
		listRepositories,
		createSubscription,
		getSubscriptionStatus,
		listBranchHeads,

		async getRepository(opts: RepositoryScope) {
			const repo = await fetchRepo(opts);

			return {
				fullName: azureRepositoryFullName({ organization: opts.organization, projectName: repo.project.name, repoName: repo.name }),
				defaultBranch: stripRefsHeadsPrefix(repo.defaultBranch ?? 'refs/heads/main'),
				cloneUrl: cloneUrlOf(opts, repo)
			};
		},

		readFile,
		proposeFile,
		pointBranch,
		openOrUpdatePullRequest,
		getPullRequest,
		editPullRequest,

		// Best-effort on purpose — called only from disconnect, where the connection
		// (and the PAT that authorized creating this subscription) is already on its
		// way out. A subscription Azure refuses to delete is Azure's orphan to clean
		// up, not a reason to fail the disconnect the leader asked for.
		async deleteSubscription(opts: { organization: string; pat: string; azureSubscriptionId: string }): Promise<void> {
			await call({
				pat: opts.pat,
				method: 'DELETE',
				url: apiUrl({ organization: opts.organization, path: `/_apis/hooks/subscriptions/${encodeURIComponent(opts.azureSubscriptionId)}` })
			}).catch(() => undefined);
		}
	};
}

export type AzureDevOpsService = ReturnType<typeof getAzureDevOpsService>;
