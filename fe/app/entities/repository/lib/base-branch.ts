import type { OnboardingRun, Repository } from '~/entities/repository/model/repository'

// Mirrors the backend's gate: a discovery that onboarded another branch than the
// default one holds verify until that branch is the repository's default in bosun.
export function pendingBaseBranch (opts: {
	run: Pick<OnboardingRun, 'phase' | 'suggestedBaseBranch'> | null | undefined
	repository: Pick<Repository, 'defaultBranch'> | null
}): string | null {
	const suggested = opts.run?.phase === 'discover' ? (opts.run.suggestedBaseBranch ?? null) : null

	return suggested !== null && opts.repository !== null && suggested !== opts.repository.defaultBranch ? suggested : null
}
