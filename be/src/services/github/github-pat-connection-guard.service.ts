import { GithubPatError } from 'src/services/github/github-pat.service';
import { createRateLimitCooldownGuard } from 'src/utils/general';

// A Retry-After/rate-limit cooldown per connection, process-local like
// `azureConnectionGuard` — it does not need to survive a restart, only to stop
// one connection's calls for the window GitHub itself named, without touching
// any other (AC-41).
export function getGithubPatConnectionGuardService() {
	return createRateLimitCooldownGuard({
		retryAfterMs: (error) => (error instanceof GithubPatError && error.kind === 'rate_limited' ? (error.retryAfterMs ?? 60_000) : undefined)
	});
}

export type GithubPatConnectionGuardService = ReturnType<typeof getGithubPatConnectionGuardService>;
