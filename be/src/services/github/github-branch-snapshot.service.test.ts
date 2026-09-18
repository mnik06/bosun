import { describe, expect, it } from 'vitest';
import { getGithubBranchSnapshotService } from 'src/services/github/github-branch-snapshot.service';

describe('github branch snapshot diff', () => {
	it("reports nothing changed on a repository's first poll — there is no baseline to differ from yet", () => {
		const service = getGithubBranchSnapshotService();

		expect(service.diff('repo_1', new Map([['main', 'sha-1']]), '"etag-1"')).toEqual([]);
	});

	it('reports only the branches whose commit moved since the last poll', () => {
		const service = getGithubBranchSnapshotService();

		service.diff(
			'repo_1',
			new Map([
				['main', 'sha-1'],
				['feature', 'sha-a']
			]),
			'"etag-1"'
		);

		const changed = service.diff(
			'repo_1',
			new Map([
				['main', 'sha-2'],
				['feature', 'sha-a']
			]),
			'"etag-2"'
		);

		expect(changed).toEqual([{ branch: 'main', sha: 'sha-2' }]);
	});

	it('remembers the etag from the most recent diff, for the next conditional request', () => {
		const service = getGithubBranchSnapshotService();

		expect(service.getEtag('repo_1')).toBeNull();

		service.diff('repo_1', new Map([['main', 'sha-1']]), '"etag-1"');

		expect(service.getEtag('repo_1')).toBe('"etag-1"');
	});

	it("keeps each repository's snapshot independent of every other", () => {
		const service = getGithubBranchSnapshotService();

		service.diff('repo_1', new Map([['main', 'sha-1']]), '"etag-1"');

		expect(service.diff('repo_2', new Map([['main', 'sha-1']]), '"etag-1"')).toEqual([]);
	});
});
