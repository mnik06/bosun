import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { bulletGateFailure, driveGateFailure, fixGateFailure } from 'src/controllers/line/shared/ac-gate';
import { announceBuild, announceNeedsYou, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { settleBuild } from 'src/controllers/line/shared/lifecycle';
import { notifyDependents } from 'src/controllers/line/shared/merge';
import { type Build, type SliceRun } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';
import { type AgentMsg } from 'src/types/protocol';

type ExecFrame = Extract<AgentMsg, { type: `exec.${string}` }>;
type DoneFrame = Extract<AgentMsg, { type: 'exec.done' }>;

interface Located {
	run: SliceRun;
	build: Build;
	plan: Plan;
}

// A run is the unit of authority here: the frame names a run, and the build it
// belongs to is derived rather than trusted, so an agent cannot settle a run on
// somebody else's machine by naming its id. A run no longer `running` is a ghost —
// put back by a hold, a question releasing its slot, a dropped machine — and what
// its session says describes an attempt that is over.
async function locate(deps: LineDeps, opts: { runId: string; machineId: string }): Promise<Located | null> {
	const run = await deps.sliceRunRepo.getById(opts.runId);

	if (!run || run.status !== 'running') {
		return null;
	}

	const build = await deps.buildRepo.getById(run.buildId);
	const plan = build ? await deps.planRepo.getById(build.planId) : null;

	return build && plan && build.machineId === opts.machineId ? { run, build, plan } : null;
}

async function failRun(deps: LineDeps, opts: { located: Located; message: string; report?: string }): Promise<void> {
	const { run, build, plan } = opts.located;

	deps.runActivity.forget(run.id);
	await deps.sliceRunRepo.update({
		id: run.id,
		status: 'failed',
		failureReason: opts.message,
		...(opts.report === undefined ? {} : { report: opts.report }),
		questionId: null,
		question: null,
		questionAskedAt: null,
		finishedAt: new Date()
	});

	const failed = await deps.buildRepo.update({ id: build.id, status: 'failed', failureReason: opts.message });

	if (failed) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: failed });
	}

	await scheduleRepository(deps, { repositoryId: build.repositoryId });
}

async function gateFor(deps: LineDeps, located: Located): Promise<string | null> {
	const { run, build, plan } = located;

	if (run.phase === null) {
		return bulletGateFailure(deps, { sliceId: run.sliceId });
	}

	if (run.phase === 'fix') {
		return fixGateFailure(deps, { buildId: build.id, acCodes: run.acCodes });
	}

	return driveGateFailure(deps, { plan, buildId: build.id, runId: run.id, acCodes: run.phase === 'recheck' ? run.acCodes : null });
}

// What the fix repaired and nobody has watched working yet. Skipped on a hands-off
// plan, whose fix goes straight to review with what it left written down.
async function recheckCodes(deps: LineDeps, located: Located): Promise<string[]> {
	if (located.plan.handsOff) {
		return [];
	}

	const [findings, acs] = await Promise.all([
		deps.verifyFindingRepo.listForBuild(located.build.id),
		deps.acRepo.listByPlan(located.plan.id)
	]);
	const unverified = new Set(acs.filter((ac) => !ac.verified).map((ac) => ac.code));

	return [...new Set(findings.flatMap((finding) => (finding.status === 'fixed' && finding.acCode !== null && unverified.has(finding.acCode) ? [finding.acCode] : [])))];
}

async function queuePhase(deps: LineDeps, opts: { located: Located; phase: 'fix' | 'recheck'; acCodes: string[] | null }): Promise<void> {
	const { run, build } = opts.located;

	await deps.sliceRunRepo.createMany([
		{ id: deps.idService.createSliceRunId(), buildId: build.id, sliceId: run.sliceId, ordinal: run.ordinal, phase: opts.phase, acCodes: opts.acCodes }
	]);
}

