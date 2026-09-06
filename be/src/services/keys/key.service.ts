import crypto from 'crypto';

function randomToken(bytes: number): string {
	return crypto.randomBytes(bytes).toString('base64url');
}

export function generateEnrollmentToken(): string {
	return randomToken(24);
}

export function generateUiTicket(): string {
	return randomToken(18);
}

export function generateMachineKey(): string {
	return crypto.randomBytes(32).toString('hex');
}

export function hashMachineKey(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex');
}

export function machineKeyMatchesHash(opts: { key: string; hash: string }): boolean {
	const candidate = Buffer.from(hashMachineKey(opts.key), 'hex');
	const expected = Buffer.from(opts.hash, 'hex');

	if (candidate.length !== expected.length) {
		return false;
	}

	return crypto.timingSafeEqual(candidate, expected);
}
