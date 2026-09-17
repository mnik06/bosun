import { z } from 'zod';
import { azureCloneUrl, azureRepositoryFullName, stripRefsHeadsPrefix, type AvailableAzureRepository } from 'src/types/AzureSchema';

const API_VERSION = '7.1';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PAGES = 20;

export type AzureErrorKind = 'invalid_token' | 'missing_scope' | 'unreachable' | 'other';

export class AzureError extends Error {
	public readonly kind: AzureErrorKind;

	constructor(kind: AzureErrorKind, message: string) {
		super(message);
		this.name = 'AzureError';
		this.kind = kind;
	}
}

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

// One error type for every failure a caller needs to tell apart: an invalid or
// expired token, one missing a required scope, and an organization bosun's IP
// cannot reach — the three messages AC-3/4/5 ask for, decided here rather than
// re-derived at each call site.
export function getAzureDevOpsService(deps: { fetchImpl?: typeof fetch }) {
	const fetchImpl = deps.fetchImpl ?? fetch;

	async function call(opts: { url: string; pat: string; method?: string }): Promise<{ status: number; json: unknown; headers: Headers }> {
		let response: Response;

		try {
			response = await fetchImpl(opts.url, {
				method: opts.method ?? 'GET',
				headers: { accept: 'application/json', authorization: authHeader(opts.pat), 'user-agent': 'bosun' },
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (error) {
			throw new AzureError('unreachable', `Could not reach that organization: ${error instanceof Error ? error.message : String(error)}`);
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

		const json: unknown = await response.json().catch(() => null);

		if (!response.ok) {
			throw new AzureError('other', `Azure DevOps answered ${response.status}${json === null ? '' : ` — ${JSON.stringify(json)}`}`);
		}

		return { status: response.status, json, headers: response.headers };
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

	return {
		listRepositories,

		async getRepository(opts: { organization: string; pat: string; azureProjectId: string; azureRepoId: string }) {
			const result = await call({
				pat: opts.pat,
				url: apiUrl({ organization: opts.organization, path: `/${encodeURIComponent(opts.azureProjectId)}/_apis/git/repositories/${encodeURIComponent(opts.azureRepoId)}` })
			});
			const repo = RepoSchema.parse(result.json);

			return {
				fullName: azureRepositoryFullName({ organization: opts.organization, projectName: repo.project.name, repoName: repo.name }),
				defaultBranch: stripRefsHeadsPrefix(repo.defaultBranch ?? 'refs/heads/main'),
				cloneUrl: azureCloneUrl({ organization: opts.organization, projectName: repo.project.name, repoName: repo.name })
			};
		},

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
