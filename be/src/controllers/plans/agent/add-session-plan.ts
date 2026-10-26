import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanChanged } from 'src/controllers/line/shared/announce';
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
//
// It is hidden until the session has published every plan it writes. A plan
// listed the moment the split was agreed sat empty beside the one being grilled,
// with a chat nobody asked anything in. Its number is taken now regardless,
// because the plans of one session cite each other by it while they are written.
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

	// Not tied to whether the session plan is published yet: a session that published
	// its first part and only then added the rest was refused here, and had no way left
	// to write the second plan. A ready plan is back in `planning` the moment the
	// person types into its chat, so this only refuses a plan nobody is talking to.
	if (session.status !== 'planning') {
		throw new HttpError(409, 'plans are added by a session that is running');
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
		sessionPlanId: session.id,
		hidden: true
	});

	await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'user',
		content: { text: opts.input }
	});

	announcePlanChanged({ socketRegistry: opts.socketRegistry, projectId: session.projectId, planId: session.id });

	return plan;
}
