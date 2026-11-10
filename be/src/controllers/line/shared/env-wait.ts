import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { announceBuild, announcePlanChanged } from 'src/controllers/line/shared/announce';
import { putRunBack } from 'src/controllers/line/shared/lifecycle';
import { nextJob, waitingStatus } from 'src/controllers/line/shared/next-job';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { type Build, type SliceRun } from 'src/types/BuildSchema';
import { type EnvSetSummary, type MissingEnv } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';
import { type Plan } from 'src/types/PlanSchema';

// A run that stopped for env values nobody gave did nothing wrong, and neither did
// the plan: the run goes back to pending and the build waits on the operator. It
// resumes by itself the moment the machine reports holding every key it named.
export async function parkForEnv(
	deps: LineDeps,
	opts: { run: SliceRun; build: Build; plan: Plan; missingEnv: MissingEnv[]; message: string }
): Promise<void> {
	await putRunBack(deps, { runId: opts.run.id });

	const parked = await deps.buildRepo.update({
		id: opts.build.id,
		status: 'needs_you',
		needsYouReason: 'env',
		failureReason: opts.message,
		missingEnv: opts.missingEnv
	});

	if (parked) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, build: parked });
		await notifyBuildStatus(deps, { plan: opts.plan, build: parked });
	}

	await scheduleRepository(deps, { repositoryId: opts.build.repositoryId });
}

// Decided from key names alone, like an onboarding requirement: the values never
// reach the backend.
export function envSatisfied(opts: { missingEnv: MissingEnv[]; envSets: EnvSetSummary[] }): boolean {
	const held = new Map(opts.envSets.map((set) => [set.path, new Set(set.keys)]));

	return opts.missingEnv.every((entry) => entry.keys.every((key) => held.get(entry.path)?.has(key) === true));
}

// Called wherever a machine's key names can change — an env set saved in the
// browser, a `hello` after the agent filled or an operator edited the store.
export async function resumeEnvBuilds(deps: LineDeps, opts: { machine: Machine }): Promise<void> {
	const waiting = (await deps.buildRepo.listForMachine({ machineId: opts.machine.id, statuses: ['needs_you'] })).filter(
		(build) => build.needsYouReason === 'env' && envSatisfied({ missingEnv: build.missingEnv ?? [], envSets: opts.machine.envSets ?? [] })
	);

	for (const build of waiting) {
		const [plan, runs, integrations] = await Promise.all([
			deps.planRepo.getById(build.planId),
			deps.sliceRunRepo.listForBuild(build.id),
			deps.integrationRepo.listForBuild(build.id)
		]);
		const resumed = await deps.buildRepo.transition({
			id: build.id,
			from: ['needs_you'],
			changes: {
				status: waitingStatus({ build, job: nextJob({ runs, integrations }) }),
				needsYouReason: null,
				failureReason: null,
				missingEnv: null
			}
		});

		if (resumed && plan) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: resumed });
			announcePlanChanged({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, planId: plan.id });
		}
	}

	if (waiting.length > 0) {
		await scheduleRepository(deps, { repositoryId: waiting[0]!.repositoryId });
	}
}
