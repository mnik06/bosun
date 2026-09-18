import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class PatDecryptionError extends Error {
	constructor() {
		super('Could not decrypt the stored token — AZURE_PAT_ENCRYPTION_KEY may have changed since it was saved');
		this.name = 'PatDecryptionError';
	}
}

// The only reversible secret this codebase stores — see pat-encryption.service.md
// for why a PAT cannot be hashed the way every other credential here is.
export function getPatEncryptionService(deps: { key: string }) {
	const key = Buffer.from(deps.key, 'hex');

	return {
		encrypt(plaintext: string): string {
			const iv = crypto.randomBytes(IV_BYTES);
			const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
			const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
			const authTag = cipher.getAuthTag();

			return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
		},

		decrypt(payload: string): string {
			const [ivHex, authTagHex, ciphertextHex] = payload.split(':');

			if (!ivHex || !authTagHex || !ciphertextHex) {
				throw new PatDecryptionError();
			}

			try {
				const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));

				decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

				return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
			} catch {
				throw new PatDecryptionError();
			}
		}
	};
}

export type PatEncryptionService = ReturnType<typeof getPatEncryptionService>;
