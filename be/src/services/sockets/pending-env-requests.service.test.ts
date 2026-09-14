import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPendingEnvRequestsService } from 'src/services/sockets/pending-env-requests.service';

const SAVED = { ok: true as const, envSets: [{ path: 'be', keys: ['A'], updatedAt: '2026-09-14T00:00:00.000Z' }] };

describe('getPendingEnvRequestsService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves with the reply from the machine it asked', async () => {
		const pending = getPendingEnvRequestsService();
		const reply = pending.wait({ requestId: 'cmd_1', machineId: 'm_1', timeoutMs: 1_000 });

		expect(pending.settle({ requestId: 'cmd_1', machineId: 'm_1', result: SAVED })).toBe(true);
		await expect(reply).resolves.toEqual(SAVED);
	});

	it('passes a refusal through', async () => {
		const pending = getPendingEnvRequestsService();
		const reply = pending.wait({ requestId: 'cmd_1', machineId: 'm_1', timeoutMs: 1_000 });

		pending.settle({ requestId: 'cmd_1', machineId: 'm_1', result: { ok: false, message: 'no stored value for A' } });

		await expect(reply).resolves.toEqual({ ok: false, message: 'no stored value for A' });
	});

	it('resolves null when the machine never answers', async () => {
		const pending = getPendingEnvRequestsService();
		const reply = pending.wait({ requestId: 'cmd_1', machineId: 'm_1', timeoutMs: 1_000 });

		await vi.advanceTimersByTimeAsync(1_000);

		await expect(reply).resolves.toBeNull();
	});

	it('ignores a reply that arrives after the timeout', async () => {
		const pending = getPendingEnvRequestsService();
		const reply = pending.wait({ requestId: 'cmd_1', machineId: 'm_1', timeoutMs: 1_000 });

		await vi.advanceTimersByTimeAsync(1_000);

		expect(pending.settle({ requestId: 'cmd_1', machineId: 'm_1', result: SAVED })).toBe(false);
		await expect(reply).resolves.toBeNull();
	});

	// Accepting it would write one machine's key list onto another machine's row.
	it('ignores a reply quoting another machine\'s request id', async () => {
		const pending = getPendingEnvRequestsService();
		const reply = pending.wait({ requestId: 'cmd_1', machineId: 'm_1', timeoutMs: 1_000 });

		expect(pending.settle({ requestId: 'cmd_1', machineId: 'm_2', result: SAVED })).toBe(false);
		expect(pending.settle({ requestId: 'cmd_1', machineId: 'm_1', result: { ok: false, message: 'x' } })).toBe(true);
		await expect(reply).resolves.toEqual({ ok: false, message: 'x' });
	});

	it('ignores an id nobody is waiting for', () => {
		const pending = getPendingEnvRequestsService();

		expect(pending.settle({ requestId: 'cmd_x', machineId: 'm_1', result: SAVED })).toBe(false);
	});

	it('settles a cancelled wait with null and stops its timer', async () => {
		const pending = getPendingEnvRequestsService();
		const reply = pending.wait({ requestId: 'cmd_1', machineId: 'm_1', timeoutMs: 1_000 });

		pending.cancel('cmd_1');

		await expect(reply).resolves.toBeNull();
		expect(vi.getTimerCount()).toBe(0);
		expect(pending.settle({ requestId: 'cmd_1', machineId: 'm_1', result: SAVED })).toBe(false);
	});
});
