import { HttpError } from 'src/api/errors/HttpError';

const BEARER_PREFIX = 'Bearer ';

export function readBearerToken(authorization?: string): string | null {
	if (!authorization?.startsWith(BEARER_PREFIX)) {
		return null;
	}

	return authorization.slice(BEARER_PREFIX.length).trim() || null;
}

// Numeric by dotted part; a pre-release suffix is ignored. Enough to ask "is this
// agent at least the release that shipped a feature".
export function compareVersions(a: string, b: string): number {
	const parts = (version: string) => version.replace(/^v/, '').split('-')[0]!.split('.').map((part) => Number(part) || 0);
	const [left, right] = [parts(a), parts(b)];

	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);

		if (difference !== 0) {
			return Math.sign(difference);
		}
	}

	return 0;
}

// 404 rather than a bare undefined: a repo's "owned by this project" lookup
// answering nothing means either the row does not exist or it belongs to someone
// else, and both are reported the same way so guessing an id cannot be used to
// find out which.
export async function orNotFound<T>(promise: Promise<T | null | undefined>, message: string): Promise<T> {
	const row = await promise;

	if (!row) {
		throw new HttpError(404, message);
	}

	return row;
}

export function findDuplicate(values: string[]): string | null {
	const seen = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			return value;
		}

		seen.add(value);
	}

	return null;
}
