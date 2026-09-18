import { GithubPatError } from 'src/services/github/github-pat.service';

// A Retry-After/rate-limit cooldown per connection, process-local like
// `azureConnectionGuard` — it does not need to survive a restart, only to stop
// one connection's calls for the window GitHub itself named, without touching
// any other (AC-41).
export function getGithubPatConnectionGuardService() {
	const rateLimitedUntil = new Map<string, number>();

	return {
		isRateLimited(connectionId: string): boolean {
			const until = rateLimitedUntil.get(connectionId);

			return until !== undefined && until > Date.now();
		},

		// Runs `run`, and if it fails with a rate-limited `GithubPatError`, remembers
		// the cooldown before letting the error through — the caller still sees the
		// failure, only the next call to this connection is what gets short-circuited.
		async run<T>(connectionId: string, run: () => Promise<T>): Promise<T> {
			try {
				return await run();
			} catch (error) {
				if (error instanceof GithubPatError && error.kind === 'rate_limited') {
					rateLimitedUntil.set(connectionId, Date.now() + (error.retryAfterMs ?? 60_000));
				}

				throw error;
			}
		}
	};
}

export type GithubPatConnectionGuardService = ReturnType<typeof getGithubPatConnectionGuardService>;
