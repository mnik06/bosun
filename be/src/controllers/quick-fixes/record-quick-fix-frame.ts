import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { type AgentMsg } from 'src/types/protocol';

type QuickFixFrame = Extract<AgentMsg, { type: 'quickfix.done' | 'quickfix.error' }>;

// The quick fix named by the frame is checked against the machine's own claim, so
// an agent cannot settle a quick fix it was never dispatched. Opening the pull
// request and telling anyone about the result are not this row's job — settling it
// here is only what frees the capacity it held.
export async function recordQuickFixFrame(
	deps: LineDeps,
	opts: { machineId: string; frame: QuickFixFrame }
): Promise<void> {
	const quickFix = await deps.quickFixRepo.getForMachine({ id: opts.frame.quickFixId, machineId: opts.machineId });

	if (!quickFix) {
		return;
	}

	if (opts.frame.type === 'quickfix.error') {
		await deps.quickFixRepo.settle({ id: quickFix.id, status: 'failed', error: opts.frame.message });
	} else if (opts.frame.pushed) {
		await deps.quickFixRepo.settle({ id: quickFix.id, status: 'pushed' });
	} else {
		await deps.quickFixRepo.settle({
			id: quickFix.id,
			status: 'failed',
			error: opts.frame.pushError ?? 'the fix finished but did not push'
		});
	}

	// A settled quick fix hands its memory back, so a plan build held behind it gets
	// to start now rather than on the next unrelated nudge.
	await scheduleMachine(deps, { machineId: opts.machineId });
}
