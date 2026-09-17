import { describe, expect, it } from 'vitest';
import { AzureError, getAzureDevOpsService } from 'src/services/azure/azure-devops.service';

function reply(status: number, json: unknown, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(json), { status, headers });
}

describe('listRepositories', () => {
	// There is no "list every repository in an org" endpoint on Azure DevOps, so
	// this is a projects list fanned out into one repositories call per project.
	it('fans the projects list out into one repositories call per project', async () => {
		const fetchImpl = (async (input: string | URL | Request) => {
			const url = String(input);

			if (url.includes('/_apis/projects')) {
				return reply(200, { value: [{ id: 'p1', name: 'Proj One' }, { id: 'p2', name: 'Proj Two' }] });
			}

			if (url.includes('/Proj%20One/_apis/git/repositories')) {
				return reply(200, {
					value: [
						{ id: 'r1', name: 'repo-a', defaultBranch: 'refs/heads/main', isDisabled: false, project: { id: 'p1', name: 'Proj One', visibility: 'private' } },
						{ id: 'r2', name: 'repo-b', isDisabled: true, project: { id: 'p1', name: 'Proj One', visibility: 'private' } }
					]
				});
			}

			if (url.includes('/Proj%20Two/_apis/git/repositories')) {
				return reply(200, { value: [{ id: 'r3', name: 'repo-c', defaultBranch: 'refs/heads/main', isDisabled: false, project: { id: 'p2', name: 'Proj Two', visibility: 'public' } }] });
			}

			return reply(404, { message: 'not found' });
		}) as typeof fetch;

		const service = getAzureDevOpsService({ fetchImpl });
		const repositories = await service.listRepositories({ organization: 'my-org', pat: 'token' });

		expect(repositories.map((repo) => repo.fullName)).toEqual(['my-org/Proj One/repo-a', 'my-org/Proj Two/repo-c']);
		expect(repositories[0]).toMatchObject({ defaultBranch: 'main', cloneUrl: 'https://dev.azure.com/my-org/Proj%20One/_git/repo-a', private: true });
		expect(repositories[1]).toMatchObject({ private: false });
	});

	it('follows a projects-list continuation token', async () => {
		let page = 0;
		const fetchImpl = (async (input: string | URL | Request) => {
			const url = String(input);

			if (url.includes('/_apis/projects')) {
				page += 1;

				return page === 1
					? reply(200, { value: [{ id: 'p1', name: 'Proj1' }] }, { 'x-ms-continuationtoken': 'next' })
					: reply(200, { value: [{ id: 'p2', name: 'Proj2' }] });
			}

			return reply(200, { value: [] });
		}) as typeof fetch;

		const service = getAzureDevOpsService({ fetchImpl });

		await service.listRepositories({ organization: 'my-org', pat: 'token' });

		expect(page).toBe(2);
	});

	it('throws a distinct error for an invalid token, a missing scope, and an unreachable organization', async () => {
		const service = (status: number | 'network') =>
			getAzureDevOpsService({
				fetchImpl: (async () => {
					if (status === 'network') {
						throw new TypeError('fetch failed');
					}

					return reply(status, { message: 'refused' });
				}) as typeof fetch
			});

		const kindOf = async (status: number | 'network') => {
			try {
				await service(status).listRepositories({ organization: 'org', pat: 'token' });
			} catch (error) {
				return error instanceof AzureError ? error.kind : null;
			}

			throw new Error('expected listRepositories to throw');
		};

		await expect(service(401).listRepositories({ organization: 'org', pat: 'bad' })).rejects.toThrow('This token is invalid or expired.');
		await expect(kindOf(401)).resolves.toBe('invalid_token');
		await expect(kindOf(403)).resolves.toBe('missing_scope');
		await expect(kindOf('network')).resolves.toBe('unreachable');
	});
});

const REPO_JSON = { id: 'repo-guid', name: 'app', defaultBranch: 'refs/heads/main', project: { id: 'proj', name: 'Proj', visibility: 'private' } };
const SCOPE = { organization: 'org', pat: 'token', azureProjectId: 'proj', azureRepoId: 'repo-guid' };

describe('pointBranch', () => {
	it('creates a new ref pointing at the given sha when the branch does not exist yet', async () => {
		let createBody: unknown;
		const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.pathname.endsWith('/refs')) {
				return reply(200, { value: [] });
			}

			if (method === 'POST' && url.pathname.endsWith('/refs')) {
				createBody = JSON.parse(String(init?.body));

				return reply(200, { value: [{ name: 'refs/heads/onboarding', success: true, updateStatus: 'succeeded' }] });
			}

			throw new Error(`unexpected ${method} ${url.pathname}`);
		}) as typeof fetch;

		await getAzureDevOpsService({ fetchImpl }).pointBranch({ ...SCOPE, branch: 'onboarding', sha: 'abc123' });

		expect(createBody).toMatchObject([{ name: 'refs/heads/onboarding', oldObjectId: '0000000000000000000000000000000000000000', newObjectId: 'abc123' }]);
	});

	// Azure answers 200 even when a ref update it was asked to make failed — the
	// per-ref `success`/`updateStatus` fields are the only way to tell.
	it('throws when Azure answers 200 but refuses the ref update itself', async () => {
		const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
			const method = init?.method ?? 'GET';

			if (method === 'GET') {
				return reply(200, { value: [{ name: 'refs/heads/onboarding', objectId: 'old-sha' }] });
			}

			return reply(200, { value: [{ name: 'refs/heads/onboarding', success: false, updateStatus: 'lockExceeded' }] });
		}) as typeof fetch;

		await expect(getAzureDevOpsService({ fetchImpl }).pointBranch({ ...SCOPE, branch: 'onboarding', sha: 'abc123' })).rejects.toThrow(/lockExceeded/);
	});
});

