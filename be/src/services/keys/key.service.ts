import crypto from 'crypto';
import { hexDigestsEqual } from 'src/utils/general';

function randomToken(bytes: number): string {
	return crypto.randomBytes(bytes).toString('base64url');
}

function sha256Hex(input: string): string {
	return crypto.createHash('sha256').update(input).digest('hex');
}

export function getKeyService() {
	return {
		hashMachineKey: sha256Hex,

		generateEnrollmentToken: (): string => randomToken(24),

		generateUiTicket: (): string => randomToken(18),

		// Shown once and typed by hand by whoever it is passed to, so base64url
		// rather than hex: the same entropy in fewer characters to transcribe.
		generateMemberPassword: (): string => randomToken(18),

		generateMachineKey: (): string => crypto.randomBytes(32).toString('hex'),

		// One secret shared by both of a repository's Azure webhook subscriptions
		// (AC-56) — only its hash is stored, the same "never the plaintext" rule
		// `hashMachineKey` follows.
		generateWebhookSecret: (): string => randomToken(32),

		hashWebhookSecret: sha256Hex,

		webhookSecretMatchesHash(opts: { secret: string; hash: string }): boolean {
			return hexDigestsEqual(sha256Hex(opts.secret), opts.hash);
		}
	};
}

export type KeyService = ReturnType<typeof getKeyService>;
