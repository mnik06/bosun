// Text deltas arrive by the thousand in a thirty-minute grill. They are forwarded
// to the browser and buffered here until the session does something else — a
// tool call, a question, the end — which is the only boundary at which a block of
// assistant prose is known to be complete. Persisting each delta instead would
// turn one session into a table nobody can read.
const buffers = new Map<string, string>();

export function appendPlanText(opts: { planId: string; delta: string }): void {
	buffers.set(opts.planId, `${buffers.get(opts.planId) ?? ''}${opts.delta}`);
}

export function takePlanText(planId: string): string | null {
	const buffered = buffers.get(planId)?.trim();

	buffers.delete(planId);

	return buffered && buffered.length > 0 ? buffered : null;
}

export function dropPlanText(planId: string): void {
	buffers.delete(planId);
}
