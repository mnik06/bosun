import { AzureError } from 'src/services/azure/azure-devops.service';
import { createRateLimitCooldownGuard } from 'src/utils/general';

// A Retry-After cooldown per connection, process-local like `socketRegistry` —
// it does not need to survive a restart, only to stop one connection's calls
// for the window Azure itself named, without touching any other (AC-75).
export function getAzureConnectionGuardService() {
	return createRateLimitCooldownGuard({
		retryAfterMs: (error) => (error instanceof AzureError && error.kind === 'rate_limited' ? (error.retryAfterMs ?? 60_000) : undefined)
	});
}

export type AzureConnectionGuardService = ReturnType<typeof getAzureConnectionGuardService>;
