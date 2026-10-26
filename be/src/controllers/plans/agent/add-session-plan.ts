import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

// Every plan in a session is one more thing a person reads and approves, and a
// ticket that needs more than this is several tickets.
export const MAX_PLANS_PER_SESSION = 6;

// One ticket, grilled once, published as several plans. The new plan is a plain
// plan that happens to have been written by another plan's session: it carries
// that plan's settings because the grill that writes it ran under them, and it
// is `planning` until the session's turn ends, exactly like the plan it sits beside.
export async function addSessionPlan(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	machineId: string;
	title: string;
	input: string;
}): Promise<Plan> {
	const session = await getMachinePlan({ planRepo: opts.planRepo, id: opts.id, machineId: opts.machineId });

	if (session.sessionPlanId !== null) {
		throw new HttpError(409, 'plans are added to the plan that started the session, not to one it added');
	}

	// A revision session runs against a published plan and has no grill behind it
	// to split; only the session that is writing the plan for the first time can.
	if (session.status !== 'planning' || session.bodyMd !== null) {
		throw new HttpError(409, 'plans are added while the session is writing its first plan, before anything is published');
	}

	const siblings = await opts.planRepo.listInSession(session.id);

	if (siblings.length + 1 >= MAX_PLANS_PER_SESSION) {
		throw new HttpError(409, `a session writes at most ${MAX_PLANS_PER_SESSION} plans — fold what is left into one of them`);
	}

	const plan = await opts.planRepo.create({
		id: opts.idService.createPlanId(),
		projectId: session.projectId,
		createdByUserId: session.createdByUserId,
		machineId: session.machineId,
		repositoryId: session.repositoryId,
		input: opts.input,
		verifyInUi: session.verifyInUi,
		auto: session.auto,
		afk: session.afk,
		title: opts.title,
		sessionPlanId: session.id
	});

	await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'user',
		content: { text: opts.input }
	});

	announcePlan({ socketRegistry: opts.socketRegistry, plan });

	return plan;
}
