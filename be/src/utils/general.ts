const BEARER_PREFIX = 'Bearer ';

export function readBearerToken(authorization?: string): string | null {
	if (!authorization?.startsWith(BEARER_PREFIX)) {
		return null;
	}

	return authorization.slice(BEARER_PREFIX.length).trim() || null;
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
