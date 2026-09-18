import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { runGithubPatConnectionCall, type GithubPatConnectionGuardDeps } from 'src/controllers/github/shared/pat-connection-guard';
import { GithubPatError } from 'src/services/github/github-pat.service';
import { getGithubPatConnectionGuardService } from 'src/services/github/github-pat-connection-guard.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

function connection(overrides: Partial<GithubPatConnection> = {}): GithubPatConnection {
	return {
		id: 'gpc_1',
		projectId: 'prj_1',
		githubLogin: 'octocat',
		tokenType: 'fine_grained',
		status: 'active',
		lastError: null,
		brokenAt: null,
		createdByUserId: 'u_1',
		createdAt: new Date(),
		...overrides
	};
}

function build() {
	const markBroken = vi.fn().mockResolvedValue({ ...connection(), status: 'broken' });
	const list = vi.fn().mockResolvedValue([{ userId: 'u_1', email: 'a@example.com', role: 'leader', createdAt: new Date() }]);
	const create = vi.fn().mockResolvedValue({ id: 'ntf_1' });
	const deps = {
		githubPatConnectionRepo: { markBroken },
		projectMemberRepo: { list },
		githubPatConnectionGuard: getGithubPatConnectionGuardService(),
		notificationRepo: { create },
		pushSubscriptionRepo: { listByUserIds: vi.fn().mockResolvedValue([]) },
		socketRegistry: { sendToUiUser: vi.fn() },
		webPush: { send: vi.fn() },
		idService: { createNotificationId: () => 'ntf_1' },
		appUrl: 'https://app.example.com'
	} as unknown as GithubPatConnectionGuardDeps;

	return { deps, markBroken, create };
}

describe('runGithubPatConnectionCall', () => {
	it('short-circuits a broken connection without calling run at all', async () => {
		const { deps } = build();
		const run = vi.fn();

		await expect(runGithubPatConnectionCall(deps, connection({ status: 'broken' }), run)).rejects.toMatchObject({ statusCode: 409 });
		expect(run).not.toHaveBeenCalled();
	});

	it('marks a connection broken and notifies once on an invalid token (AC-43, AC-69)', async () => {
		const { deps, markBroken, create } = build();
		const conn = connection();

		markBroken.mockResolvedValueOnce({ ...conn, status: 'broken' }).mockResolvedValueOnce(null);

		await expect(runGithubPatConnectionCall(deps, conn, () => Promise.reject(new GithubPatError('invalid_token', 'dead')))).rejects.toBeInstanceOf(GithubPatError);
		await expect(runGithubPatConnectionCall(deps, conn, () => Promise.reject(new GithubPatError('invalid_token', 'dead again')))).rejects.toBeInstanceOf(GithubPatError);

		expect(markBroken).toHaveBeenCalledTimes(2);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('marks a connection broken on a missing SSO authorization and includes the link in the stored message (AC-44)', async () => {
		const { deps, markBroken } = build();

		await expect(
			runGithubPatConnectionCall(deps, connection(), () => Promise.reject(new GithubPatError('sso_required', 'not authorized', { ssoUrl: 'https://github.com/orgs/acme/sso' })))
		).rejects.toBeInstanceOf(GithubPatError);

		expect(markBroken).toHaveBeenCalledWith({ id: 'gpc_1', lastError: 'not authorized (https://github.com/orgs/acme/sso)' });
	});

	it('marks a connection broken on an organization policy rejection (AC-46)', async () => {
		const { deps, markBroken } = build();

		await expect(runGithubPatConnectionCall(deps, connection(), () => Promise.reject(new GithubPatError('org_restricted', 'blocked')))).rejects.toBeInstanceOf(GithubPatError);
		expect(markBroken).toHaveBeenCalledWith({ id: 'gpc_1', lastError: 'blocked' });
	});

	it('never marks broken on a repository-scoped missing-scope failure (AC-70)', async () => {
		const { deps, markBroken } = build();

		await expect(runGithubPatConnectionCall(deps, connection(), () => Promise.reject(new GithubPatError('missing_scope', 'no push access to this repo')))).rejects.toBeInstanceOf(
			GithubPatError
		);
		expect(markBroken).not.toHaveBeenCalled();
	});

	it('never marks broken on an unreachable or pending-approval failure', async () => {
		const { deps, markBroken } = build();

		await expect(runGithubPatConnectionCall(deps, connection(), () => Promise.reject(new GithubPatError('unreachable', 'nope')))).rejects.toBeInstanceOf(GithubPatError);
		await expect(runGithubPatConnectionCall(deps, connection(), () => Promise.reject(new GithubPatError('pending_approval', 'nope')))).rejects.toBeInstanceOf(GithubPatError);
		expect(markBroken).not.toHaveBeenCalled();
	});

	it('remembers a rate-limit cooldown and short-circuits only that connection until it elapses (AC-41)', async () => {
		const { deps } = build();
		const conn = connection();
		const other = connection({ id: 'gpc_2' });

		await expect(
			runGithubPatConnectionCall(deps, conn, () => Promise.reject(new GithubPatError('rate_limited', 'slow down', { retryAfterMs: 10_000 })))
		).rejects.toBeInstanceOf(GithubPatError);

		const run = vi.fn();

		await expect(runGithubPatConnectionCall(deps, conn, run)).rejects.toMatchObject({ statusCode: 429 });
		expect(run).not.toHaveBeenCalled();

		const otherRun = vi.fn().mockResolvedValue('ok');

		await expect(runGithubPatConnectionCall(deps, other, otherRun)).resolves.toBe('ok');
	});

	it('is the HttpError type for a broken connection', async () => {
		const { deps } = build();

		await expect(runGithubPatConnectionCall(deps, connection({ status: 'broken' }), () => Promise.resolve(1))).rejects.toBeInstanceOf(HttpError);
	});
});
