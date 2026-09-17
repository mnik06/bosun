import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { notifyQuickFixStatus } from 'src/controllers/quick-fixes/shared/notify';
import { publishQuickFixPr } from 'src/controllers/quick-fixes/shared/publish-quick-fix-pr';
import { type AgentMsg } from 'src/types/protocol';
import { type QuickFix } from 'src/types/QuickFixSchema';

type QuickFixFrame = Extract<AgentMsg, { type: 'quickfix.done' | 'quickfix.error' }>;

// A pushed branch only settles `pushed` once its pull request is open — that is
// the deliverable AC-6 promises, not the push itself — so a GitHub failure here
// settles the row `failed` even though the branch stands.
async function settleQuickFix(deps: LineDeps, opts: { quickFix: QuickFix; frame: QuickFixFrame }): Promise<QuickFix | null> {
	const { quickFix, frame } = opts;

	if (frame.type === 'quickfix.error') {
		return deps.quickFixRepo.settle({ id: quickFix.id, status: 'failed', error: frame.message });
	}

	if (!frame.pushed) {
		return deps.quickFixRepo.settle({
			id: quickFix.id,
			status: 'failed',
			error: frame.pushError ?? 'the fix finished but did not push'
		});
	}

	const published = await publishQuickFixPr(deps, quickFix);

	return published.ok
		? deps.quickFixRepo.settle({ id: quickFix.id, status: 'pushed', prUrl: published.url })
		: deps.quickFixRepo.settle({ id: quickFix.id, status: 'failed', error: published.error });
}

// The quick fix named by the frame is checked against the machine's own claim, so
// an agent cannot settle a quick fix it was never dispatched.
export async function recordQuickFixFrame(
	deps: LineDeps,
	opts: { machineId: string; frame: QuickFixFrame }
): Promise<void> {
	const quickFix = await deps.quickFixRepo.getForMachine({ id: opts.frame.quickFixId, machineId: opts.machineId });

	if (!quickFix) {
		return;
	}

	const settled = await settleQuickFix(deps, { quickFix, frame: opts.frame });

	// A settled quick fix hands its memory back, so a plan build held behind it gets
	// to start now rather than on the next unrelated nudge.
	await scheduleMachine(deps, { machineId: opts.machineId });

	if (settled) {
		await notifyQuickFixStatus(deps, { quickFix: settled });
	}
}
