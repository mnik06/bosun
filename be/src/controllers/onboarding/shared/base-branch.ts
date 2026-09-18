import { type Machine } from 'src/types/MachineSchema';
import { type OnboardingRun } from 'src/types/OnboardingSchema';
import { type Repository } from 'src/types/RepositorySchema';
import { compareVersions } from 'src/utils/general';

// The release whose `onboarding.start` checks out the branch it is given rather
// than the clone's `origin/HEAD`, and whose attach points `origin/HEAD` at the
// branch bosun names. An older agent onboards the provider's default branch
// whatever the override says.
export const MIN_BASE_BRANCH_AGENT_VERSION = '4.0.7';

// The branch a discovery onboarded instead of the default one, while bosun still
// treats another branch as the default. Its config was written for that branch,
// so a verify on the default one proves nothing and fails on files that are not
// there — verify waits until a leader makes the suggestion the default.
export function pendingBaseBranch(opts: {
	discovery: Pick<OnboardingRun, 'suggestedBaseBranch'> | null;
	repository: Pick<Repository, 'defaultBranch'>;
}): string | null {
	const suggested = opts.discovery?.suggestedBaseBranch ?? null;

	return suggested !== null && suggested !== opts.repository.defaultBranch ? suggested : null;
}

export function baseBranchRefusal(opts: {
	machine: Pick<Machine, 'agentVersion'>;
	repository: Pick<Repository, 'defaultBranch' | 'defaultBranchOverride' | 'providerDefaultBranch'>;
}): string | null {
	const { agentVersion } = opts.machine;

	if (opts.repository.defaultBranchOverride === null || (agentVersion !== null && compareVersions(agentVersion, MIN_BASE_BRANCH_AGENT_VERSION) >= 0)) {
		return null;
	}

	return `this machine's agent (${agentVersion ?? 'unknown'}) is older than ${MIN_BASE_BRANCH_AGENT_VERSION} and would onboard ${opts.repository.providerDefaultBranch} instead of ${opts.repository.defaultBranch} — upgrade it with Refresh first`;
}
