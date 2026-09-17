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
