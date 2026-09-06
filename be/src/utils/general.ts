const BEARER_PREFIX = 'Bearer ';

export function readBearerToken(authorization?: string): string | null {
	if (!authorization?.startsWith(BEARER_PREFIX)) {
		return null;
	}

	return authorization.slice(BEARER_PREFIX.length).trim() || null;
}

export function parseCommaList(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}
