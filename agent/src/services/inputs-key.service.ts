import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { type SealedValue } from '../onboarding-frames';

export const INPUTS_KEY_FILENAME = 'inputs.key';

const MODULUS_BITS = 3072;
const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const OPEN_FAILED = 'could not decrypt a value — it was not sealed to this machine\'s key';

// The same shape `ssh-keygen -l` prints, so it reads as a fingerprint to anyone
// comparing the terminal against the browser. Computed over the DER bytes the
// browser imports, so both sides hash exactly the same thing.
export function fingerprintOf(publicKeySpkiBase64: string): string {
	const digest = crypto
		.createHash('sha256')
		.update(Buffer.from(publicKeySpkiBase64, 'base64'))
		.digest('base64');

	return `SHA256:${digest.replace(/=+$/, '')}`;
}

export function getInputsKeyService(deps: { homeDir?: string }) {
	const keyPath = path.join(deps.homeDir ?? os.homedir(), '.bosun', INPUTS_KEY_FILENAME);

	// A key that exists but cannot be parsed is refused rather than replaced. A new
	// key is a new fingerprint, and a fingerprint that changes without anybody
	// asking is exactly what the comparison with the browser exists to catch.
	function load(): crypto.KeyObject | null {
		let pem: string;

		try {
			pem = fs.readFileSync(keyPath, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return null;
			}

			throw new Error(`could not read ${keyPath}`);
		}

		try {
			return crypto.createPrivateKey(pem);
		} catch {
			throw new Error(`${keyPath} is not a private key — move it aside to have a new one generated`);
		}
	}

	// `wx` so two processes generating at once cannot each write a key and leave
	// the browser encrypting to the one that lost.
	function generate(): crypto.KeyObject {
		const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: MODULUS_BITS });
		const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

		fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });

		try {
			fs.writeFileSync(keyPath, pem, { mode: 0o600, flag: 'wx' });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				return load() ?? privateKey;
			}

			throw error;
		}

		return privateKey;
	}

	return {
		keyPath,

		ensure(): { publicKey: string; fingerprint: string } {
			const privateKey = load() ?? generate();
			const publicKey = crypto
				.createPublicKey(privateKey)
				.export({ type: 'spki', format: 'der' })
				.toString('base64');

			return { publicKey, fingerprint: fingerprintOf(publicKey) };
		},

		// Every failure throws the same message. The caller forwards it to the browser,
		// and neither the ciphertext nor anything learned from a partial decryption
		// belongs in it.
		open(sealed: SealedValue): string {
			const privateKey = load();

			if (privateKey === null) {
				throw new Error('this machine has no inputs key yet — run `bosun-agent setup`');
			}

			try {
				if (sealed.v !== 1) {
					throw new Error('unsupported envelope');
				}

				const aesKey = crypto.privateDecrypt(
					{ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
					Buffer.from(sealed.wrappedKey, 'base64')
				);
				const iv = Buffer.from(sealed.iv, 'base64');
				const data = Buffer.from(sealed.ciphertext, 'base64');

				if (aesKey.length !== AES_KEY_BYTES || iv.length !== IV_BYTES || data.length < TAG_BYTES) {
					throw new Error('malformed envelope');
				}

				// WebCrypto appends the tag to the ciphertext rather than returning it apart.
				const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);

				decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));

				return Buffer.concat([
					decipher.update(data.subarray(0, data.length - TAG_BYTES)),
					decipher.final()
				]).toString('utf8');
			} catch {
				throw new Error(OPEN_FAILED);
			}
		}
	};
}

export type InputsKeyService = ReturnType<typeof getInputsKeyService>;
