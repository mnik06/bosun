// What each running slice is doing right now, held in memory rather than on the
// row. Activity lines land on every tool call — persisting them would be a write
// per file read — and they are worth nothing once the run ends, so the process
// that holds the sockets is the right place for them.
//
// The reason it exists at all is that the browser used to be the only holder:
// the label arrived on a socket frame and nowhere else, so a reload, a reconnect
// or opening the queue mid-run showed a spinner with no line under it until the
// session happened to touch its next tool — which can be minutes into a build.
//
// Lost on restart, which is the same guarantee the socket registry gives and for
// the same reason: it describes a live session, and a dead process has none.
export function getRunActivityService() {
	const labels = new Map<string, string>();

	return {
		record(opts: { runId: string; label: string }): void {
			labels.set(opts.runId, opts.label);
		},

		// Dropped when the run settles, so a finished bullet cannot leave its last
		// line behind for the next reader to mistake for something still happening.
		forget(runId: string): void {
			labels.delete(runId);
		},

		label(runId: string): string | null {
			return labels.get(runId) ?? null;
		}
	};
}

export type RunActivityService = ReturnType<typeof getRunActivityService>;
