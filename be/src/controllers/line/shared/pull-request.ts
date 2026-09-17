import { publishPullRequestToGithub } from 'src/controllers/github/shared/publish-pull-request';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { pullRequestBody } from 'src/controllers/line/shared/pull-request-body';
import { type Build } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

// The fix session's account when there is one — it quotes the drive's findings and
// says what it did about them — and the drive's when nothing was fixed.
function verifyReport(runs: { phase: string | null; status: string; report: string | null }[]): string | null {
	const done = runs.filter((run) => run.status === 'done' && run.report !== null);

	return (done.filter((run) => run.phase === 'fix').at(-1) ?? done.filter((run) => run.phase === 'drive').at(-1))?.report ?? null;
}

export async function pullRequestText(deps: LineDeps, opts: { plan: Plan; build: Build }): Promise<{ title: string; body: string }> {
	const [acs, decisions, runs, integrations, findings] = await Promise.all([
		deps.acRepo.listByPlan(opts.plan.id),
		deps.planDecisionRepo.listByPlan(opts.plan.id),
		deps.sliceRunRepo.listForBuild(opts.build.id),
		deps.integrationRepo.listForBuild(opts.build.id),
		deps.verifyFindingRepo.listForBuild(opts.build.id)
	]);
	const accepted = findings.filter((finding) => finding.status === 'accepted' && finding.acCode !== null);
	const people = new Map(
		(await deps.userRepo.listByIds([...new Set(accepted.flatMap((finding) => finding.acceptedByUserId ?? []))])).map((user) => [user.id, user.email])
	);
	const textOf = new Map(acs.map((ac) => [ac.code, ac.text]));

	return {
		title: `#${opts.plan.number} ${opts.plan.title ?? 'Untitled plan'}`,
		body: pullRequestBody({
			plan: opts.plan,
			acs,
			decisions,
			verifyReport: verifyReport(runs),
			planUrl: `${deps.appUrl}/plans/${opts.plan.id}?tab=changes`,
			integrations,
			knownGaps: accepted.map((finding) => ({
				code: finding.acCode!,
				text: textOf.get(finding.acCode!) ?? '',
				reproduction: finding.reproduction,
				acceptedBy: finding.acceptedByUserId === null ? null : people.get(finding.acceptedByUserId) ?? null
			})),
			leftFindings: findings.filter((finding) => finding.status === 'left')
		})
	};
}

// Opened, or updated when one is already open for the branch — its body and its
// base both, so a stacked plan's pull request follows its base as it moves. A
// failure is written on the build without changing its status: the branch is
// pushed and nothing about the work is in doubt.
export async function publishPullRequest(deps: LineDeps, opts: { plan: Plan; build: Build }): Promise<Build> {
	const { build } = opts;

	if (build.branch === null || build.baseBranch === null) {
		return (await deps.buildRepo.update({ id: build.id, failureReason: 'the branch is pushed, but this repository is no longer connected to a GitHub installation' })) ?? build;
	}

	const text = await pullRequestText(deps, opts);
	const published = await publishPullRequestToGithub(deps, {
		repositoryId: build.repositoryId,
		branch: build.branch,
		baseBranch: build.baseBranch,
		...text
	});

	if (!published.ok) {
		return (await deps.buildRepo.update({ id: build.id, failureReason: published.error })) ?? build;
	}

	const updated = await deps.buildRepo.update({ id: build.id, prNumber: published.number, prUrl: published.url, failureReason: null });

	if (build.prNumber === null) {
		summarize(deps, { plan: opts.plan, build });
	}

	return updated ?? build;
}

// After the pull request, never instead of it: the branch is the deliverable and
// the map a convenience.
function summarize(deps: LineDeps, opts: { plan: Plan; build: Build }): void {
	const { plan, build } = opts;

	if (!plan.bodyMd || build.machineId === null || build.worktreePath === null || build.branch === null) {
		return;
	}

	deps.socketRegistry.sendToAgent({
		machineId: build.machineId,
		message: {
			type: 'build.summarize',
			planId: plan.id,
			worktreePath: build.worktreePath,
			branch: build.branch,
			baseRef: `origin/${build.baseBranch ?? 'HEAD'}`,
			planTitle: plan.title ?? 'Untitled plan',
			planBodyMd: plan.bodyMd
		}
	});
}

export async function refreshPullRequest(deps: LineDeps, opts: { plan: Plan; build: Build }): Promise<void> {
	if (opts.build.prNumber === null) {
		return;
	}

	await publishPullRequest(deps, opts);
}
