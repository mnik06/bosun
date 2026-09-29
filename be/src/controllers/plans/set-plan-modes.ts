import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { type Plan } from 'src/types/PlanSchema';

// `afk` is read at each dispatch, so a bullet already running keeps the tools it
// was started with and the change lands on the next one.
//
// `auto` and `verifyInUi` shape the grill itself, so they move only while there
// is a grill to shape: once a plan is published its bullets were cut to one
// verify setting, and its decisions were taken by whoever was answering.
export async function setPlanModes(
	deps: LineDeps,
	opts: { id: string; projectId: string; afk?: boolean; verifyInUi?: boolean; auto?: boolean }
): Promise<Plan> {
	const plan = await getOwnedPlan({
		planRepo: deps.planRepo,
		id: opts.id,
		projectId: opts.projectId
	});
	const grillModes = {
		...(opts.verifyInUi === undefined ? {} : { verifyInUi: opts.verifyInUi }),
		...(opts.auto === undefined ? {} : { auto: opts.auto })
	};
	const touchesGrill = Object.keys(grillModes).length > 0;

	if (touchesGrill && (plan.status !== 'planning' || plan.bodyMd !== null)) {
		throw new HttpError(409, 'auto-mode and UI verification are fixed once the plan is written');
	}

	const updated =
		(await deps.planRepo.update({
			id: plan.id,
			...(opts.afk === undefined ? {} : { afk: opts.afk }),
			...grillModes
		})) ?? plan;

	announcePlan({ socketRegistry: deps.socketRegistry, plan: updated });

	// Unconditional on whether a session is up: an agent holding none drops it,
	// and the next `plan.say` carries the plan's modes on its snapshot anyway.
	if (touchesGrill) {
		deps.socketRegistry.sendToAgent({
			machineId: updated.machineId,
			message: {
				type: 'plan.modes',
				planId: updated.id,
				verifyInUi: updated.verifyInUi,
				auto: updated.auto
			}
		});
	}

	return updated;
}
