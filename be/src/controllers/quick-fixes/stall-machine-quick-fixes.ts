import { type LineDeps } from 'src/controllers/line/line-deps';
import { notifyQuickFixStatus } from 'src/controllers/quick-fixes/shared/notify';

const STRANDED = 'the connection to the machine dropped, or its agent restarted, while this quick fix was running';

// The same agreement `stallMachineOnboarding` reaches for onboarding runs: `hello`
// names the quick fixes the agent still holds, and every other `running` one on
// this machine died with an earlier connection. Only a frame from the agent ever
// settles a quick fix, so without this one whose session is gone stays `running`
// for good — and keeps a build slot's memory held on the machine it ran on. An
// agent too old to send the list is left alone rather than read as holding none.
export async function stallMachineQuickFixes(
	deps: LineDeps,
	opts: { machineId: string; connectedAt: Date; heldQuickFixIds?: string[] }
): Promise<void> {
	if (opts.heldQuickFixIds === undefined) {
		return;
	}

	const held = new Set(opts.heldQuickFixIds);

	for (const quickFix of await deps.quickFixRepo.listActiveForMachine(opts.machineId)) {
		// Dispatched over this very connection: the agent may not have registered it yet.
		if (held.has(quickFix.id) || quickFix.createdAt.getTime() > opts.connectedAt.getTime()) {
			continue;
		}

		const settled = await deps.quickFixRepo.settle({ id: quickFix.id, status: 'failed', error: STRANDED });

		if (settled) {
			await notifyQuickFixStatus(deps, { quickFix: settled });
		}
	}
}
