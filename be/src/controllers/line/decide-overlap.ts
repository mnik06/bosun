import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { consumeInstead } from 'src/controllers/line/shared/detect-dependencies';
import { sayToPlan } from 'src/controllers/plans/say-to-plan';
import { type Build, type OverlapChoice, type OverlapDecision } from 'src/types/BuildSchema';
import { contractKey, schemaKey, type Footprint } from 'src/types/FootprintSchema';
import { type Plan } from 'src/types/PlanSchema';

function redefine(opts: { footprint: Footprint; key: string; definition: string }): Footprint {
	return {
		...opts.footprint,
		schema: opts.footprint.schema.map((change) => (schemaKey(change) === opts.key ? { ...change, definition: opts.definition } : change)),
		contracts: opts.footprint.contracts.map((change) => (contractKey(change) === opts.key ? { ...change, shape: opts.definition } : change))
	};
}

async function useTheirs(deps: LineDeps, opts: { decision: OverlapDecision; plan: Plan; provider: Plan }): Promise<void> {
	const { decision, plan, provider } = opts;
	const slices = await deps.sliceRepo.listByPlan(plan.id);

	for (const slice of slices) {
		const footprint = consumeInstead({ footprint: slice.footprint, key: decision.item.key, providerNumber: provider.number });

		if (JSON.stringify(footprint) !== JSON.stringify(slice.footprint)) {
			await deps.sliceRepo.updateInPlan({ id: slice.id, planId: plan.id, footprint });
		}
	}

	await deps.planAmendmentRepo.create({
		id: deps.idService.createAmendmentId(),
		planId: plan.id,
		sourcePlanId: provider.id,
		text: `\`${decision.item.label}\` comes from #${provider.number} — use it, do not create it`
	});
	await deps.planDependencyRepo.createMany([
		{
			id: deps.idService.createDependencyId(),
			planId: plan.id,
			providerPlanId: provider.id,
			providerSliceId: decision.item.providerSliceId,
			source: 'detected',
			reason: `uses ${decision.item.label} from #${provider.number}`
		}
	]);
}

// Offered only while the earlier plan's foundation is unbuilt: after that, changing
// its definition means changing code that already exists.
async function changeTheirs(deps: LineDeps, opts: { decision: OverlapDecision; plan: Plan; provider: Plan }): Promise<void> {
	const { decision, plan, provider } = opts;
	const providerSlice = decision.item.providerSliceId ? await deps.sliceRepo.getById(decision.item.providerSliceId) : null;

	if (providerSlice) {
		await deps.sliceRepo.updateInPlan({
			id: providerSlice.id,
			planId: provider.id,
			footprint: redefine({ footprint: providerSlice.footprint, key: decision.item.key, definition: decision.item.ours })
		});
	}

	await deps.planAmendmentRepo.create({
		id: deps.idService.createAmendmentId(),
		planId: provider.id,
		sourcePlanId: plan.id,
		text: `\`${decision.item.label}\` is now defined as \`${decision.item.ours}\`, to match #${plan.number}`
	});
	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: provider.projectId, planId: provider.id });
	await useTheirs(deps, opts);
}

async function foundationLanded(deps: LineDeps, decision: OverlapDecision): Promise<boolean> {
	const build = await deps.buildRepo.liveForPlan(decision.providerPlanId);
	const runs = build ? await deps.sliceRunRepo.listForBuild(build.id) : [];

	return runs.some((run) => run.sliceId === decision.item.providerSliceId && run.phase === null && run.status === 'done');
}

async function validate(deps: LineDeps, opts: { decision: OverlapDecision | null; chosen: OverlapChoice }): Promise<OverlapDecision> {
	const { decision } = opts;

	if (!decision) {
		throw new HttpError(404, 'Decision not found');
	}

	if (decision.chosen !== null) {
		throw new HttpError(409, 'That overlap has already been decided');
	}

	if (!decision.options.includes(opts.chosen)) {
		throw new HttpError(400, 'That choice is not offered for this overlap');
	}

	if (opts.chosen === 'change_theirs' && (await foundationLanded(deps, decision))) {
		throw new HttpError(409, 'The earlier plan\'s foundation has already landed, so its definition can no longer change');
	}

	return decision;
}

// An overlap decision belongs to the plan being approved, not the one it collides
// with. Renaming sends the plan back to its session with what to rename — a
// revision, which clears its approval — and takes it out of the line meanwhile.
export async function decideOverlap(
	deps: LineDeps,
	opts: { id: string; projectId: string; userId: string; chosen: OverlapChoice }
): Promise<void> {
	const decision = await validate(deps, { decision: await deps.overlapDecisionRepo.getOwnedById(opts), chosen: opts.chosen });
	const [plan, provider, build] = await Promise.all([
		deps.planRepo.getOwnedById({ id: decision.planId, projectId: opts.projectId }),
		deps.planRepo.getOwnedById({ id: decision.providerPlanId, projectId: opts.projectId }),
		deps.buildRepo.liveForPlan(decision.planId)
	]);

	if (!plan || !provider) {
		throw new HttpError(404, 'Plan not found');
	}

	if (opts.chosen === 'rename' && !deps.socketRegistry.getAgentSocket(plan.machineId)) {
		throw new HttpError(409, 'the machine this plan was written on is offline, so its session cannot rename it');
	}

	if (!(await deps.overlapDecisionRepo.decide({ id: decision.id, chosen: opts.chosen, userId: opts.userId }))) {
		throw new HttpError(409, 'That overlap has already been decided');
	}

	if (opts.chosen === 'rename') {
		await rename(deps, { decision, plan, provider, build, projectId: opts.projectId });

		return;
	}

	await (opts.chosen === 'use_theirs' ? useTheirs : changeTheirs)(deps, { decision, plan, provider });
	await resumeWhenDecided(deps, { plan, build });
}

async function rename(
	deps: LineDeps,
	opts: { decision: OverlapDecision; plan: Plan; provider: Plan; build: Build | null; projectId: string }
): Promise<void> {
	const { decision, plan, provider, build } = opts;

	if (build) {
		const cancelled = await deps.buildRepo.update({ id: build.id, status: 'cancelled', finishedAt: new Date() });

		if (cancelled) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: cancelled });
		}
	}

	await sayToPlan({
		...deps,
		id: plan.id,
		projectId: opts.projectId,
		text: `#${provider.number} already creates \`${decision.item.label}\` as \`${decision.item.theirs}\`, and this plan creates it as \`${decision.item.ours}\`. Rename this plan's piece so the two no longer collide, and republish.`
	});
}

async function resumeWhenDecided(deps: LineDeps, opts: { plan: Plan; build: Build | null }): Promise<void> {
	const { plan, build } = opts;
	const open = (await deps.overlapDecisionRepo.listForPlan(plan.id)).filter((entry) => entry.chosen === null);

	if (build && open.length === 0 && build.status === 'needs_you' && build.needsYouReason === 'overlap') {
		const resumed = await deps.buildRepo.update({ id: build.id, status: 'scheduled', needsYouReason: null, failureReason: null });

		if (resumed) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: resumed });
		}
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });

	if (build) {
		await scheduleRepository(deps, { repositoryId: build.repositoryId });
	}
}
