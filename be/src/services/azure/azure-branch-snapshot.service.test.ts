import { describe, expect, it } from 'vitest';
import { getAzureBranchSnapshotService } from 'src/services/azure/azure-branch-snapshot.service';

describe('azure branch snapshot diff', () => {
	it('reports nothing changed on a repository\'s first poll — there is no baseline to differ from yet', () => {
		const service = getAzureBranchSnapshotService();

		expect(service.diff('repo_1', new Map([['main', 'sha-1']]))).toEqual([]);
	});

	it('reports only the branches whose commit moved since the last poll', () => {
		const service = getAzureBranchSnapshotService();

		service.diff('repo_1', new Map([['main', 'sha-1'], ['feature', 'sha-a']]));

		const changed = service.diff('repo_1', new Map([['main', 'sha-2'], ['feature', 'sha-a']]));

		expect(changed).toEqual([{ branch: 'main', sha: 'sha-2' }]);
	});

	it('keeps each repository\'s snapshot independent of every other', () => {
		const service = getAzureBranchSnapshotService();

		service.diff('repo_1', new Map([['main', 'sha-1']]));

		expect(service.diff('repo_2', new Map([['main', 'sha-1']]))).toEqual([]);
	});
});
