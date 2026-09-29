// A release has to have been the current one for this long before any machine is
// offered it unasked. Refresh stays immediate, so the machines somebody upgrades
// by hand are the canary the unattended ones wait behind.
export const SOAK_MS = 60 * 60 * 1000;
// Distinct machines on which one version failed to install or came back rolled
// back. Past this the version is not offered unattended again until a restart.
export const HALT_AFTER_FAILURES = 2;

export type AutoOfferRefusal = 'soaking' | 'halted' | 'offered' | 'refused';

// Everything here lives in process memory, like the rest of the socket state: a
// restart forgets the soak clock (which only delays an offer) and the halt (which
// the machines that failed do not need — each blocks the version itself — so at
// worst it costs HALT_AFTER_FAILURES more machines a rollback).
export function getAutoUpgradeRolloutService(deps: { now?: () => number } = {}) {
	const now = deps.now ?? Date.now;
	const firstSeen = new Map<string, number>();
	const failures = new Map<string, Set<string>>();
	// The version last offered to each machine on its current connection. An agent
	// holds a deferred offer itself until the connection ends, so offering it again
	// would only repeat the same "queued" answer every sweep.
	const offered = new Map<string, string>();
	// Answers that asking again, unforced, cannot change: a blocked build, a
	// failed install, a binary that cannot replace itself.
	const refused = new Set<string>();

	const key = (opts: { machineId: string; version: string }) => `${opts.machineId}\u0000${opts.version}`;

	function halted(version: string): boolean {
		return (failures.get(version)?.size ?? 0) >= HALT_AFTER_FAILURES;
	}

	return {
		halted,

		// A pinned version skips the soak: pinning is the rollback lever, and a
		// rollback that waited an hour would leave the fleet on the bad build.
		refusal(opts: {
			machineId: string;
			version: string;
			pinned: boolean;
		}): AutoOfferRefusal | null {
			if (!firstSeen.has(opts.version)) {
				firstSeen.set(opts.version, now());
			}

			if (halted(opts.version)) {
				return 'halted';
			}

			if (refused.has(key(opts))) {
				return 'refused';
			}

			if (offered.get(opts.machineId) === opts.version) {
				return 'offered';
			}

			if (!opts.pinned && now() - firstSeen.get(opts.version)! < SOAK_MS) {
				return 'soaking';
			}

			return null;
		},

		markOffered(opts: { machineId: string; version: string }): void {
			offered.set(opts.machineId, opts.version);
		},

		// A fresh connection is a fresh agent process, which has forgotten any offer
		// it was holding until its work ended.
		forgetOffer(machineId: string): void {
			offered.delete(machineId);
		},

		// Returns true when this answer is the one that halted the version, so the
		// caller can say so once rather than on every later decline.
		recordDecline(opts: {
			machineId: string;
			version: string;
			retryable: boolean;
			queued: boolean;
		}): boolean {
			if (opts.queued) {
				return false;
			}

			refused.add(key(opts));

			// A retryable refusal that is not a deferral is either a failed install or
			// a build this machine already rolled back — both evidence against the
			// release. The non-retryable ones (not a packaged binary, already on it)
			// say something about the machine instead.
			if (!opts.retryable) {
				return false;
			}

			const wasHalted = halted(opts.version);
			const machines = failures.get(opts.version) ?? new Set<string>();

			machines.add(opts.machineId);
			failures.set(opts.version, machines);

			return !wasHalted && halted(opts.version);
		}
	};
}

export type AutoUpgradeRolloutService = ReturnType<typeof getAutoUpgradeRolloutService>;
