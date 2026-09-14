import { describe, expect, it, vi } from 'vitest';
import { importInstallations } from 'src/controllers/github/import-installations';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';

function build(opts: { stateValid?: boolean; accessible: number[] }) {
	const upsert = vi.fn().mockImplementation(async (row) => ({ ...row, createdAt: new Date() }));
	const installationsForCode = vi
		.fn()
		.mockResolvedValue(opts.accessible.map((id) => ({ installationId: id, accountLogin: `org-${id}` })));
	const githubApp = {
		verifyState: vi.fn().mockReturnValue(opts.stateValid ?? true),
		installationsForCode
	} as unknown as GithubAppService;

	return {
		upsert,
		installationsForCode,
		run: () =>
			importInstallations({
				githubApp,
				githubInstallationRepo: { upsert } as unknown as GithubInstallationRepo,
				idService: { createGithubInstallationId: () => 'ghi_1' } as unknown as IdService,
				userId: 'u_1',
				projectId: 'prj_1',
				code: 'code',
				state: 'state'
			})
	};
}

describe('importInstallations', () => {
	// The one path that records an installation the callback did not name. Each is
	// taken from what the leader's own authorization lists, never from the browser.
	it('records every installation the user\'s own authorization reaches, for this project', async () => {
		const { upsert, run } = build({ accessible: [1, 2] });

		expect(await run()).toHaveLength(2);
		expect(upsert.mock.calls.map(([row]) => [row.projectId, row.installationId, row.accountLogin])).toEqual([
			['prj_1', 1, 'org-1'],
			['prj_1', 2, 'org-2']
		]);
	});

	it('refuses a state issued to someone else before asking GitHub anything', async () => {
		const { upsert, installationsForCode, run } = build({ stateValid: false, accessible: [1] });

		await expect(run()).rejects.toMatchObject({ statusCode: 403 });
		expect(installationsForCode).not.toHaveBeenCalled();
		expect(upsert).not.toHaveBeenCalled();
	});

	it('says so when the account reaches no installation at all', async () => {
		const { run } = build({ accessible: [] });

		await expect(run()).rejects.toMatchObject({ statusCode: 404 });
	});
});
