import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { missingRequirements } from 'src/controllers/onboarding/shared/requirements';
import {
	announceOnboarding,
	onboardingAdmission,
	ONBOARDING_PORT_BASE
} from 'src/controllers/onboarding/shared/onboarding-runs';

// Called wherever an input can land — an env set, a session secret, the policy,
// a discovery finishing, the machine reconnecting — so the operator fills the form
// once and never presses a button to go on. Quietly does nothing whenever the run
// cannot start yet; the next of those events asks again.
export async function maybeStartVerify(deps: OnboardingDeps, opts: { machineId: string }): Promise<void> {
	const run = await deps.onboardingRunRepo.latestForMachine(opts.machineId);

	if (!run || run.status !== 'needs_input') {
		return;
	}

	const machine = await deps.machineRepo.getById(opts.machineId);

	if (
		!machine ||
		machine.status !== 'online' ||
		machine.repositoryId !== run.repositoryId ||
		!deps.socketRegistry.getAgentSocket(machine.id) ||
		missingRequirements({ requirements: run.requirements, machine }).length > 0
	) {
		return;
	}

	const [admission, repository] = await Promise.all([
		onboardingAdmission(deps, { machineId: machine.id }),
		deps.repositoryRepo.getById(run.repositoryId)
	]);

	if (!admission.admitted || !repository) {
		return;
	}

	await deps.onboardingRunRepo.update({ id: run.id, status: 'verifying', portBase: ONBOARDING_PORT_BASE, failureReason: null });

	const started = await deps.onboardingRunRepo.appendStep({
		id: run.id,
		step: { label: 'Verify started', status: 'info', detail: null, at: new Date().toISOString() }
	});
	const proposed = run.phase === 'discover' && run.config !== null;
	const sent = deps.socketRegistry.sendToAgent({
		machineId: machine.id,
		message: {
			type: 'onboarding.start',
			runId: run.id,
			phase: 'verify',
			portBase: ONBOARDING_PORT_BASE,
			configDraft: proposed ? run.config : repository.configDraft,
			preferDraft: proposed,
			applyMigrations: machine.policy.applyMigrations,
			memoryMaxBytes: admission.limitBytes
		}
	});
	const settled = sent ? started : await deps.onboardingRunRepo.update({ id: run.id, status: 'needs_input' });

	if (settled) {
		announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: machine.projectId, run: settled });
	}
}
