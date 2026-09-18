import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { rotateGithubPatConnection } from 'src/controllers/github/rotate-pat-connection';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

const CONNECTION: GithubPatConnection = {
	id: 'ghpat_1',
	projectId: 'prj_1',
	githubLogin: 'octocat',
	tokenType: 'classic',
	status: 'active',
	lastError: null,
	brokenAt: null,
	createdByUserId: 'u_1',
	createdAt: new Date()
};

function build(opts: { githubLogin?: string }) {
	const rotateToken = vi.fn().mockImplementation(async (row) => ({ ...CONNECTION, ...row }));
	const githubPatConnectionRepo = {
		getOwnedById: vi.fn().mockResolvedValue(CONNECTION),
		rotateToken
	} as unknown as GithubPatConnectionRepo;
	const githubPat = {
		validateAndListRepositories: vi.fn().mockResolvedValue({
			githubLogin: opts.githubLogin ?? CONNECTION.githubLogin,
			tokenType: 'classic',
			repositories: [{ githubRepoId: 1, fullName: 'octocat/repo', defaultBranch: 'main', private: false }]
		})
	} as unknown as GithubPatService;
	const patEncryption = { encrypt: vi.fn((value: string) => `encrypted:${value}`) } as unknown as PatEncryptionService;

	return {
		rotateToken,
		githubPatConnectionRepo,
		run: () =>
			rotateGithubPatConnection({
				githubPatConnectionRepo,
				githubPat,
				patEncryption,
				id: CONNECTION.id,
				projectId: CONNECTION.projectId,
				pat: 'new-token'
			})
	};
}

describe('rotateGithubPatConnection', () => {
	it('refuses a replacement token that belongs to a different GitHub login, without rotating', async () => {
		const { run, rotateToken } = build({ githubLogin: 'someone-else' });

		await expect(run()).rejects.toMatchObject({ statusCode: 422 });
		expect(rotateToken).not.toHaveBeenCalled();
	});

	it('rotates the token when the replacement belongs to the same GitHub login', async () => {
		const { run, rotateToken } = build({ githubLogin: CONNECTION.githubLogin });

		await run();

		expect(rotateToken).toHaveBeenCalledWith({
			id: CONNECTION.id,
			projectId: CONNECTION.projectId,
			githubLogin: CONNECTION.githubLogin,
			tokenType: 'classic',
			encryptedToken: 'encrypted:new-token'
		});
	});

	it('404s when the connection is not owned by this project', async () => {
		const { run, githubPatConnectionRepo } = build({});

		(githubPatConnectionRepo.getOwnedById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

		await expect(run()).rejects.toThrow(new HttpError(404, 'GitHub token connection not found'));
	});
});
