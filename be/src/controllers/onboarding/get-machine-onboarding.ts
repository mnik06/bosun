import { HttpError } from 'src/api/errors/HttpError';
import { getMachine } from 'src/controllers/machines/get-machine';
import { missingRequirements } from 'src/controllers/onboarding/shared/requirements';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type OnboardingRequirement, type OnboardingRun } from 'src/types/OnboardingSchema';

export async function getMachineOnboarding(opts: {
	machineRepo: MachineRepo;
	onboardingRunRepo: OnboardingRunRepo;
	machineId: string;
	projectId: string;
}): Promise<{ run: OnboardingRun; missing: OnboardingRequirement[] }> {
	const machine = await getMachine({ machineRepo: opts.machineRepo, id: opts.machineId, projectId: opts.projectId });
	const run = await opts.onboardingRunRepo.latestForMachine(machine.id);

	if (!run) {
		throw new HttpError(404, 'This machine has not been onboarded');
	}

	return { run, missing: missingRequirements({ requirements: run.requirements, machine }) };
}
