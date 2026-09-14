import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBuild } from 'src/controllers/line/shared/announce';

const DROPPED = 'the connection to the machine dropped while this was running';
const RESTARTED = 'the agent on the machine restarted while this was running';
const OUT_OF_MEMORY = 'the machine ran out of memory and the kernel killed the agent while this was running';
const OFFLINE = 'the machine went offline while this was running';

// Three causes, told apart because they send the operator to different places: a
// socket that dropped is the network; an agent process that began after the job
// was dispatched was killed and brought back; and when systemd recorded that kill
// as `oom-kill`, the fix is memory on the box.
function strandedReason(opts: { agentStartedAt: Date | null; jobStartedAt: Date | null; previousExit: string | undefined }): string {
	if (opts.agentStartedAt === null || opts.jobStartedAt === null || opts.agentStartedAt <= opts.jobStartedAt) {
		return DROPPED;
	}

	return opts.previousExit === 'oom-kill' ? OUT_OF_MEMORY : RESTARTED;
}

// Not the ordinary failure path. A session that died with its machine left a
// worktree in a state nobody knows, so the job goes back — the agent cleans the tree
// before it starts one — and the build is held for a person to release.
async function holdBuild(deps: LineDeps, opts: { buildId: string; reason: string }): Promise<void> {
	const build = await deps.buildRepo.transition({
		id: opts.buildId,
		from: ['building', 'integrating', 'driving', 'fixing', 'rechecking'],
		changes: { status: 'held', failureReason: opts.reason }
	});
	const plan = build ? await deps.planRepo.getById(build.planId) : null;

	if (build && plan) {
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build });
	}
}

async function reclaimRun(deps: LineDeps, runId: string): Promise<void> {
	deps.runActivity.forget(runId);
	await deps.sliceRunRepo.update({
		id: runId,
		status: 'pending',
		failureReason: null,
		questionId: null,
		question: null,
		questionAskedAt: null,
		startedAt: null,
		finishedAt: null
	});
}

// A bullet, a drive or an integration keeps running through a reconnect and reports
// on whatever socket is current, so `hello` names what the agent still holds and
// everything else this machine has running died with the socket before this one.
// The other direction too: a session the agent holds that bosun no longer wants is
// cancelled before it writes over a worktree nobody is watching.
export async function stallMachineBuilds(
	deps: LineDeps,
	opts: {
		machineId: string;
		connectedAt: Date;
		heldRunIds?: string[];
		heldIntegrationIds?: string[];
		uptimeMs?: number;
		previousExit?: string;
	}
): Promise<void> {
	const heldRuns = new Set(opts.heldRunIds ?? []);
	const heldIntegrations = new Set(opts.heldIntegrationIds ?? []);
	const agentStartedAt = opts.uptimeMs === undefined ? null : new Date(Date.now() - opts.uptimeMs);
	const [running, integrations] = await Promise.all([
		deps.sliceRunRepo.listRunningForMachine(opts.machineId),
		deps.integrationRepo.listByStatusForMachine({ machineId: opts.machineId, statuses: ['running'] })
	]);

	for (const job of running.filter((entry) => !heldRuns.has(entry.runId))) {
		const run = await deps.sliceRunRepo.getById(job.runId);

		if (!run || (run.startedAt !== null && run.startedAt > opts.connectedAt)) {
			continue;
		}

		await reclaimRun(deps, run.id);
		await holdBuild(deps, { buildId: run.buildId, reason: strandedReason({ agentStartedAt, jobStartedAt: run.startedAt, previousExit: opts.previousExit }) });
	}

	for (const integration of integrations.filter((entry) => !heldIntegrations.has(entry.id))) {
		if (integration.startedAt !== null && integration.startedAt > opts.connectedAt) {
			continue;
		}

		await deps.integrationRepo.update({ id: integration.id, status: 'pending', startedAt: null });
		await holdBuild(deps, { buildId: integration.buildId, reason: strandedReason({ agentStartedAt, jobStartedAt: integration.startedAt, previousExit: opts.previousExit }) });
	}

	const liveRuns = new Set(running.map((job) => job.runId));
	const liveIntegrations = new Set(integrations.map((integration) => integration.id));

	for (const runId of [...heldRuns].filter((id) => !liveRuns.has(id))) {
		deps.socketRegistry.sendToAgent({ machineId: opts.machineId, message: { type: 'exec.cancel', runId } });
	}

	for (const integrationId of [...heldIntegrations].filter((id) => !liveIntegrations.has(id))) {
		deps.socketRegistry.sendToAgent({ machineId: opts.machineId, message: { type: 'integrate.cancel', integrationId } });
	}
}

// Called after the disconnect grace window, for the machine that never came back.
export async function pauseMachineBuilds(deps: LineDeps, opts: { machineId: string }): Promise<void> {
	if (deps.socketRegistry.getAgentSocket(opts.machineId)) {
		return;
	}

	const [running, integrations] = await Promise.all([
		deps.sliceRunRepo.listRunningForMachine(opts.machineId),
		deps.integrationRepo.listByStatusForMachine({ machineId: opts.machineId, statuses: ['running'] })
	]);

	for (const job of running) {
		await reclaimRun(deps, job.runId);
		await holdBuild(deps, { buildId: job.buildId, reason: OFFLINE });
	}

	for (const integration of integrations) {
		await deps.integrationRepo.update({ id: integration.id, status: 'pending', startedAt: null });
		await holdBuild(deps, { buildId: integration.buildId, reason: OFFLINE });
	}
}
