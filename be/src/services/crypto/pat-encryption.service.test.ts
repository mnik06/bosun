import { describe, expect, it } from 'vitest';
import { getPatEncryptionService, PatDecryptionError } from 'src/services/crypto/pat-encryption.service';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('pat encryption', () => {
	it('round-trips a PAT through encrypt and decrypt', () => {
		const service = getPatEncryptionService({ key: KEY });
		const encrypted = service.encrypt('the-real-pat');

		expect(encrypted).not.toContain('the-real-pat');
		expect(service.decrypt(encrypted)).toBe('the-real-pat');
	});

	it('never produces the same ciphertext twice for the same PAT', () => {
		const service = getPatEncryptionService({ key: KEY });

		expect(service.encrypt('same-pat')).not.toBe(service.encrypt('same-pat'));
	});

	it('refuses to decrypt under a different key rather than returning garbage', () => {
		const encrypted = getPatEncryptionService({ key: KEY }).encrypt('the-real-pat');

		expect(() => getPatEncryptionService({ key: OTHER_KEY }).decrypt(encrypted)).toThrow(PatDecryptionError);
	});

	it('refuses a tampered ciphertext', () => {
		const service = getPatEncryptionService({ key: KEY });
		const [iv, authTag, ciphertext] = service.encrypt('the-real-pat').split(':');
		const flipped = (ciphertext![0] === '0' ? '1' : '0') + ciphertext!.slice(1);

		expect(() => service.decrypt(`${iv}:${authTag}:${flipped}`)).toThrow(PatDecryptionError);
	});

	it('refuses a malformed payload', () => {
		expect(() => getPatEncryptionService({ key: KEY }).decrypt('not-the-right-shape')).toThrow(PatDecryptionError);
	});
});
