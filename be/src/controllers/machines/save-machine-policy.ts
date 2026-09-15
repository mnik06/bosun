import { HttpError } from 'src/api/errors/HttpError';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { type Machine } from 'src/types/MachineSchema';

// Saving is the choice, whichever way it goes: a discovery that lists the
// migration policy as an input is satisfied by somebody deciding, not by the
// column's default.
export async function saveMachinePolicy(
	deps: OnboardingDeps,
	opts: { id: string; projectId: string; applyMigrations: boolean }
): Promise<Machine> {
	const machine = await deps.machineRepo.savePolicy({
		id: opts.id,
		projectId: opts.projectId,
		policy: { applyMigrations: opts.applyMigrations, confirmed: true }
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	announceMachine({ socketRegistry: deps.socketRegistry, machine });
	await maybeStartVerify(deps, { machineId: machine.id });

	return machine;
}
