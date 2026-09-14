import { base64ToBytes, bytesToBase64 } from './base64'

// The same string `bosun-agent setup` prints on the box. A backend that swapped
// the key it relays would show one here that the terminal does not.
export async function keyFingerprint (publicKey: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', base64ToBytes(publicKey))

	return `SHA256:${bytesToBase64(digest).replace(/=+$/, '')}`
}