describe('openOrUpdatePullRequest', () => {
	it('finds and updates an existing active pull request instead of opening a second one (AC-44)', async () => {
		let patchBody: unknown;
		const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.pathname.endsWith('/repositories/repo-guid')) {
				return reply(200, REPO_JSON);
			}

			if (method === 'GET' && url.pathname.endsWith('/pullrequests')) {
				return reply(200, { value: [{ pullRequestId: 5, status: 'active', sourceRefName: 'refs/heads/build', targetRefName: 'refs/heads/main' }] });
			}

			if (method === 'PATCH' && url.pathname.endsWith('/pullrequests/5')) {
				patchBody = JSON.parse(String(init?.body));

				return reply(200, {});
			}

			throw new Error(`unexpected ${method} ${url.pathname}`);
		}) as typeof fetch;

		const result = await getAzureDevOpsService({ fetchImpl }).openOrUpdatePullRequest({ ...SCOPE, head: 'build', base: 'main', title: 'A build', body: 'body text' });

		expect(result).toMatchObject({ number: 5, updated: true, url: 'https://dev.azure.com/org/Proj/_git/app/pullrequest/5' });
		expect(patchBody).toMatchObject({ title: 'A build', description: 'body text' });
	});

	it('opens a new pull request when none is active for the source/target pair (AC-43)', async () => {
		const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.pathname.endsWith('/repositories/repo-guid')) {
				return reply(200, REPO_JSON);
			}

			if (method === 'GET' && url.pathname.endsWith('/pullrequests')) {
				return reply(200, { value: [] });
			}

			if (method === 'POST' && url.pathname.endsWith('/pullrequests')) {
				return reply(201, { pullRequestId: 9, status: 'active', sourceRefName: 'refs/heads/build', targetRefName: 'refs/heads/main' });
			}

			throw new Error(`unexpected ${method} ${url.pathname}`);
		}) as typeof fetch;

		const result = await getAzureDevOpsService({ fetchImpl }).openOrUpdatePullRequest({ ...SCOPE, head: 'build', base: 'main', title: 'A build', body: 'body text' });

		expect(result).toMatchObject({ number: 9, updated: false });
	});
});

describe('getPullRequest', () => {
	it('maps a completed pull request to closed+merged, using the last merged target commit as baseSha (AC-45/46)', async () => {
		const fetchImpl = (async (input: string | URL) => {
			const url = new URL(String(input));

			if (url.pathname.endsWith('/pullrequests/7')) {
				return reply(200, {
					pullRequestId: 7,
					status: 'completed',
					sourceRefName: 'refs/heads/build',
					targetRefName: 'refs/heads/main',
					lastMergeTargetCommit: { commitId: 'deadbeef' }
				});
			}

			if (url.pathname.endsWith('/repositories/repo-guid')) {
				return reply(200, REPO_JSON);
			}

			throw new Error(`unexpected ${url.pathname}`);
		}) as typeof fetch;

		const pull = await getAzureDevOpsService({ fetchImpl }).getPullRequest({ ...SCOPE, number: 7 });

		expect(pull).toMatchObject({ number: 7, state: 'closed', merged: true, baseRef: 'main', baseSha: 'deadbeef', headRef: 'build' });
	});

	it('reads an active pull request as open and not merged', async () => {
		const fetchImpl = (async (input: string | URL) => {
			const url = new URL(String(input));

			if (url.pathname.endsWith('/pullrequests/7')) {
				return reply(200, { pullRequestId: 7, status: 'active', sourceRefName: 'refs/heads/build', targetRefName: 'refs/heads/main' });
			}

			if (url.pathname.endsWith('/refs')) {
				return reply(200, { value: [{ name: 'refs/heads/main', objectId: 'current-tip' }] });
			}

			return reply(200, REPO_JSON);
		}) as typeof fetch;

		const pull = await getAzureDevOpsService({ fetchImpl }).getPullRequest({ ...SCOPE, number: 7 });

		expect(pull).toMatchObject({ state: 'open', merged: false, baseSha: 'current-tip' });
	});
});

describe('readFile', () => {
	it('returns null when the file does not exist on that branch', async () => {
		const fetchImpl = (async () => reply(404, { message: 'not found' })) as typeof fetch;

		await expect(getAzureDevOpsService({ fetchImpl }).readFile({ ...SCOPE, path: '.bosun/project.yaml', ref: 'main' })).resolves.toBeNull();
	});

	it('returns the file content when it exists', async () => {
		const fetchImpl = (async () => reply(200, { content: 'name: bosun' })) as typeof fetch;

		await expect(getAzureDevOpsService({ fetchImpl }).readFile({ ...SCOPE, path: '.bosun/project.yaml', ref: 'main' })).resolves.toBe('name: bosun');
	});
});
