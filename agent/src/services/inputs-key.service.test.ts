import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { fingerprintOf, getInputsKeyService } from './inputs-key.service';
import { type SealedValue } from '../protocol';

const subtle = crypto.webcrypto.subtle;
const homes: string[] = [];

function tempHome(): string {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-key-'));

	homes.push(home);

	return home;
}

afterEach(() => {
	for (const home of homes.splice(0)) {
		fs.rmSync(home, { recursive: true, force: true });
	}
});

// Exactly what the browser does, through WebCrypto rather than node's own API, so
// a mismatch in padding, hash or tag placement fails here instead of on a machine.
async function sealLikeTheBrowser(publicKey: string, value: string): Promise<SealedValue> {
	const rsa = await subtle.importKey(
		'spki',
		Buffer.from(publicKey, 'base64'),
		{ name: 'RSA-OAEP', hash: 'SHA-256' },
		false,
		['encrypt']
	);
	const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
	const iv = crypto.webcrypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(value));
	const wrappedKey = await subtle.encrypt({ name: 'RSA-OAEP' }, rsa, await subtle.exportKey('raw', aes));

	return {
		v: 1,
		wrappedKey: Buffer.from(wrappedKey).toString('base64'),
		iv: Buffer.from(iv).toString('base64'),
		ciphertext: Buffer.from(ciphertext).toString('base64')
	};
}

describe('getInputsKeyService', () => {
	it('opens a value the browser sealed to its public key', async () => {
		const service = getInputsKeyService({ homeDir: tempHome() });
		const { publicKey } = service.ensure();
		const value = 'postgres://bosun:pä$$word@db:5432/app?sslmode=require';

		expect(service.open(await sealLikeTheBrowser(publicKey, value))).toBe(value);
	});

	// A regenerated key is a changed fingerprint nobody asked for, and every value
	// sealed to the old one becomes unreadable.
	it('keeps one key across calls and across processes, private to its owner', () => {
		const home = tempHome();
		const first = getInputsKeyService({ homeDir: home }).ensure();
		const second = getInputsKeyService({ homeDir: home }).ensure();

		expect(second).toEqual(first);
		expect(fs.statSync(path.join(home, '.bosun', 'inputs.key')).mode & 0o777).toBe(0o600);
	});

	it('refuses a tampered value without saying anything about its content', async () => {
		const service = getInputsKeyService({ homeDir: tempHome() });
		const sealed = await sealLikeTheBrowser(service.ensure().publicKey, 'hunter2');
		const bytes = Buffer.from(sealed.ciphertext, 'base64');

		bytes[0] = bytes[0]! ^ 0xff;

		const open = () => service.open({ ...sealed, ciphertext: bytes.toString('base64') });

		expect(open).toThrow(/not sealed to this machine's key/);
		expect(open).not.toThrow(/hunter2/);
	});

	it('refuses a value sealed to another machine', async () => {
		const other = getInputsKeyService({ homeDir: tempHome() }).ensure();
		const service = getInputsKeyService({ homeDir: tempHome() });

		service.ensure();

		const sealed = await sealLikeTheBrowser(other.publicKey, 'hunter2');

		expect(() => service.open(sealed)).toThrow(/not sealed to this machine's key/);
	});

	it('does not invent a key to open a value with', async () => {
		const sealed = await sealLikeTheBrowser(getInputsKeyService({ homeDir: tempHome() }).ensure().publicKey, 'x');

		expect(() => getInputsKeyService({ homeDir: tempHome() }).open(sealed)).toThrow(/no inputs key yet/);
	});
});

describe('fingerprintOf', () => {
	// The browser computes the same string from the public key in `hello`; the two
	// only match if both hash the DER bytes and print them the same way.
	it('is SHA256: and the unpadded base64 digest of the DER key', () => {
		const { publicKey } = getInputsKeyService({ homeDir: tempHome() }).ensure();
		const expected = crypto.createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('base64');

		expect(fingerprintOf(publicKey)).toBe(`SHA256:${expected.replace(/=+$/, '')}`);
		expect(fingerprintOf(publicKey)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
	});
});
