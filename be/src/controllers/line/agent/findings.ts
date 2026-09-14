import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { announcePlanChanged } from 'src/controllers/line/shared/announce';
import { type Build, type VerifyFinding } from 'src/types/BuildSchema';

async function machineBuild(deps: LineDeps, opts: { buildId: string; machineId: string }): Promise<Build> {
	const build = await deps.buildRepo.getById(opts.buildId);

	if (!build || build.machineId !== opts.machineId) {
		throw new HttpError(404, 'Build not found');
	}

	return build;
}

async function announce(deps: LineDeps, build: Build): Promise<void> {
	const plan = await deps.planRepo.getById(build.planId);

	if (plan) {
		announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
	}
}

// Reported only by a drive or re-check in flight on this build: a finding is a
// reproduction somebody watched, and nothing else sees the running product.
export async function reportFinding(
	deps: LineDeps,
	opts: {
		buildId: string;
		machineId: string;
		runId: string;
		acCode: string | null;
		kind: VerifyFinding['kind'];
		reproduction: string;
		severity: VerifyFinding['severity'];
	}
): Promise<VerifyFinding> {
	const build = await machineBuild(deps, opts);
	const run = await deps.sliceRunRepo.getById(opts.runId);

	if (!run || run.buildId !== build.id || run.status !== 'running' || (run.phase !== 'drive' && run.phase !== 'recheck')) {
		throw new HttpError(409, 'Findings are reported by a drive or re-check that is running');
	}

	if (opts.acCode !== null && (await deps.acRepo.listByCodes({ planId: build.planId, codes: [opts.acCode] })).length === 0) {
		throw new HttpError(400, `no such acceptance criterion: ${opts.acCode}`);
	}

	const finding = await deps.verifyFindingRepo.create({
		id: deps.idService.createFindingId(),
		buildId: build.id,
		runId: run.id,
		acCode: opts.acCode,
		kind: opts.kind,
		reproduction: opts.reproduction,
		severity: opts.severity
	});

	await announce(deps, build);

	return finding;
}

// Resolved only by a fix session in flight on the finding's build.
export async function resolveFinding(
	deps: LineDeps,
	opts: { id: string; machineId: string; status: 'fixed' | 'left'; note: string }
): Promise<VerifyFinding> {
	const finding = await deps.verifyFindingRepo.getById(opts.id);

	if (!finding) {
		throw new HttpError(404, 'Finding not found');
	}

	const build = await machineBuild(deps, { buildId: finding.buildId, machineId: opts.machineId });
	const fixing = (await deps.sliceRunRepo.listForBuild(build.id)).some((run) => run.phase === 'fix' && run.status === 'running');

	if (!fixing) {
		throw new HttpError(409, 'Findings are resolved by a fix session that is running');
	}

	const resolved = await deps.verifyFindingRepo.update({ id: finding.id, status: opts.status, note: opts.note });

	await announce(deps, build);

	return resolved ?? finding;
}

// The criteria of other plans, for a conflict session deciding whose intent a
// resolution keeps. Scoped to the machine's own project.
export async function listPlanCriteria(
	deps: LineDeps,
	opts: { machineId: string; numbers: number[] }
): Promise<{ planNumber: number; title: string; acs: { code: string; text: string }[] }[]> {
	const machine = await deps.machineRepo.getById(opts.machineId);

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	const plans = await deps.planRepo.getByNumbers({ projectId: machine.projectId, numbers: [...new Set(opts.numbers)].slice(0, 20) });
	const acs = await deps.acRepo.listByPlans(plans.map((plan) => plan.id));

	return plans.map((plan) => ({
		planNumber: plan.number,
		title: plan.title ?? 'Untitled plan',
		acs: acs.filter((ac) => ac.planId === plan.id).map((ac) => ({ code: ac.code, text: ac.text }))
	}));
}
