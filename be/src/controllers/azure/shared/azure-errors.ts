import { HttpError } from 'src/api/errors/HttpError';
import { AzureError } from 'src/services/azure/azure-devops.service';

const STATUS_BY_KIND: Partial<Record<AzureError['kind'], number>> = {
	unreachable: 502,
	rate_limited: 429
};

// Azure refusing, or being unreachable, is a fact the leader can act on — an
// invalid token, one missing a scope, an organization bosun's IP cannot reach —
// so its words reach the browser as a 400 (the caller's PAT to fix) rather than
// collapsing into "Internal server error". An organization bosun genuinely
// cannot reach, or that is rate-limiting bosun's calls, is not the caller's own
// input, so each gets its own status (502, 429) instead.
export function toAzureHttpError(error: unknown): Error {
	if (error instanceof HttpError) {
		return error;
	}

	if (error instanceof AzureError) {
		return new HttpError(STATUS_BY_KIND[error.kind] ?? 400, error.message, { cause: error });
	}

	return error instanceof Error ? error : new Error(String(error));
}
