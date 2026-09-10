// A forced upgrade is asked for over HTTP and answered on the WebSocket that
// follows it: the refresh frame goes out, the agent reconnects and says `hello`,
// and only then is the upgrade offered. The flag has to survive that gap, and it
// belongs to neither request — so it waits here, in the process that holds the
// socket, exactly as pending pings do.
//
// Short-lived on purpose. A force that was never answered must not sit around
// arming an upgrade nobody asked for the next time this machine happens to
// reconnect.
const FORCE_TTL_MS = 2 * 60 * 1000;

export function getPendingUpgradesService(deps: { now?: () => number } = {}) {
	const now = deps.now ?? Date.now;
	const forced = new Map<string, number>();

	return {
		force(machineId: string): void {
			forced.set(machineId, now() + FORCE_TTL_MS);
		},

		// Read once. A forced offer the agent declines for some other reason is not
		// re-armed silently; the operator asks again and means it again.
		take(machineId: string): boolean {
			const expiresAt = forced.get(machineId);

			forced.delete(machineId);

			return expiresAt !== undefined && expiresAt > now();
		}
	};
}

export type PendingUpgradesService = ReturnType<typeof getPendingUpgradesService>;
