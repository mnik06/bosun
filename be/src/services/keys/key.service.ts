import crypto from 'crypto';

function randomToken(bytes: number): string {
	return crypto.randomBytes(bytes).toString('base64url');
}

export function getKeyService() {
	function hashMachineKey(key: string): string {
		return crypto.createHash('sha256').update(key).digest('hex');
	}

	return {
		hashMachineKey,

		generateEnrollmentToken: (): string => randomToken(24),

		generateUiTicket: (): string => randomToken(18),

		generateMachineKey: (): string => crypto.randomBytes(32).toString('hex'),

		machineKeyMatchesHash(opts: { key: string; hash: string }): boolean {
			const candidate = Buffer.from(hashMachineKey(opts.key), 'hex');
			const expected = Buffer.from(opts.hash, 'hex');

			if (candidate.length !== expected.length) {
				return false;
			}

			return crypto.timingSafeEqual(candidate, expected);
		}
	};
}

export type KeyService = ReturnType<typeof getKeyService>;
