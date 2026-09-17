import { HttpError } from 'src/api/errors/HttpError';
import { type LineBuild, type MachineCapacity } from 'src/api/routes/schemas/line/LineSchemas';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { verifyLine } from 'src/controllers/line/schedule';
import { loadRepositorySnapshot, type RepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { heldBytes, usableBytes } from 'src/controllers/line/shared/memory-budget';
import { BUILD_SLOT_STATUSES, LANE_STATUSES } from 'src/controllers/line/shared/next-job';
import { describeReason } from 'src/controllers/line/shared/reason';
import { type Machine } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

async function capacityOf(deps: LineDeps, opts: { machine: Machine; snapshot: RepositorySnapshot | undefined }): Promise<MachineCapacity> {
	const { machine, snapshot } = opts;
	const mine = (snapshot?.states ?? []).filter((state) => state.build.machineId === machine.id);
	const [onboarding, quickFixes] = await Promise.all([
		deps.onboardingRunRepo.listActiveForMachine(machine.id),
		deps.quickFixRepo.listActiveForMachine(machine.id)
	]);
	const memory = deps.machineMemory.get(machine.id);
	const load = {
		build: mine.filter((state) => BUILD_SLOT_STATUSES.includes(state.build.status)).length,
		lane: mine.filter((state) => LANE_STATUSES.includes(state.build.status)).length,
		onboarding: onboarding.length,
		quickFix: quickFixes.length
	};
	const usable = memory === null ? null : usableBytes(memory);

	return {
		machineId: machine.id,
		machineName: machine.name,
		repositoryId: machine.repositoryId,
		online: machine.status === 'online' && deps.socketRegistry.getAgentSocket(machine.id) !== null,
		buildBytes: usable,
		buildBytesInUse: usable === null ? 0 : heldBytes({ load, usable }),
		buildsRunning: load.build,
		buildCap: machine.buildCap,
		verifyLanes: machine.verifyLanes,
		lane: mine
			.filter((state) => LANE_STATUSES.includes(state.build.status))
			.map((state) => ({ planId: state.plan.id, planNumber: state.plan.number, status: state.build.status })),
		verifyWaiting: snapshot ? verifyLine(snapshot).filter((state) => state.build.machineId === machine.id).length : 0
	};
}

function lineBuilds(snapshot: RepositorySnapshot): LineBuild[] {
	const verify = verifyLine(snapshot);

	return snapshot.states.map((state) => ({
		...state.build,
		planNumber: state.plan.number,
		planTitle: state.plan.title,
		reason: describeReason({ state, snapshot, verifyLine: verify })
	}));
}

// Every repository's line in the project, or one of them, with what each machine
// holds. The board is built from the plans list; this is the order within the line
// and the capacity strip above it.
export async function getLine(
	deps: LineDeps,
	opts: { projectId: string; repositoryId?: string }
): Promise<{ builds: LineBuild[]; capacity: MachineCapacity[] }> {
	let repositories: Repository[];

	if (opts.repositoryId === undefined) {
		repositories = await deps.repositoryRepo.listForProject(opts.projectId);
	} else {
		const repository = await deps.repositoryRepo.getOwnedById({ id: opts.repositoryId, projectId: opts.projectId });

		if (!repository) {
			throw new HttpError(404, 'Repository not found');
		}

		repositories = [repository];
	}

	const snapshots = (await Promise.all(repositories.map(async (repository) => loadRepositorySnapshot(deps, { repositoryId: repository.id })))).filter(
		(snapshot): snapshot is RepositorySnapshot => snapshot !== null
	);
	const byRepository = new Map(snapshots.map((snapshot) => [snapshot.repository.id, snapshot]));
	const machines = (await deps.machineRepo.listOwned(opts.projectId)).filter(
		(machine) => machine.repositoryId !== null && byRepository.has(machine.repositoryId)
	);

	return {
		builds: snapshots.flatMap(lineBuilds),
		capacity: await Promise.all(machines.map(async (machine) => capacityOf(deps, { machine, snapshot: byRepository.get(machine.repositoryId!) })))
	};
}
