import { createHash, generateKeyPairSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { keyFingerprint } from './key-fingerprint'

describe('keyFingerprint', () => {
	// The operator compares this against the agent's output by eye. Any drift in the
	// encoding reads as a swapped key, which is exactly the alarm it exists to raise.
	it('is SHA256: and the unpadded base64 of the SPKI digest', async () => {
		const { publicKey } = generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding: { type: 'spki', format: 'der' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
		})
		const expected = createHash('sha256').update(publicKey).digest('base64').replace(/=+$/, '')

		expect(await keyFingerprint(publicKey.toString('base64'))).toBe(`SHA256:${expected}`)
	})
})