// A criterion that still fails at re-check stops the plan on a person: fix again,
// accept it as a known gap, or cancel. Never automatic — a fix-and-re-check loop
// nobody chose is how a verify runs all afternoon.
async function stopOnFailedRecheck(deps: LineDeps, located: Located): Promise<boolean> {
	const codes = located.run.acCodes ?? [];
	const [acs, findings] = await Promise.all([
		deps.acRepo.listByPlan(located.plan.id),
		deps.verifyFindingRepo.listForBuild(located.build.id)
	]);
	const failing = acs.filter((ac) => codes.includes(ac.code) && !ac.verified);

	if (failing.length === 0) {
		return false;
	}

	const reproduction = findings.filter((finding) => finding.runId === located.run.id).at(-1)?.reproduction;
	const stopped = await deps.buildRepo.update({
		id: located.build.id,
		status: 'needs_you',
		needsYouReason: 'recheck_failed',
		failureReason: `${failing.map((ac) => ac.code).join(', ')} still fail${failing.length === 1 ? 's' : ''} at re-check${reproduction ? `: ${reproduction}` : ''}`
	});

	if (stopped) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: located.plan.projectId, build: stopped });
	}

	return true;
}

async function afterDone(deps: LineDeps, opts: { located: Located; frame: DoneFrame }): Promise<boolean> {
	const { located, frame } = opts;
	const { run, build } = located;

	if (run.phase === null && frame.changedFiles.length > 0) {
		await deps.sliceRepo.saveChangedFiles({ id: run.sliceId, changedFiles: frame.changedFiles });
	}

	if (frame.pushed) {
		await notifyDependents(deps, { build });
	} else if (frame.pushError !== null) {
		await deps.buildRepo.update({ id: build.id, failureReason: `the branch did not reach the remote: ${frame.pushError}` });
	}

	if (run.phase === 'drive') {
		await queuePhase(deps, { located, phase: 'fix', acCodes: null });
	}

	if (run.phase === 'fix') {
		const codes = await recheckCodes(deps, located);

		if (codes.length > 0) {
			await queuePhase(deps, { located, phase: 'recheck', acCodes: codes });
		}
	}

	return run.phase === 'recheck' && stopOnFailedRecheck(deps, located);
}

async function recordDone(deps: LineDeps, opts: { located: Located; frame: DoneFrame }): Promise<void> {
	const { located, frame } = opts;
	const gate = await gateFor(deps, located);

	if (gate !== null) {
		await failRun(deps, { located, message: gate, report: frame.report });

		return;
	}

	deps.runActivity.forget(located.run.id);
	await deps.sliceRunRepo.update({
		id: located.run.id,
		status: 'done',
		questionId: null,
		question: null,
		questionAskedAt: null,
		commitSha: frame.commitSha,
		report: frame.report,
		finishedAt: new Date()
	});

	if (!(await afterDone(deps, opts))) {
		await settleBuild(deps, { buildId: located.build.id });
	}

	announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: located.plan.projectId, planId: located.plan.id });
	await scheduleRepository(deps, { repositoryId: located.build.repositoryId });
}

export async function recordExecFrame(deps: LineDeps, opts: { machineId: string; projectId: string; frame: ExecFrame }): Promise<void> {
	const located = await locate(deps, { runId: opts.frame.runId, machineId: opts.machineId });

	if (!located) {
		return;
	}

	const { frame } = opts;

	switch (frame.type) {
	case 'exec.text':
		deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'run.text', runId: frame.runId, delta: frame.delta } });

		return;
	case 'exec.activity':
		deps.runActivity.record({ runId: frame.runId, label: frame.label });
		deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'run.activity', runId: frame.runId, label: frame.label } });

		return;
	case 'exec.question':
		await deps.sliceRunRepo.update({ id: frame.runId, questionId: frame.questionId, question: frame.questions, questionAskedAt: new Date() });
		deps.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
			message: { type: 'run.question', runId: frame.runId, planId: located.plan.id, questionId: frame.questionId, questions: frame.questions }
		});
		announceNeedsYou({ socketRegistry: deps.socketRegistry, projectId: opts.projectId });

		return;
	case 'exec.done':
		await recordDone(deps, { located, frame });

		return;
	case 'exec.error':
		await failRun(deps, { located, message: frame.message });
	}
}
