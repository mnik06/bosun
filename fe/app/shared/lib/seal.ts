import { base64ToBytes, bytesToBase64 } from './base64'

export interface SealedValue {
	v: 1
	wrappedKey: string
	iv: string
	ciphertext: string
}

// Sealed here, before the request is built, so no request body, log line or
// database row between this tab and the machine ever holds the value. A fresh AES
// key per value keeps two sealed copies of one secret from looking alike.
export async function seal (publicKey: string, value: string): Promise<SealedValue> {
	const subtle = globalThis.crypto.subtle
	const machineKey = await subtle.importKey(
		'spki',
		base64ToBytes(publicKey),
		{ name: 'RSA-OAEP', hash: 'SHA-256' },
		false,
		['encrypt']
	)
	const valueKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
	const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
	const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, valueKey, new TextEncoder().encode(value))
	const wrappedKey = await subtle.encrypt({ name: 'RSA-OAEP' }, machineKey, await subtle.exportKey('raw', valueKey))

	return {
		v: 1,
		wrappedKey: bytesToBase64(wrappedKey),
		iv: bytesToBase64(iv),
		ciphertext: bytesToBase64(ciphertext)
	}
}
