import { describe, expect, it, vi } from 'vitest';
import {
	MAX_OFFERS_PER_SWEEP,
	sweepAutoUpgrades,
	type AutoUpgradeDeps
} from 'src/controllers/machines/auto-upgrade-sweep';
import { getAutoUpgradeRolloutService } from 'src/services/agent-release/auto-upgrade-rollout.service';

function machine(id: string, agentVersion: string | null = '2.0.0') {
	return { id, projectId: 'p1', agentVersion };
}

function deps(opts: {
	machines: ReturnType<typeof machine>[];
	connected?: string[];
	target?: string | null;
}) {
	const connected = new Set(opts.connected ?? opts.machines.map((entry) => entry.id));
	const sendToAgent = vi.fn(({ machineId }: { machineId: string }) => connected.has(machineId));
	const autoUpgradeRollout = getAutoUpgradeRolloutService();
	const target = opts.target === undefined ? '2.1.0' : opts.target;

	return {
		sendToAgent,
		autoUpgradeRollout,
		deps: {
			machineRepo: { listAutoUpgrading: async () => opts.machines },
			agentRelease: {
				pinned: true,
				target: async (reported: string | null) =>
					target === null || reported === target ? null : { version: target, downloadBaseUrl: `https://h/${target}` }
			},
			autoUpgradeRollout,
			socketRegistry: {
				getAgentSocket: (id: string) => (connected.has(id) ? {} : null),
				sendToAgent,
				broadcastToUi: vi.fn()
			},
			log: { info: vi.fn(), error: vi.fn() }
		} as unknown as AutoUpgradeDeps
	};
}

describe('sweepAutoUpgrades', () => {
	it('offers the target, unforced, only to connected machines that need it', async () => {
		const { deps: d, sendToAgent } = deps({
			machines: [machine('offline'), machine('current', '2.1.0'), machine('silent', null), machine('due')],
			connected: ['current', 'silent', 'due']
		});

		expect(await sweepAutoUpgrades(d)).toBe(1);
		expect(sendToAgent).toHaveBeenCalledExactlyOnceWith({
			machineId: 'due',
			message: { type: 'upgrade', version: '2.1.0', downloadBaseUrl: 'https://h/2.1.0', force: false }
		});
	});

	it('trickles a release out rather than offering the whole fleet at once', async () => {
		const machines = Array.from({ length: MAX_OFFERS_PER_SWEEP + 2 }, (_, i) => machine(`m${i}`));
		const { deps: d, sendToAgent } = deps({ machines });

		expect(await sweepAutoUpgrades(d)).toBe(MAX_OFFERS_PER_SWEEP);
		expect(await sweepAutoUpgrades(d)).toBe(2);
		expect(await sweepAutoUpgrades(d)).toBe(0);
		expect(sendToAgent).toHaveBeenCalledTimes(MAX_OFFERS_PER_SWEEP + 2);
	});

	it('skips a machine the rollout refuses without spending its slot', async () => {
		const { deps: d, sendToAgent, autoUpgradeRollout } = deps({ machines: [machine('refused'), machine('due')] });

		autoUpgradeRollout.recordDecline({ machineId: 'refused', version: '2.1.0', retryable: false, queued: false });

		expect(await sweepAutoUpgrades(d)).toBe(1);
		expect(sendToAgent).toHaveBeenCalledOnce();
		expect(sendToAgent.mock.calls[0]![0].machineId).toBe('due');
	});

	it('offers nothing when there is no release to go to', async () => {
		const { deps: d, sendToAgent } = deps({ machines: [machine('m1')], target: null });

		expect(await sweepAutoUpgrades(d)).toBe(0);
		expect(sendToAgent).not.toHaveBeenCalled();
	});
});
