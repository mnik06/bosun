import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { broadcastToPlan, broadcastToUi } from 'src/services/sockets/registry.service';
import { type Plan, type PlanMessage } from 'src/types/PlanSchema';

// Two fan-outs with different audiences. The plan row goes to every tab the
// owner has open, because the plans list has to update without being subscribed
// to a chat. The transcript and the artifact go only to sockets watching that
// plan, because they are high-volume and mean nothing anywhere else.
export function announcePlan(plan: Plan): void {
	broadcastToUi({ userId: plan.userId, message: { type: 'plan.updated', plan } });
}

export function announcePlanMessage(opts: { planId: string; message: PlanMessage }): void {
	broadcastToPlan({
		planId: opts.planId,
		message: { type: 'plan.message', planId: opts.planId, message: opts.message }
	});
}

export async function announcePlanArtifact(opts: {
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	planId: string;
}): Promise<void> {
	const [acs, slices] = await Promise.all([
		opts.acRepo.listByPlan(opts.planId),
		opts.sliceRepo.listByPlan(opts.planId)
	]);

	broadcastToPlan({
		planId: opts.planId,
		message: { type: 'plan.artifact', planId: opts.planId, acs, slices }
	});
}
