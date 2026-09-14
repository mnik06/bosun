import { type BuildSummary } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { verifyLine } from 'src/controllers/line/schedule';
import { loadRepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { planStateOf } from 'src/controllers/line/shared/plan-state';
import { describeReason } from 'src/controllers/line/shared/reason';
import { ACTIVE_BUILD_STATUSES, type Build, type SliceRun } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { type PlanState } from 'src/types/PlanStateSchema';

export interface PlanListEntry extends Plan {
	state: PlanState;
	build: BuildSummary | null;
	reason: string | null;
	ownerEmail: string | null;
}

function summaryOf(build: Build, runs: SliceRun[]): BuildSummary {
	const bullets = runs.filter((run) => run.buildId === build.id && run.phase === null);

	return {
		id: build.id,
		status: build.status,
		needsYouReason: build.needsYouReason,
		position: build.position,
		machineId: build.machineId,
		prNumber: build.prNumber,
		prUrl: build.prUrl,
		bulletsDone: bullets.filter((run) => run.status === 'done').length,
		bulletsTotal: bullets.length,
		createdAt: build.createdAt,
		finishedAt: build.finishedAt
	};
}

// A reason for every live build comes from its repository's line as a whole — what
// it waits on, where it stands — so each repository with one is read once.
async function reasons(deps: LineDeps, builds: Build[]): Promise<Map<string, string | null>> {
	const live = builds.filter((build) => ACTIVE_BUILD_STATUSES.includes(build.status));
	const found = new Map<string, string | null>();

	for (const repositoryId of new Set(live.map((build) => build.repositoryId))) {
		const snapshot = await loadRepositorySnapshot(deps, { repositoryId });
		const verify = snapshot ? verifyLine(snapshot) : [];

		for (const state of snapshot?.states ?? []) {
			found.set(state.build.id, describeReason({ state, snapshot: snapshot!, verifyLine: verify }));
		}
	}

	for (const build of builds.filter((entry) => !found.has(entry.id))) {
		found.set(build.id, build.status === 'merged' && build.prNumber !== null ? `PR #${build.prNumber} merged` : build.failureReason);
	}

	return found;
}

// One read per kind for the whole list rather than per plan: the list is the screen
// that grows, and a lookup per row is what makes it slow without anybody noticing.
export async function listPlans(deps: LineDeps, opts: { projectId: string }): Promise<PlanListEntry[]> {
	const plans = await deps.planRepo.listOwned(opts.projectId);
	const latest = await deps.buildRepo.latestForPlans(plans.map((plan) => plan.id));
	const builds = [...latest.values()];
	const [runs, owners, why] = await Promise.all([
		deps.sliceRunRepo.listForBuilds(builds.map((build) => build.id)),
		deps.userRepo.listByIds([...new Set(plans.flatMap((plan) => plan.createdByUserId ?? []))]),
		reasons(deps, builds)
	]);
	const emails = new Map(owners.map((user) => [user.id, user.email]));

	return plans.map((plan) => {
		const build = latest.get(plan.id) ?? null;

		return {
			...plan,
			state: planStateOf({ plan, build }),
			build: build === null ? null : summaryOf(build, runs),
			reason: build === null ? null : why.get(build.id) ?? null,
			ownerEmail: plan.createdByUserId === null ? null : emails.get(plan.createdByUserId) ?? null
		};
	});
}
