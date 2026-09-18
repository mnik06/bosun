import { HttpError } from 'src/api/errors/HttpError';
import { getMachine } from 'src/controllers/machines/get-machine';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import {
	announceOnboarding,
	onboardingAdmission,
	ONBOARDING_PORT_BASE
} from 'src/controllers/onboarding/shared/onboarding-runs';
import { notifyOnboardingStatus } from 'src/controllers/onboarding/shared/notify';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { repositoryCloning } from 'src/controllers/repositories/shared/config-draft';
import { type Machine } from 'src/types/MachineSchema';
import { type OnboardingPhase, type OnboardingRun } from 'src/types/OnboardingSchema';
import { type Repository } from 'src/types/RepositorySchema';

function refusal(opts: { machine: Machine; connected: boolean }): string | null {
	if (opts.machine.status !== 'online' || !opts.connected) {
		return 'this machine is offline';
	}

	if (opts.machine.repositoryId === null) {
		return 'attach a repository to this machine first';
	}

	if (repositoryCloning(opts.machine)) {
		return 'this machine is still cloning its repository — start onboarding once the clone lands';
	}

	return opts.machine.capabilities?.find((check) => check.name === 'claude')?.ok
		? null
		: 'the claude check is not green on this machine — run `bosun-agent setup` there';
}

async function startDiscovery(
	deps: OnboardingDeps,
	opts: { machine: Machine; repository: Repository }
): Promise<OnboardingRun> {
	const admission = await onboardingAdmission(deps, { machineId: opts.machine.id });

	if (!admission.admitted) {
		throw new HttpError(409, 'this machine does not have the memory free for onboarding beside what it is running — try again when a queue finishes');
	}

	const run = await deps.onboardingRunRepo.create({
		id: deps.idService.createOnboardingRunId(),
		repositoryId: opts.repository.id,
		machineId: opts.machine.id,
		phase: 'discover',
		status: 'discovering',
		portBase: ONBOARDING_PORT_BASE
	});
	const sent = deps.socketRegistry.sendToAgent({
		machineId: opts.machine.id,
		message: {
			type: 'onboarding.start',
			runId: run.id,
			phase: 'discover',
			portBase: ONBOARDING_PORT_BASE,
			configDraft: opts.repository.configDraft,
			preferDraft: false,
			applyMigrations: opts.machine.policy.applyMigrations,
			memoryMaxBytes: admission.limitBytes
		}
	});

	return sent
		? run
		: ((await deps.onboardingRunRepo.update({
			id: run.id,
			status: 'failed',
			failureReason: 'the machine went offline before discovery started',
			finishedAt: new Date()
		})) ?? run);
}

// A second machine takes its requirements from the repository's latest discovery
// and needs only its own inputs and a verify: the config work is already done.
async function startVerify(
	deps: OnboardingDeps,
	opts: { machine: Machine; repository: Repository }
): Promise<OnboardingRun> {
	const discovery = await deps.onboardingRunRepo.latestDiscoveryForRepository(opts.repository.id);

	if (!discovery && opts.repository.configDraft === null && !opts.repository.configOnDefault) {
		throw new HttpError(409, 'there is no config to verify yet — start onboarding to discover one');
	}

	const run = await deps.onboardingRunRepo.create({
		id: deps.idService.createOnboardingRunId(),
		repositoryId: opts.repository.id,
		machineId: opts.machine.id,
		phase: 'verify',
		status: 'needs_input',
		portBase: null,
		requirements: discovery?.requirements ?? [],
		assumptions: discovery?.assumptions ?? [],
		config: opts.repository.configDraft
	});

	await maybeStartVerify(deps, { machineId: opts.machine.id });

	return (await deps.onboardingRunRepo.getById(run.id)) ?? run;
}

export async function startOnboarding(
	deps: OnboardingDeps,
	opts: { machineId: string; projectId: string; phase: OnboardingPhase }
): Promise<OnboardingRun> {
	const machine = await getMachine({ machineRepo: deps.machineRepo, id: opts.machineId, projectId: opts.projectId });
	const refused = refusal({ machine, connected: deps.socketRegistry.getAgentSocket(machine.id) !== null });

	if (refused) {
		throw new HttpError(409, refused);
	}

	const [repository, active] = await Promise.all([
		deps.repositoryRepo.getById(machine.repositoryId!),
		deps.onboardingRunRepo.listActiveForMachine(machine.id)
	]);

	if (!repository) {
		throw new HttpError(409, 'the repository this machine was attached to is gone');
	}

	if (active.length > 0) {
		throw new HttpError(409, 'an onboarding run is already in progress on this machine');
	}

	const run =
		opts.phase === 'discover'
			? await startDiscovery(deps, { machine, repository })
			: await startVerify(deps, { machine, repository });

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: machine.projectId, run });
	await notifyOnboardingStatus(deps, { projectId: machine.projectId, run });

	return run;
}
