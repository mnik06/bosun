import { HttpError } from 'src/api/errors/HttpError';
import { AzureError } from 'src/services/azure/azure-devops.service';

// Azure refusing, or being unreachable, is a fact the leader can act on — an
// invalid token, one missing a scope, an organization bosun's IP cannot reach —
// so its words reach the browser as a 400 (the caller's PAT to fix) rather than
// collapsing into "Internal server error". An organization bosun genuinely
// cannot reach is the one case that is not the caller's own input, so it is a
// 502 instead.
export function toAzureHttpError(error: unknown): Error {
	if (error instanceof HttpError) {
		return error;
	}

	if (error instanceof AzureError) {
		return new HttpError(error.kind === 'unreachable' ? 502 : 400, error.message, { cause: error });
	}

	return error instanceof Error ? error : new Error(String(error));
}
