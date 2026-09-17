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

		generateMachineKey: (): string => crypto.randomBytes(32).toString('hex')
	};
}

export type KeyService = ReturnType<typeof getKeyService>;
