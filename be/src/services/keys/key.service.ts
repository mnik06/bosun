import crypto from 'crypto';

export function generateEnrollmentToken(): string {
	return crypto.randomBytes(24).toString('base64url');
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
