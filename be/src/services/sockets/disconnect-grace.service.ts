// A socket that closed is not yet a machine that is gone. The agent keeps its
// `claude` processes across a reconnect and names the runs it still holds on
// `hello`, so a socket a proxy timed out — or a deploy took down — says nothing
// about whether the bullet on that machine is still being built. Settling on the
// close itself is what turned a blip into a failed bullet and a paused queue.
//
// Long enough to cover the agent's own reconnect: it backs off to 30s between
// attempts, plus jitter, plus whatever the outage itself cost.
const GRACE_MS = 90_000;

export function getDisconnectGraceService(deps: { graceMs?: number } = {}) {
	const graceMs = deps.graceMs ?? GRACE_MS;
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	function cancel(machineId: string): void {
		const timer = timers.get(machineId);

		if (timer === undefined) {
			return;
		}

		clearTimeout(timer);
		timers.delete(machineId);
	}

	return {
		// One window per machine, restarted by the newest close: a machine that flaps
		// closes a socket every few seconds, and settling on the first of those would
		// land in the middle of a reconnect that is still happening.
		schedule(opts: { machineId: string; settle: () => Promise<void> | void }): void {
			cancel(opts.machineId);

			const timer = setTimeout(() => {
				timers.delete(opts.machineId);
				void opts.settle();
			}, graceMs);

			// Not worth holding the process open for: a settle a shutdown skips is one
			// the next `hello` does instead, against better information than this.
			timer.unref();
			timers.set(opts.machineId, timer);
		},

		// Called when the machine is back, before anything reads a run's status. The
		// reconnect settles its own stranded work against the runs the agent says it
		// still holds, which is strictly more than this window knows.
		cancel,

		pending(machineId: string): boolean {
			return timers.has(machineId);
		}
	};
}

export type DisconnectGraceService = ReturnType<typeof getDisconnectGraceService>;
