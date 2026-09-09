import { HttpError } from 'src/api/errors/HttpError';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan, announcePlanMessage } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// The transcript is written before the frame goes out, so a line the person
// typed survives an agent that drops it. The machine is checked first for the
// opposite reason: a message nothing can act on should be refused at the button
// rather than land in a transcript nobody is reading.
export async function sayToPlan(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	userId: string;
	text: string;
}): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: opts.planRepo, id: opts.id, userId: opts.userId });

	if (!opts.socketRegistry.getAgentSocket(plan.machineId)) {
		throw new HttpError(409, 'this machine is offline');
	}

	const message = await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'user',
		content: { text: opts.text }
	});

	announcePlanMessage({
		socketRegistry: opts.socketRegistry,
		planId: plan.id,
		message
	});

	// Back to planning even when the plan was ready: what the person just asked
	// for may rewrite it, and a plan that says "ready" while a session is editing
	// it is one somebody pushes to a queue mid-revision.
	if (plan.status !== 'planning') {
		const updated = await opts.planRepo.update({
			id: plan.id,
			status: 'planning',
			failureReason: null
		});

		if (updated) {
			announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });
		}
	}

	const [acs, slices] = await Promise.all([
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id)
	]);
	const ordinalOf = new Map(slices.map((slice) => [slice.id, slice.ordinal]));

	opts.socketRegistry.sendToAgent({
		machineId: plan.machineId,
		message: {
			type: 'plan.say',
			planId: plan.id,
			text: opts.text,
			plan: {
				verifyInUi: plan.verifyInUi,
				auto: plan.auto,
				title: plan.title,
				bodyMd: plan.bodyMd,
				acs: acs.map((ac) => ({
					code: ac.code,
					text: ac.text,
					sliceOrdinal: ac.sliceId === null ? null : ordinalOf.get(ac.sliceId) ?? null
				})),
				slices: slices.map((slice) => ({
					ordinal: slice.ordinal,
					kind: slice.kind,
					title: slice.title,
					bodyMd: slice.bodyMd
				}))
			}
		}
	});
}
