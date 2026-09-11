import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisconnectGraceService } from 'src/services/sockets/disconnect-grace.service';

describe('getDisconnectGraceService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('settles a machine that never came back', async () => {
		const grace = getDisconnectGraceService({ graceMs: 1_000 });
		const settle = vi.fn();

		grace.schedule({ machineId: 'm_1', settle });
		await vi.advanceTimersByTimeAsync(1_000);

		expect(settle).toHaveBeenCalledTimes(1);
		expect(grace.pending('m_1')).toBe(false);
	});

	// The whole point of the window: `hello` settles the same work against the runs
	// the agent says it still holds, which this cannot see.
	it('settles nothing once the machine is back', async () => {
		const grace = getDisconnectGraceService({ graceMs: 1_000 });
		const settle = vi.fn();

		grace.schedule({ machineId: 'm_1', settle });
		grace.cancel('m_1');
		await vi.advanceTimersByTimeAsync(5_000);

		expect(settle).not.toHaveBeenCalled();
	});

	// A flapping machine closes a socket every few seconds. Settling on the first
	// close would land in the middle of a reconnect that is still happening.
	it('restarts the window on the newest close', async () => {
		const grace = getDisconnectGraceService({ graceMs: 1_000 });
		const first = vi.fn();
		const second = vi.fn();

		grace.schedule({ machineId: 'm_1', settle: first });
		await vi.advanceTimersByTimeAsync(900);
		grace.schedule({ machineId: 'm_1', settle: second });
		await vi.advanceTimersByTimeAsync(900);

		expect(first).not.toHaveBeenCalled();
		expect(second).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);

		expect(second).toHaveBeenCalledTimes(1);
	});

	it('keeps one window per machine', async () => {
		const grace = getDisconnectGraceService({ graceMs: 1_000 });
		const one = vi.fn();
		const two = vi.fn();

		grace.schedule({ machineId: 'm_1', settle: one });
		grace.schedule({ machineId: 'm_2', settle: two });
		grace.cancel('m_1');
		await vi.advanceTimersByTimeAsync(1_000);

		expect(one).not.toHaveBeenCalled();
		expect(two).toHaveBeenCalledTimes(1);
	});
});
