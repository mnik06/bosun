import { describe, expect, it } from 'vitest';
import {
	getAutoUpgradeRolloutService,
	HALT_AFTER_FAILURES,
	SOAK_MS
} from 'src/services/agent-release/auto-upgrade-rollout.service';

function rollout() {
	let clock = 0;
	const service = getAutoUpgradeRolloutService({ now: () => clock });

	return {
		service,
		advance: (ms: number) => {
			clock += ms;
		}
	};
}

const M = { machineId: 'm1', version: '2.1.0', pinned: false };

describe('auto-upgrade rollout', () => {
	// Refresh is the canary. An unattended offer the moment a release appears
	// would put every opted-in machine ahead of the people testing it by hand.
	it('holds a release back until it has soaked', () => {
		const { service, advance } = rollout();

		expect(service.refusal(M)).toBe('soaking');
		advance(SOAK_MS - 1);
		expect(service.refusal(M)).toBe('soaking');
		advance(1);
		expect(service.refusal(M)).toBeNull();
	});

	it('does not make a pinned rollback wait', () => {
		const { service } = rollout();

		expect(service.refusal({ ...M, pinned: true })).toBeNull();
	});

	it('offers a version once per connection, and again after a reconnect', () => {
		const { service } = rollout();

		service.markOffered(M);
		expect(service.refusal({ ...M, pinned: true })).toBe('offered');

		service.forgetOffer(M.machineId);
		expect(service.refusal({ ...M, pinned: true })).toBeNull();
	});

	// The agent keeps a deferred offer and installs it when idle, so a queued
	// answer must not stop the version reaching this machine later.
	it('ignores a deferral', () => {
		const { service } = rollout();

		expect(service.recordDecline({ ...M, retryable: false, queued: true })).toBe(false);
		expect(service.refusal({ ...M, pinned: true })).toBeNull();
	});

	it('never re-offers a machine a version it refused outright, even after a reconnect', () => {
		const { service } = rollout();

		service.recordDecline({ ...M, retryable: false, queued: false });
		service.forgetOffer(M.machineId);

		expect(service.refusal({ ...M, pinned: true })).toBe('refused');
		expect(service.refusal({ ...M, machineId: 'm2', pinned: true })).toBeNull();
	});

	it('halts a version that failed on enough distinct machines, and says so once', () => {
		const { service } = rollout();
		const results: boolean[] = [];

		for (let i = 0; i < HALT_AFTER_FAILURES + 1; i++) {
			results.push(service.recordDecline({ ...M, machineId: `m${i}`, retryable: true, queued: false }));
		}

		expect(results.filter(Boolean)).toHaveLength(1);
		expect(results[HALT_AFTER_FAILURES - 1]).toBe(true);
		expect(service.refusal({ ...M, machineId: 'fresh', pinned: true })).toBe('halted');
		expect(service.refusal({ ...M, version: '2.1.1', machineId: 'fresh', pinned: true })).toBeNull();
	});

	it('counts one machine failing twice as one failure', () => {
		const { service } = rollout();

		for (let i = 0; i < HALT_AFTER_FAILURES; i++) {
			service.recordDecline({ ...M, retryable: true, queued: false });
		}

		expect(service.halted(M.version)).toBe(false);
	});

	// "Not a packaged binary" says something about the machine, not the release.
	it('does not count a non-retryable refusal against the release', () => {
		const { service } = rollout();

		for (let i = 0; i < HALT_AFTER_FAILURES; i++) {
			service.recordDecline({ ...M, machineId: `m${i}`, retryable: false, queued: false });
		}

		expect(service.halted(M.version)).toBe(false);
	});
});
