import { type AgentMsg } from '../protocol';
import { UPGRADE_EXIT_CODE } from '../services/upgrade.service';
import { AGENT_VERSION } from '../version';
import { type RouterDeps } from './router';

// A deferred upgrade lands within a sweep of the machine going idle.
const UPGRADE_SWEEP_MS = 15_000;

export interface UpgradeTarget {
	version: string;
	downloadBaseUrl: string;
	force: boolean;
}

export function createUpgradeControl(
	deps: Pick<RouterDeps, 'services' | 'sessions' | 'executions' | 'integrations' | 'onboarding' | 'bugfix' | 'quickFixes'> & {
		send: (message: AgentMsg) => void;
	}
): { onUpgrade: (target: UpgradeTarget) => Promise<void>; stop: () => void } {
	const { send } = deps;

	// Held when the machine is busy rather than dropped. Without it a deferral is
	// a dead end: the operator presses Refresh, nothing happens, and they have to
	// guess when the machine is free and press again.
	let pendingUpgrade: UpgradeTarget | null = null;

	const sessionsRunning = (): number =>
		deps.sessions.running() +
		deps.executions.running() +
		deps.integrations.running() +
		deps.onboarding.running() +
		deps.bugfix.running() +
		deps.quickFixes.running();

	const install = async (target: UpgradeTarget): Promise<void> => {
		// The warm sessions are ended before the swap, not left to be orphaned:
		// they are detached processes, so exiting without this leaves a `claude`
		// per idle grill running against a worktree with nobody listening.
		deps.sessions.endIdle();
		deps.bugfix.endIdle();

		try {
			await deps.services.upgrade.apply(target);

			// After the install, never before: a version cleared from the block
			// list by an attempt that then failed to download would be offered
			// again on the next refresh with nothing having changed.
			if (target.force) {
				deps.services.upgrade.unblock(target.version);
			}

			console.log(`upgrade: installed ${target.version}, restarting`);
			process.exit(UPGRADE_EXIT_CODE);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			console.error(`upgrade failed: ${message}`);
			send({
				type: 'upgrade.declined',
				version: target.version,
				reason: `install failed: ${message}`,
				retryable: true,
				queued: false
			});
		}
	};

	// Exits rather than restarting itself: `Restart=on-failure` is what brings
	// the unit back, now running the binary that was just swapped in.
	const onUpgrade = async (target: UpgradeTarget): Promise<void> => {
		const decision = deps.services.upgrade.decide({
			current: AGENT_VERSION,
			target: target.version,
			sessionsRunning: sessionsRunning(),
			force: target.force
		});

		console.log(`upgrade: ${decision.reason}`);

		if (decision.proceed) {
			await install(target);

			return;
		}

		// A newer offer replaces an older one: whatever is waiting should be the
		// version the backend last said was current.
		pendingUpgrade = decision.deferred ? target : null;

		// Said out loud, not just logged. The operator pressed a button and the
		// only place the answer used to appear was a file on this box.
		send({
			type: 'upgrade.declined',
			version: target.version,
			reason: decision.reason,
			retryable: decision.retryable,
			queued: decision.deferred
		});
	};

	// Polled rather than pushed from the places a session ends: several paths
	// finish one — a result, an error, a cancel, a reap — and a callback wired
	// into each is a callback the next one forgets. The cost of being up to a
	// sweep late is nothing next to an upgrade that never lands.
	const upgradeSweep = setInterval(() => {
		const target = pendingUpgrade;

		if (target === null || sessionsRunning() > 0) {
			return;
		}

		pendingUpgrade = null;
		console.log(`upgrade: the machine is idle — installing ${target.version} now`);
		void install(target);
	}, UPGRADE_SWEEP_MS);

	upgradeSweep.unref();

	return {
		onUpgrade,
		stop: () => {
			clearInterval(upgradeSweep);
		}
	};
}
