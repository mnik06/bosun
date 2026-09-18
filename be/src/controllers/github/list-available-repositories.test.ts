import { describe, expect, it, vi } from 'vitest';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

function connection(overrides: Partial<GithubPatConnection> = {}): GithubPatConnection {
	return {
		id: 'ghpat_1',
		projectId: 'prj_1',
		githubLogin: 'octocat',
		tokenType: 'classic',
		status: 'active',
		lastError: null,
		brokenAt: null,
		createdByUserId: null,
		createdAt: new Date(),
		...overrides
	};
}

function deps(opts: {
	installations?: { id: string; installationId: number; accountLogin: string }[];
	installationRepos?: Record<number, { githubRepoId: number; fullName: string; defaultBranch: string; private: boolean }[]>;
	connections?: GithubPatConnection[];
	patRepos?: (pat: string) => { githubRepoId: number; fullName: string; defaultBranch: string; private: boolean }[];
}) {
	const githubInstallationRepo = {
		listForProject: vi.fn().mockResolvedValue(opts.installations ?? [])
	} as unknown as GithubInstallationRepo;

	const githubApp = {
		listRepositories: vi.fn((installationId: number) => Promise.resolve(opts.installationRepos?.[installationId] ?? []))
	} as unknown as GithubAppService;

	const githubPatConnectionRepo = {
		listForProject: vi.fn().mockResolvedValue(opts.connections ?? []),
		getEncryptedTokenById: vi.fn(({ id }: { id: string }) => Promise.resolve(`enc:${id}`))
	} as unknown as GithubPatConnectionRepo;

	const patEncryption = {
		decrypt: vi.fn((payload: string) => payload.replace('enc:', 'pat:'))
	} as unknown as PatEncryptionService;

	const githubPat = {
		listPushableRepositories: vi.fn((pat: string) => Promise.resolve(opts.patRepos?.(pat) ?? []))
	} as unknown as GithubPatService;

	return { githubApp, githubInstallationRepo, githubPatConnectionRepo, githubPat, patEncryption, projectId: 'prj_1' };
}

describe('listAvailableRepositories', () => {
	it('merges App and PAT repositories, letting the App win when both grant the same id', async () => {
		const opts = deps({
			installations: [{ id: 'ghi_1', installationId: 1, accountLogin: 'acme' }],
			installationRepos: { 1: [{ githubRepoId: 10, fullName: 'acme/shared', defaultBranch: 'main', private: true }] },
			connections: [connection()],
			patRepos: () => [
				{ githubRepoId: 10, fullName: 'acme/shared', defaultBranch: 'main', private: true },
				{ githubRepoId: 20, fullName: 'octocat/solo', defaultBranch: 'main', private: false }
			]
		});

		const result = await listAvailableRepositories(opts);

		expect(result).toHaveLength(2);
		const shared = result.find((repo) => repo.githubRepoId === 10);

		expect(shared?.connection).toEqual({ kind: 'app', installationId: 'ghi_1', accountLogin: 'acme' });

		const solo = result.find((repo) => repo.githubRepoId === 20);

		expect(solo?.connection).toEqual({ kind: 'pat', connectionId: 'ghpat_1', githubLogin: 'octocat' });
	});

	it('drops a broken PAT connection from the merge without asking it for anything', async () => {
		const opts = deps({
			connections: [connection({ id: 'ghpat_broken', status: 'broken' }), connection({ id: 'ghpat_active' })],
			patRepos: () => [{ githubRepoId: 30, fullName: 'octocat/active-only', defaultBranch: 'main', private: false }]
		});

		const result = await listAvailableRepositories(opts);

		expect(result).toEqual([expect.objectContaining({ githubRepoId: 30 })]);
		expect(opts.githubPatConnectionRepo.getEncryptedTokenById).toHaveBeenCalledTimes(1);
	});

	it('omits a PAT connection whose own listing call fails, without failing the other connections (AC-60)', async () => {
		const failing = connection({ id: 'ghpat_fails' });
		const working = connection({ id: 'ghpat_works' });
		const opts = deps({ connections: [failing, working] });

		(opts.githubPat.listPushableRepositories as ReturnType<typeof vi.fn>).mockImplementation((pat: string) => {
			if (pat === 'pat:enc:ghpat_fails') {
				return Promise.reject(new Error('GitHub is down'));
			}

			return Promise.resolve([{ githubRepoId: 40, fullName: 'octocat/still-here', defaultBranch: 'main', private: false }]);
		});

		const result = await listAvailableRepositories(opts);

		expect(result).toEqual([expect.objectContaining({ githubRepoId: 40 })]);
	});
});
