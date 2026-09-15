import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine, scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { settleBuild } from 'src/controllers/line/shared/lifecycle';
import { notifyDependents } from 'src/controllers/line/shared/merge';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { refreshPullRequest } from 'src/controllers/line/shared/pull-request';
import { type Build } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { type AgentMsg } from 'src/types/protocol';

type WorktreeFrame = Extract<AgentMsg, { type: `build.worktree.${string}` }>;
type IntegrateFrame = Extract<AgentMsg, { type: `integrate.${string}` }>;
type IntegrateDone = Extract<AgentMsg, { type: 'integrate.done' }>;

async function ownBuild(deps: LineDeps, opts: { buildId: string; machineId: string }): Promise<{ build: Build; plan: Plan } | null> {
	const build = await deps.buildRepo.getById(opts.buildId);
	const plan = build ? await deps.planRepo.getById(build.planId) : null;

	return build && plan && build.machineId === opts.machineId ? { build, plan } : null;
}

// Only a build still waiting on its worktree takes the answer: a ready re-sent on a
// reconnect for a build that has since been held or cancelled changes nothing.
export async function recordWorktreeFrame(deps: LineDeps, opts: { machineId: string; frame: WorktreeFrame }): Promise<void> {
	const owned = await ownBuild(deps, { buildId: opts.frame.buildId, machineId: opts.machineId });

	if (!owned || owned.build.status !== 'building') {
		return;
	}

	const { frame } = opts;
	// A branch that could not be cut is cut again from scratch on retry, so the
	// build forgets it ever started.
	const updated =
		frame.type === 'build.worktree.ready'
			? await deps.buildRepo.update({ id: owned.build.id, worktreePath: frame.worktreePath })
			: await deps.buildRepo.update({
				id: owned.build.id,
				status: 'needs_you',
				needsYouReason: 'worktree',
				failureReason: frame.message,
				startedAt: owned.build.worktreePath === null ? null : owned.build.startedAt
			});

	if (updated) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: owned.plan.projectId, build: updated });

		if (frame.type !== 'build.worktree.ready') {
			await notifyBuildStatus(deps, { plan: owned.plan, build: updated });
		}
	}

	await scheduleMachine(deps, { machineId: opts.machineId });
}

async function integrationOf(deps: LineDeps, opts: { integrationId: string; machineId: string }) {
	const integration = await deps.integrationRepo.getById(opts.integrationId);
	const owned = integration && integration.status === 'running' ? await ownBuild(deps, { buildId: integration.buildId, machineId: opts.machineId }) : null;

	return integration && owned ? { integration, ...owned } : null;
}

// A conflict bosun resolved after verify changes code nobody has driven, so the
// build goes back to the verify line for a drive; one that only regenerated files
// was proven by the checks it ran, and stays in review.
async function recordIntegrated(deps: LineDeps, opts: { frame: IntegrateDone; located: NonNullable<Awaited<ReturnType<typeof integrationOf>>> }): Promise<void> {
	const { frame, located } = opts;
	const { integration, plan } = located;

	await deps.integrationRepo.update({
		id: integration.id,
		status: 'done',
		ontoSha: frame.ontoSha,
		merged: frame.merged,
		regenerated: frame.regenerated,
		resolved: frame.resolved,
		checks: frame.checks,
		finishedAt: new Date()
	});

	let build = located.build;

	if (integration.trigger !== 'built' && frame.resolved.length > 0 && plan.verifyInUi && build.verifiedAt !== null) {
		const verify = (await deps.sliceRepo.listByPlan(plan.id)).find((slice) => slice.kind === 'verify');

		if (verify) {
			await deps.sliceRunRepo.createMany([
				{ id: deps.idService.createSliceRunId(), buildId: build.id, sliceId: verify.id, ordinal: verify.ordinal, phase: 'drive' }
			]);
			build = (await deps.buildRepo.update({ id: build.id, verifiedAt: null })) ?? build;
		}
	}

	if (frame.merged || frame.regenerated.some((entry) => entry.files.length > 0) || frame.resolved.length > 0) {
		await notifyDependents(deps, { build });
	}

	const settled = await settleBuild(deps, { buildId: build.id });

	// A build that just finished verifying had its pull request opened by the settle;
	// one that was already in review has its body brought up to date with this
	// integration.
	if (settled?.status === 'in_review' && settled.verifiedAt !== null && build.verifiedAt !== null) {
		await refreshPullRequest(deps, { plan, build: settled });
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
}

export async function recordIntegrateFrame(deps: LineDeps, opts: { machineId: string; projectId: string; frame: IntegrateFrame }): Promise<void> {
	const located = await integrationOf(deps, { integrationId: opts.frame.integrationId, machineId: opts.machineId });

	if (!located) {
		return;
	}

	const { frame } = opts;

	if (frame.type === 'integrate.activity') {
		deps.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
			message: { type: 'integration.activity', integrationId: frame.integrationId, planId: located.plan.id, label: frame.label }
		});

		return;
	}

	if (frame.type === 'integrate.done') {
		await recordIntegrated(deps, { frame, located });
	} else {
		await deps.integrationRepo.update({ id: located.integration.id, status: 'needs_you', detail: frame.detail, finishedAt: new Date() });

		const stopped = await deps.buildRepo.update({
			id: located.build.id,
			status: 'needs_you',
			needsYouReason: frame.reason === 'checks' ? 'checks' : 'integration',
			failureReason: frame.detail
		});

		if (stopped) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: located.plan.projectId, build: stopped });
			await notifyBuildStatus(deps, { plan: located.plan, build: stopped });
		}
	}

	await scheduleRepository(deps, { repositoryId: located.build.repositoryId });
}
