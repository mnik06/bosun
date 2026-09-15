import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import {
	consumeInstead,
	detectDependencies,
	type Detection,
	type ProviderPlan
} from 'src/controllers/line/shared/detect-dependencies';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { overlapViews } from 'src/controllers/line/shared/overlap-views';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { getBuildRepo } from 'src/repos/builds/build.repo';
import { getOverlapDecisionRepo } from 'src/repos/builds/overlap-decision.repo';
import { getPlanAmendmentRepo } from 'src/repos/builds/plan-amendment.repo';
import { getPlanDependencyRepo } from 'src/repos/builds/plan-dependency.repo';
import { getSliceRunRepo } from 'src/repos/builds/slice-run.repo';
import { getPlanRepo } from 'src/repos/plans/plan.repo';
import { getSliceRepo } from 'src/repos/plans/slice.repo';
import { type OverlapDecisionView } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { ACTIVE_BUILD_STATUSES, type Build } from 'src/types/BuildSchema';
import { type Plan, type Slice } from 'src/types/PlanSchema';

// The approved, unmerged plans in the repository, in the order they were approved:
// whichever was approved first owns a contested piece.
async function providerPlans(deps: LineDeps, plan: Plan): Promise<ProviderPlan[]> {
	const builds = await deps.buildRepo.listForRepository({ repositoryId: plan.repositoryId!, statuses: [...ACTIVE_BUILD_STATUSES, 'failed'] });
	const planIds = builds.map((build) => build.planId).filter((id) => id !== plan.id);
	const [plans, slices, runs] = await Promise.all([
		deps.planRepo.listByIds(planIds),
		deps.sliceRepo.listByPlans(planIds),
		deps.sliceRunRepo.listForBuilds(builds.map((build) => build.id))
	]);
	const landed = new Set(runs.filter((run) => run.phase === null && run.status === 'done').map((run) => run.sliceId));

	return plans
		.filter((entry) => entry.approvedAt !== null)
		.sort((a, b) => a.approvedAt!.getTime() - b.approvedAt!.getTime())
		.map((entry) => {
			const own = slices.filter((slice) => slice.planId === entry.id);

			return {
				planId: entry.id,
				number: entry.number,
				slices: own,
				foundationBuilt: own.some((slice) => slice.foundation && landed.has(slice.id))
			};
		});
}

function refusal(opts: { plan: Plan; live: Build | null; slices: Slice[] }): string | null {
	if (opts.plan.status !== 'ready') {
		return 'This plan is still being written';
	}

	if (opts.plan.repositoryId === null) {
		return 'This plan was written on a machine with no repository attached — only a repository has a line to join';
	}

	if (opts.live) {
		return 'This plan is already in the line';
	}

	return opts.slices.length === 0 ? 'This plan has nothing to build yet' : null;
}

async function write(deps: LineDeps, opts: { plan: Plan; slices: Slice[]; detection: Detection; providers: ProviderPlan[] }): Promise<Build> {
	const { plan, slices, detection } = opts;
	const numberOf = new Map(opts.providers.map((provider) => [provider.planId, provider.number]));

	return deps.db.transaction(async (tx) => {
		const buildRepo = getBuildRepo(tx);
		const sliceRepo = getSliceRepo(tx);
		const footprints = new Map(slices.map((slice) => [slice.id, slice.footprint]));

		await getPlanRepo(tx).update({ id: plan.id, approvedAt: new Date() });
		await getPlanDependencyRepo(tx).replaceForSource({
			planId: plan.id,
			source: 'detected',
			rows: detection.dependencies.map((dependency) => ({ id: deps.idService.createDependencyId(), planId: plan.id, source: 'detected', ...dependency }))
		});

		for (const amendment of detection.amendments) {
			await getPlanAmendmentRepo(tx).create({ id: deps.idService.createAmendmentId(), planId: plan.id, sourcePlanId: amendment.sourcePlanId, text: amendment.text });
			footprints.set(
				amendment.sliceId,
				consumeInstead({ footprint: footprints.get(amendment.sliceId)!, key: amendment.key, providerNumber: numberOf.get(amendment.sourcePlanId)! })
			);
		}

		for (const slice of slices.filter((entry) => footprints.get(entry.id) !== entry.footprint)) {
			await sliceRepo.updateInPlan({ id: slice.id, planId: plan.id, footprint: footprints.get(slice.id)! });
		}

		await getOverlapDecisionRepo(tx).deleteOpenForPlan(plan.id);

		for (const overlap of detection.overlaps) {
			await getOverlapDecisionRepo(tx).create({ id: deps.idService.createOverlapDecisionId(), planId: plan.id, providerPlanId: overlap.providerPlanId, item: overlap.item, options: overlap.options });
		}

		const build = await buildRepo.create({
			id: deps.idService.createBuildId(),
			planId: plan.id,
			repositoryId: plan.repositoryId!,
			status: detection.overlaps.length > 0 ? 'needs_you' : 'scheduled',
			needsYouReason: detection.overlaps.length > 0 ? 'overlap' : null,
			failureReason: detection.overlaps.length > 0 ? 'an overlap with an earlier plan needs a decision' : null
		});

		await getSliceRunRepo(tx).createMany(
			slices.map((slice) => ({
				id: deps.idService.createSliceRunId(),
				buildId: build.id,
				sliceId: slice.id,
				ordinal: slice.ordinal,
				phase: slice.kind === 'verify' ? ('drive' as const) : null
			}))
		);

		return build;
	});
}

// Approving is the last thing a person does before review: the plan joins its
// repository's line and nothing else has to happen before it runs. It is compared
// against every approved, unmerged plan there first — a plan creating what an
// earlier one creates identically is amended to use it, and one creating it
// differently waits on a person's decision.
export async function approvePlan(
	deps: LineDeps,
	opts: { id: string; projectId: string }
): Promise<{ build: Build; overlapDecisions: OverlapDecisionView[] }> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const [slices, live] = await Promise.all([deps.sliceRepo.listByPlan(plan.id), deps.buildRepo.liveForPlan(plan.id)]);
	const refused = refusal({ plan, live, slices });

	if (refused !== null) {
		throw new HttpError(409, refused);
	}

	const providers = await providerPlans(deps, plan);
	const detection = detectDependencies({ candidate: { planId: plan.id, number: plan.number, slices }, providers });
	const build = await write(deps, { plan, slices, detection, providers });
	const approved = (await deps.planRepo.getById(plan.id)) ?? plan;

	// Sign-off ends the warm grill: a revision of an approved plan starts from the
	// plan itself.
	deps.socketRegistry.sendToAgent({ machineId: plan.machineId, message: { type: 'plan.cancel', planId: plan.id } });
	announcePlan({ socketRegistry: deps.socketRegistry, plan: approved });
	announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build });
	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
	await notifyBuildStatus(deps, { plan: approved, build });
	await scheduleRepository(deps, { repositoryId: build.repositoryId });

	return {
		build: (await deps.buildRepo.getById(build.id)) ?? build,
		overlapDecisions: await overlapViews(deps, { decisions: await deps.overlapDecisionRepo.listForPlan(plan.id) })
	};
}
