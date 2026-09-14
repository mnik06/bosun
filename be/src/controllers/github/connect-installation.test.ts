import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { connectInstallation } from 'src/controllers/github/connect-installation';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';

function build(opts: { stateValid?: boolean; accessible?: number[] }) {
	const upsert = vi.fn().mockImplementation(async (row) => ({ ...row, createdAt: new Date() }));
	const githubApp = {
		verifyState: vi.fn().mockReturnValue(opts.stateValid ?? true),
		installationsForCode: vi
			.fn()
			.mockResolvedValue((opts.accessible ?? []).map((id) => ({ installationId: id, accountLogin: `org-${id}` })))
	} as unknown as GithubAppService;

	return {
		upsert,
		run: (installationId: number) =>
			connectInstallation({
				githubApp,
				githubInstallationRepo: { upsert } as unknown as GithubInstallationRepo,
				idService: { createGithubInstallationId: () => 'ghi_1' } as unknown as IdService,
				userId: 'u_1',
				projectId: 'prj_1',
				installationId,
				code: 'code',
				state: 'state'
			})
	};
}

describe('connectInstallation', () => {
	// The installation id is a query parameter anyone can type. Recording one the
	// installing user cannot reach would let a leader clone another organization's code.
	it('refuses an installation the user\'s own GitHub authorization does not list', async () => {
		const { upsert, run } = build({ accessible: [1] });

		await expect(run(2)).rejects.toThrow(new HttpError(403, 'Your GitHub account cannot access that installation'));
		expect(upsert).not.toHaveBeenCalled();
	});

	it('refuses a state issued to someone else before asking GitHub anything', async () => {
		const { upsert, run } = build({ stateValid: false, accessible: [1] });

		await expect(run(1)).rejects.toMatchObject({ statusCode: 403 });
		expect(upsert).not.toHaveBeenCalled();
	});

	it('records the installation under the account GitHub named', async () => {
		const { upsert, run } = build({ accessible: [1, 2] });

		await run(2);

		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'prj_1', installationId: 2, accountLogin: 'org-2', createdByUserId: 'u_1' })
		);
	});
});
