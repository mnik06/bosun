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

		// Shown once and typed by hand by whoever it is passed to, so base64url
		// rather than hex: the same entropy in fewer characters to transcribe.
		generateMemberPassword: (): string => randomToken(18),

		generateMachineKey: (): string => crypto.randomBytes(32).toString('hex'),

		machineKeyMatchesHash(opts: { key: string; hash: string }): boolean {
			const candidate = Buffer.from(hashMachineKey(opts.key), 'hex');
			const expected = Buffer.from(opts.hash, 'hex');

			if (candidate.length !== expected.length) {
				return false;
			}

			return crypto.timingSafeEqual(candidate, expected);
		},

		// One secret shared by both of a repository's Azure webhook subscriptions
		// (AC-56) — only its hash is stored, the same "never the plaintext" rule
		// `hashMachineKey` follows.
		generateWebhookSecret: (): string => randomToken(32),

		hashWebhookSecret(secret: string): string {
			return crypto.createHash('sha256').update(secret).digest('hex');
		},

		webhookSecretMatchesHash(opts: { secret: string; hash: string }): boolean {
			const candidate = Buffer.from(crypto.createHash('sha256').update(opts.secret).digest('hex'), 'hex');
			const expected = Buffer.from(opts.hash, 'hex');

			if (candidate.length !== expected.length) {
				return false;
			}

			return crypto.timingSafeEqual(candidate, expected);
		}
	};
}

export type KeyService = ReturnType<typeof getKeyService>;
