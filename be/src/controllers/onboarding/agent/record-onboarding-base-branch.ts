import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';

// Only a discovery chooses what tree it reads. A verify proves the branch bosun
// already names, and a suggestion from one would move the goalposts mid-proof.
export async function recordOnboardingBaseBranch(
	deps: OnboardingDeps,
	opts: { runId: string; machineId: string; projectId: string; branch: string; reason: string }
): Promise<void> {
	const run = await getActiveRunForMachine(deps, opts);

	if (run.phase !== 'discover') {
		throw new HttpError(409, 'only a discovery can suggest a base branch');
	}

	const repository = await deps.repositoryRepo.getById(run.repositoryId);

	await deps.onboardingRunRepo.update({ id: run.id, suggestedBaseBranch: opts.branch, suggestedBaseBranchReason: opts.reason });

	const updated = await deps.onboardingRunRepo.appendStep({
		id: run.id,
		step: {
			label: `Onboarding ${opts.branch} instead of the default branch${repository ? ` ${repository.defaultBranch}` : ''}`,
			status: 'info',
			detail: opts.reason,
			progress: null,
			at: new Date().toISOString()
		}
	});

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });
}
