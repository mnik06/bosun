import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBuild } from 'src/controllers/line/shared/announce';
import {
	dependencyReleased,
	providerStopped,
	type ProviderState
} from 'src/controllers/line/shared/dependencies';
import { dispatchIntegration, dispatchRun, startBuild } from 'src/controllers/line/shared/dispatch';
import { completeBuilding, settleBuild } from 'src/controllers/line/shared/lifecycle';
import { loadRepositorySnapshot, type BuildState, type RepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { admit, holderBlocksLane, jobBytes, usableBytes, type JobClass, type MachineLoad } from 'src/controllers/line/shared/memory-budget';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import {
	BUILD_SLOT_STATUSES,
	hasBulletLeft,
	hasRunningJob,
	LANE_STATUSES,
	nextJob,
	WAITING_STATUSES
} from 'src/controllers/line/shared/next-job';
import { repositoryCloning } from 'src/controllers/repositories/shared/config-draft';
import { type Machine } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

// A pass admits one job at a time and reads the line again before the next, so a
// generous bound only guards against a bug turning into a spin.
const MAX_ACTIONS_PER_PASS = 32;

interface Pass {
	deps: LineDeps;
	machine: Machine;
	repository: Repository;
	snapshot: RepositorySnapshot;
	mine: BuildState[];
}

function blocking(state: BuildState, providers: Map<string, ProviderState>) {
	return state.dependencies.filter((dependency) => !dependencyReleased({ dependency, provider: providers.get(dependency.providerPlanId) }));
}

function limitFor(pass: Pass, jobClass: JobClass): number | null {
	const memory = pass.deps.machineMemory.get(pass.machine.id);

	return memory === null ? null : jobBytes({ jobClass, usable: usableBytes(memory) });
}

// A provider that stopped before giving what was waited on sends each waiting
// dependent to a person, with retry and revise — nothing else would ever start it.
async function stopDependentsOfStoppedProviders(pass: Pass): Promise<boolean> {
	const { deps, snapshot } = pass;

	for (const state of snapshot.states.filter((entry) => entry.build.status === 'scheduled')) {
		const stopped = blocking(state, snapshot.providers).find((dependency) =>
			providerStopped({ dependency, provider: snapshot.providers.get(dependency.providerPlanId) })
		);

		if (!stopped) {
			continue;
		}

		const provider = snapshot.providers.get(stopped.providerPlanId);
		const moved = await deps.buildRepo.transition({
			id: state.build.id,
			from: ['scheduled'],
			changes: {
				status: 'needs_you',
				needsYouReason: 'provider_failed',
				failureReason: `#${provider?.number ?? '?'} stopped before it gave what this plan waits for — retry once it is running again, revise this plan, or run it anyway`
			}
		});

		if (moved) {
			announceBuild({ socketRegistry: deps.socketRegistry, projectId: state.plan.projectId, build: moved });
			await notifyBuildStatus(deps, { plan: state.plan, build: moved });

			return true;
		}
	}

	return false;
}

// A build holding its slot between its own bullets — or one whose frame settled it
// while this machine was busy — carries straight on without asking for memory again.
async function continueHolders(pass: Pass): Promise<boolean> {
	const holding = pass.mine.filter(
		(state) => [...BUILD_SLOT_STATUSES, ...LANE_STATUSES].includes(state.build.status) && !hasRunningJob(state)
	);

	for (const state of holding) {
		if (state.build.status === 'building' && state.build.worktreePath === null) {
			continue;
		}

		if (await continueHolder(pass, state)) {
			return true;
		}
	}

	return false;
}

// Whether the job a holding build has next is one its status already holds for.
function holdsFor(state: BuildState, job: NonNullable<ReturnType<typeof nextJob>>): boolean {
	const { status } = state.build;

	switch (job.kind) {
	case 'bullet':
		return status === 'building';
	case 'integration':
		return !LANE_STATUSES.includes(status);
	case 'fix':
		return status === 'fixing';
	case 'lane':
		return LANE_STATUSES.includes(status);
	}
}

async function continueHolder(pass: Pass, state: BuildState): Promise<boolean> {
	const job = nextJob(state);

	// The last build bullet landed: the build keeps its slot into the integration
	// that has to come before verify.
	if (state.build.status === 'building' && state.build.builtAt === null && !hasBulletLeft(state.runs)) {
		await completeBuilding(pass.deps, state);

		return true;
	}

	if (job === null || !holdsFor(state, job)) {
		await settleBuild(pass.deps, { buildId: state.build.id });

		return true;
	}

	if (job.kind === 'integration') {
		return dispatchIntegration(pass.deps, { ...pass, state, integration: job.integration, memoryMaxBytes: limitFor(pass, 'build') });
	}

	if (job.kind === 'bullet' && (await blocksWaitingVerify(pass))) {
		return yieldSlot(pass, state);
	}

	const lane = job.kind === 'lane';

	return dispatchRun(pass.deps, {
		...pass,
		state,
		run: job.run,
		providers: pass.snapshot.providers,
		memoryMaxBytes: limitFor(pass, lane ? 'lane' : 'build'),
		status: lane && job.run.phase === 'recheck' ? 'rechecking' : state.build.status
	});
}

async function blocksWaitingVerify(pass: Pass): Promise<boolean> {
	if (!verifyLine(pass.snapshot).some((state) => state.build.machineId === pass.machine.id)) {
		return false;
	}

	return holderBlocksLane({
		memory: pass.deps.machineMemory.get(pass.machine.id),
		load: await machineLoad(pass),
		verifyLanes: pass.machine.verifyLanes,
		buildCap: pass.machine.buildCap,
		ignoreMemoryBudget: pass.machine.ignoreMemoryBudget
	});
}

// Back in the line with its worktree and branch, resumed ahead of any plan not yet
// started once the drive leaves room.
async function yieldSlot(pass: Pass, state: BuildState): Promise<boolean> {
	const moved = await pass.deps.buildRepo.transition({ id: state.build.id, from: ['building'], changes: { status: 'scheduled' } });

	if (moved) {
		announceBuild({ socketRegistry: pass.deps.socketRegistry, projectId: state.plan.projectId, build: moved });
	}

	return moved !== null;
}

async function machineLoad(pass: Pass): Promise<MachineLoad> {
	const [onboarding, quickFixes] = await Promise.all([
		pass.deps.onboardingRunRepo.listActiveForMachine(pass.machine.id),
		pass.deps.quickFixRepo.listActiveForMachine(pass.machine.id)
	]);

	return {
		build: pass.mine.filter((state) => BUILD_SLOT_STATUSES.includes(state.build.status)).length,
		lane: pass.mine.filter((state) => LANE_STATUSES.includes(state.build.status)).length,
		onboarding: onboarding.length,
		quickFix: quickFixes.length
	};
}

// Ordered by: every provider verified — a plan never verifies against a provider
// whose own verify could still change it — then the order plans finished building,
// then the line's own order.
export function verifyLine(snapshot: RepositorySnapshot): BuildState[] {
	const verified = (planId: string) => {
		const build = snapshot.providers.get(planId)?.build ?? null;

		return build === null || build.status === 'merged' || build.status === 'cancelled' || build.verifiedAt !== null;
	};

	return snapshot.states
		.filter(
			(state) =>
				state.build.status === 'waiting_verify' &&
				nextJob(state)?.kind === 'lane' &&
				state.dependencies.filter((dependency) => dependency.overriddenAt === null).every((dependency) => verified(dependency.providerPlanId))
		)
		.sort(
			(a, b) =>
				(a.build.builtAt?.getTime() ?? 0) - (b.build.builtAt?.getTime() ?? 0) || a.build.position - b.build.position
		);
}

function runnableScheduled(pass: Pass): BuildState[] {
	const { snapshot } = pass;
	const waitedOn = new Set(snapshot.states.flatMap((state) => blocking(state, snapshot.providers).map((dependency) => dependency.providerPlanId)));
	const runnable = snapshot.states.filter((state) => {
		const kind = nextJob(state)?.kind;

		return (
			state.build.status === 'scheduled' &&
			(state.build.machineId === null || state.build.machineId === pass.machine.id) &&
			(kind === 'bullet' || kind === undefined) &&
			blocking(state, snapshot.providers).length === 0
		);
	});

	// A plan already started resumes first: it gave its slot up for a verify or a
	// hold, not its place. Then a plan another plan waits on: its foundation is what
	// releases the next plan, so starting it sooner starts two plans sooner.
	return runnable.sort(
		(a, b) =>
			Number(b.build.startedAt !== null) - Number(a.build.startedAt !== null) ||
			Number(waitedOn.has(b.plan.id)) - Number(waitedOn.has(a.plan.id)) ||
			a.build.position - b.build.position
	);
}

// Freed capacity goes, in order, to integration work, to the verify lane, to plans
// already building — their fix sessions — and then to the line: a plan another plan
// waits on first, then line position.
async function admitLane(pass: Pass, opts: { lane: BuildState[]; limitBytes: number | null }): Promise<boolean> {
	const head = opts.lane.find((state) => state.build.machineId === pass.machine.id);
	const job = head ? nextJob(head) : null;

	if (!head || job?.kind !== 'lane') {
		return false;
	}

	return dispatchRun(pass.deps, {
		...pass,
		state: head,
		run: job.run,
		providers: pass.snapshot.providers,
		memoryMaxBytes: opts.limitBytes,
		status: job.run.phase === 'recheck' ? 'rechecking' : 'driving'
	});
}

// Build-sized work that is not a new plan: an integration, which is worth more than
// a new start, or a fix session of a plan already verifying.
async function admitWaitingWork(pass: Pass, opts: { kind: 'integration' | 'fix'; limitBytes: number | null }): Promise<boolean> {
	for (const state of pass.mine.filter((entry) => WAITING_STATUSES.includes(entry.build.status) && !hasRunningJob(entry))) {
		const job = nextJob(state);

		if (job?.kind === 'integration' && opts.kind === 'integration') {
			return dispatchIntegration(pass.deps, { ...pass, state, integration: job.integration, memoryMaxBytes: opts.limitBytes });
		}

		if (job?.kind === 'fix' && opts.kind === 'fix') {
			return dispatchRun(pass.deps, { ...pass, state, run: job.run, providers: pass.snapshot.providers, memoryMaxBytes: opts.limitBytes, status: 'fixing' });
		}
	}

	return false;
}

async function admitNext(pass: Pass): Promise<boolean> {
	const { machine } = pass;
	const load = await machineLoad(pass);
	const lane = verifyLine(pass.snapshot);
	const base = {
		memory: pass.deps.machineMemory.get(machine.id),
		load,
		verifyLanes: machine.verifyLanes,
		buildCap: machine.buildCap,
		ignoreMemoryBudget: machine.ignoreMemoryBudget
	};
	const buildAdmission = admit({ ...base, jobClass: 'build', verifyWaiting: lane.some((state) => state.build.machineId === machine.id) });
	const laneAdmission = admit({ ...base, jobClass: 'lane', verifyWaiting: true });
	const buildLimit = buildAdmission.admitted ? buildAdmission.limitBytes : null;

	if (buildAdmission.admitted && (await admitWaitingWork(pass, { kind: 'integration', limitBytes: buildLimit }))) {
		return true;
	}

	if (laneAdmission.admitted && (await admitLane(pass, { lane, limitBytes: laneAdmission.limitBytes }))) {
		return true;
	}

	if (!buildAdmission.admitted) {
		return false;
	}

	if (await admitWaitingWork(pass, { kind: 'fix', limitBytes: buildLimit })) {
		return true;
	}

	const next = runnableScheduled(pass)[0];

	return next ? startBuild(pass.deps, { ...pass, state: next, providers: pass.snapshot.providers }) : false;
}

async function passOnce(deps: LineDeps, machine: Machine, repository: Repository): Promise<boolean> {
	const snapshot = await loadRepositorySnapshot(deps, { repositoryId: repository.id });

	if (!snapshot) {
		return false;
	}

	const pass: Pass = {
		deps,
		machine,
		repository: snapshot.repository,
		snapshot,
		mine: snapshot.states.filter((state) => state.build.machineId === machine.id)
	};

	return (await stopDependentsOfStoppedProviders(pass)) || (await continueHolders(pass)) || admitNext(pass);
}

// The one function that starts work. Run on every event that can free or claim
// capacity — an approval, a run or an integration settling, a webhook, a hold, a
// release, an answer — so a machine never leaves build memory idle while a runnable
// plan waits.
export async function scheduleMachine(deps: LineDeps, opts: { machineId: string }): Promise<void> {
	await deps.lineLock.run(opts.machineId, async () => {
		const machine = await deps.machineRepo.getById(opts.machineId);

		// A machine still cloning has no tree to cut a worktree from; the clone
		// landing schedules it (`handleRepositoryFrame`).
		if (
			!machine ||
			machine.status !== 'online' ||
			machine.repositoryId === null ||
			repositoryCloning(machine) ||
			!deps.socketRegistry.getAgentSocket(machine.id)
		) {
			return;
		}

		const repository = await deps.repositoryRepo.getById(machine.repositoryId);

		if (!repository) {
			return;
		}

		for (let action = 0; action < MAX_ACTIONS_PER_PASS; action += 1) {
			if (!(await passOnce(deps, machine, repository))) {
				return;
			}
		}
	});
}

export async function scheduleRepository(deps: LineDeps, opts: { repositoryId: string }): Promise<void> {
	for (const machine of await deps.machineRepo.listByRepository(opts.repositoryId)) {
		await scheduleMachine(deps, { machineId: machine.id });
	}
}
