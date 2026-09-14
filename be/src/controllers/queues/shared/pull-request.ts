import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { pullRequestBody } from 'src/controllers/queues/pull-request-body';
import { type Plan } from 'src/types/PlanSchema';
import { type Queue, type QueueItem, type SliceRun } from 'src/types/QueueSchema';

// The verify bullet's own words, found through its slice rather than by position:
// a plan does not have to end with one, and the last run is not reliably it.
async function verifyReportFor(
	deps: AdvanceDeps,
	opts: { planId: string; runs: { sliceId: string; report: string | null }[] }
): Promise<string | null> {
	const slices = await deps.sliceRepo.listByPlan(opts.planId);
	const verify = slices.find((slice) => slice.kind === 'verify');

	if (!verify) {
		return null;
	}

	return opts.runs.find((run) => run.sliceId === verify.id)?.report ?? null;
}

// Asked for only when every bullet landed and something was committed. A plan
// that failed keeps its branch for somebody to look at, but a pull request for
// work that did not finish would put it in front of reviewers as though it had.
export async function publishablePlan(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem }
): Promise<{ plan: Plan; runs: SliceRun[]; branch: string; baseRef: string } | null> {
	const runs = await deps.sliceRunRepo.listForItem(opts.item.id);

	if (runs.length === 0 || runs.some((run) => run.status !== 'done') || runs.every((run) => run.commitSha === null)) {
		return null;
	}

	const plan = await deps.planRepo.getByIdForMachine({ id: opts.item.planId, machineId: opts.queue.machineId });

	if (!plan || opts.item.branch === null || opts.queue.baseRef === null) {
		return null;
	}

	return { plan, runs, branch: opts.item.branch, baseRef: opts.queue.baseRef };
}

// Assembled from what bosun already holds rather than from anything the session
// writes at the end. A decision recorded while executing is on the plan whether
// or not the last bullet remembered to mention it, and the reviewer reads this
// before the diff.
export async function pullRequestText(
	deps: AdvanceDeps,
	opts: { plan: Plan; runs: SliceRun[] }
): Promise<{ title: string; body: string }> {
	const [acs, decisions, verifyReport] = await Promise.all([
		deps.acRepo.listByPlan(opts.plan.id),
		deps.planDecisionRepo.listByPlan(opts.plan.id),
		verifyReportFor(deps, { planId: opts.plan.id, runs: opts.runs })
	]);

	return {
		title: `#${opts.plan.number} ${opts.plan.title ?? 'Untitled plan'}`,
		body: pullRequestBody({
			plan: opts.plan,
			acs,
			decisions,
			verifyReport,
			planUrl: `${deps.appUrl}/plans/${opts.plan.id}?tab=execution`
		})
	};
}
