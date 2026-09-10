import { HttpError } from 'src/api/errors/HttpError';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { requireHost } from 'src/controllers/plans/shared/plan-hosting';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';
import { type PreparePlan } from 'src/types/protocol';

// A plan being rewritten under a queue that is already running it would change
// the bullets out from under the session executing them, so the selection is
// held to plans that are settled and not in flight — the same bar the push
// endpoint applies, for the same reason.
function selectionRefusal(plans: Plan[]): string | null {
	const unconfirmed = plans.filter(
		(plan) => plan.status !== 'ready' || plan.confirmedAt === null
	);

	if (unconfirmed.length > 0) {
		return `Only a confirmed plan can be prepared for parallel work: ${unconfirmed
			.map((plan) => `#${plan.number}`)
			.join(', ')}`;
	}

	// A queue runs in a worktree of one machine's repository, so plans on two
	// machines have nowhere common to run and no shared foundation to build once.
	if (new Set(plans.map((plan) => plan.machineId)).size > 1) {
		return 'Those plans are on different machines. A queue runs in a worktree of one machine, so a shared foundation has nowhere common to be built.';
	}

	return null;
}

function planInput(plans: Plan[]): string {
	return [
		'Prepare these plans for parallel work:',
		...plans.map((plan) => `- #${plan.number} ${plan.title ?? 'Untitled'}`)
	].join('\n');
}

async function artifacts(opts: {
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	planBlockerRepo: PlanBlockerRepo;
	planRepo: PlanRepo;
	projectId: string;
	plans: Plan[];
}): Promise<PreparePlan[]> {
	const ids = opts.plans.map((plan) => plan.id);
	const selected = new Set(ids);
	const [acs, slices, edges] = await Promise.all([
		opts.acRepo.listByPlans(ids),
		opts.sliceRepo.listByPlans(ids),
		opts.planBlockerRepo.listEdges(ids)
	]);
	// Blockers outside the selection are looked up rather than resolved against
	// the selection: unresolved they read to the session as "blocked by nothing",
	// and `set_blockers` replaces a plan's list wholesale, so the next declaration
	// would silently retract a dependency nobody meant to drop.
	const outside = await opts.planRepo.listOwnedByIds({
		projectId: opts.projectId,
		ids: [...new Set(edges.map((edge) => edge.blockedByPlanId))].filter(
			(id) => !selected.has(id)
		)
	});
	const numberById = new Map(
		[...opts.plans, ...outside].map((plan) => [plan.id, plan.number])
	);

	return opts.plans.map((plan) => ({
		id: plan.id,
		number: plan.number,
		title: plan.title,
		bodyMd: plan.bodyMd,
		blockedBy: edges
			.filter((edge) => edge.planId === plan.id)
			.flatMap((edge) => {
				const number = numberById.get(edge.blockedByPlanId);

				return number === undefined
					? []
					: [{ number, selected: selected.has(edge.blockedByPlanId) }];
			}),
		acs: acs
			.filter((ac) => ac.planId === plan.id)
			.map((ac) => ({ code: ac.code, text: ac.text })),
		slices: slices
			.filter((slice) => slice.planId === plan.id)
			.map((slice) => ({
				ordinal: slice.ordinal,
				kind: slice.kind,
				title: slice.title,
				bodyMd: slice.bodyMd
			}))
	}));
}

export async function preparePlans(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	planBlockerRepo: PlanBlockerRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	machineRepo: MachineRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	projectId: string;
	createdByUserId: string;
	planIds: string[];
}): Promise<Plan> {
	const wanted = [...new Set(opts.planIds)];
	const selected = await opts.planRepo.listOwnedByIds({
		projectId: opts.projectId,
		ids: wanted
	});

	if (selected.length !== wanted.length) {
		throw new HttpError(404, 'Plan not found');
	}

	const refusal = selectionRefusal(selected);

	if (refusal) {
		throw new HttpError(400, refusal);
	}

	const machine = await requireHost({
		machineRepo: opts.machineRepo,
		socketRegistry: opts.socketRegistry,
		machineId: selected[0]!.machineId,
		projectId: opts.projectId
	});
	const input = planInput(selected);
	const plans = await artifacts({
		acRepo: opts.acRepo,
		sliceRepo: opts.sliceRepo,
		planBlockerRepo: opts.planBlockerRepo,
		planRepo: opts.planRepo,
		projectId: opts.projectId,
		plans: selected
	});

	const plan = await opts.planRepo.create({
		id: opts.idService.createPlanId(),
		projectId: opts.projectId,
		createdByUserId: opts.createdByUserId,
		machineId: machine.id,
		input,
		// A preparation plan is schema, contracts and shared types, so there is no
		// interface to drive and no verify bullet to cut. Not auto: the session is
		// reading dependencies off plans rather than off implementations, and the
		// person who selected them is the only one who can confirm the map before
		// five plans are rewritten against it.
		verifyInUi: false,
		auto: false,
		preparesPlanIds: selected.map((entry) => entry.id)
	});

	await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'user',
		content: { text: input }
	});

	const dispatched = opts.socketRegistry.sendToAgent({
		machineId: machine.id,
		message: {
			type: 'plan.prepare',
			planId: plan.id,
			planNumber: plan.number,
			auto: plan.auto,
			plans,
			notes: machine.projectProfile?.notes ?? null
		}
	});

	if (!dispatched) {
		const failed = await opts.planRepo.update({
			id: plan.id,
			status: 'failed',
			failureReason: 'the machine went offline before the session started'
		});

		announcePlan({ socketRegistry: opts.socketRegistry, plan: failed ?? plan });

		return failed ?? plan;
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan });

	return plan;
}
