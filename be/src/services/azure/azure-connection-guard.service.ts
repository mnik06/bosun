import { AzureError } from 'src/services/azure/azure-devops.service';

// A Retry-After cooldown per connection, process-local like `socketRegistry` —
// it does not need to survive a restart, only to stop one connection's calls
// for the window Azure itself named, without touching any other (AC-75).
export function getAzureConnectionGuardService() {
	const rateLimitedUntil = new Map<string, number>();

	return {
		isRateLimited(connectionId: string): boolean {
			const until = rateLimitedUntil.get(connectionId);

			return until !== undefined && until > Date.now();
		},

		// Runs `run`, and if it fails with a rate-limited `AzureError`, remembers the
		// cooldown before letting the error through — the caller still sees the
		// failure, only the next call to this connection is what gets short-circuited.
		async run<T>(connectionId: string, run: () => Promise<T>): Promise<T> {
			try {
				return await run();
			} catch (error) {
				if (error instanceof AzureError && error.kind === 'rate_limited') {
					rateLimitedUntil.set(connectionId, Date.now() + (error.retryAfterMs ?? 60_000));
				}

				throw error;
			}
		}
	};
}

export type AzureConnectionGuardService = ReturnType<typeof getAzureConnectionGuardService>;
