import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { runAzureConnectionCall, type AzureConnectionGuardDeps } from 'src/controllers/azure/shared/connection-guard';
import { AzureError } from 'src/services/azure/azure-devops.service';
import { getAzureConnectionGuardService } from 'src/services/azure/azure-connection-guard.service';
import { type AzureConnection } from 'src/types/AzureSchema';

function connection(overrides: Partial<AzureConnection> = {}): AzureConnection {
	return {
		id: 'azc_1',
		projectId: 'prj_1',
		organization: 'my-org',
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
		azureConnectionRepo: { markBroken },
		projectMemberRepo: { list },
		azureConnectionGuard: getAzureConnectionGuardService(),
		notificationRepo: { create },
		pushSubscriptionRepo: { listByUserIds: vi.fn().mockResolvedValue([]) },
		socketRegistry: { sendToUiUser: vi.fn() },
		webPush: { send: vi.fn() },
		idService: { createNotificationId: () => 'ntf_1' },
		appUrl: 'https://app.example.com'
	} as unknown as AzureConnectionGuardDeps;

	return { deps, markBroken, create };
}

describe('runAzureConnectionCall', () => {
	it('short-circuits a broken connection without calling run at all (AC-71)', async () => {
		const { deps } = build();
		const run = vi.fn();

		await expect(runAzureConnectionCall(deps, connection({ status: 'broken' }), run)).rejects.toMatchObject({ statusCode: 409 });
		expect(run).not.toHaveBeenCalled();
	});

	it('marks a connection broken and notifies once on a 401 (AC-69, AC-72)', async () => {
		const { deps, markBroken, create } = build();
		const conn = connection();

		// The repo's own conditional update only ever returns a row the first
		// time — a second failure racing behind it sees `null`, the same as the
		// real `UPDATE ... WHERE status = 'active'` would once the row has moved.
		markBroken.mockResolvedValueOnce({ ...conn, status: 'broken' }).mockResolvedValueOnce(null);

		await expect(runAzureConnectionCall(deps, conn, () => Promise.reject(new AzureError('invalid_token', 'dead')))).rejects.toBeInstanceOf(AzureError);
		await expect(runAzureConnectionCall(deps, conn, () => Promise.reject(new AzureError('invalid_token', 'dead again')))).rejects.toBeInstanceOf(AzureError);

		expect(markBroken).toHaveBeenCalledTimes(2);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('marks a connection broken on a non-JSON body the same way as a 401 (AC-70)', async () => {
		const { deps, markBroken } = build();

		await expect(runAzureConnectionCall(deps, connection(), () => Promise.reject(new AzureError('invalid_response', 'not json')))).rejects.toBeInstanceOf(AzureError);
		expect(markBroken).toHaveBeenCalledWith({ id: 'azc_1', lastError: 'not json' });
	});

	it('never marks broken on a missing-scope or unreachable failure', async () => {
		const { deps, markBroken } = build();

		await expect(runAzureConnectionCall(deps, connection(), () => Promise.reject(new AzureError('missing_scope', 'nope')))).rejects.toBeInstanceOf(AzureError);
		await expect(runAzureConnectionCall(deps, connection(), () => Promise.reject(new AzureError('unreachable', 'nope')))).rejects.toBeInstanceOf(AzureError);
		expect(markBroken).not.toHaveBeenCalled();
	});

	it('remembers a Retry-After cooldown and short-circuits only that connection until it elapses (AC-75)', async () => {
		const { deps } = build();
		const conn = connection();
		const other = connection({ id: 'azc_2' });

		await expect(runAzureConnectionCall(deps, conn, () => Promise.reject(new AzureError('rate_limited', 'slow down', { retryAfterMs: 10_000 })))).rejects.toBeInstanceOf(AzureError);

		const run = vi.fn();

		await expect(runAzureConnectionCall(deps, conn, run)).rejects.toMatchObject({ statusCode: 429 });
		expect(run).not.toHaveBeenCalled();

		const otherRun = vi.fn().mockResolvedValue('ok');

		await expect(runAzureConnectionCall(deps, other, otherRun)).resolves.toBe('ok');
	});
});

describe('HttpError shape sanity', () => {
	it('is the error type thrown for a broken connection', async () => {
		const { deps } = build();

		await expect(runAzureConnectionCall(deps, connection({ status: 'broken' }), () => Promise.resolve(1))).rejects.toBeInstanceOf(HttpError);
	});
});
