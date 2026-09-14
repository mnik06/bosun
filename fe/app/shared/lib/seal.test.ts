import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { seal, type SealedValue } from './seal'

function machineKeyPair () {
	const { publicKey, privateKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'der' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
	})

	return { publicKey: publicKey.toString('base64'), privateKey }
}

// What the agent does with an envelope, spelled with node's crypto the way the
// agent spells it. A browser and a machine that disagree on any byte of this
// format fail every save with a decryption error nobody can read a value from.
function open (sealed: SealedValue, privateKey: string): string {
	const valueKey = privateDecrypt(
		{ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
		Buffer.from(sealed.wrappedKey, 'base64')
	)
	const payload = Buffer.from(sealed.ciphertext, 'base64')
	const decipher = createDecipheriv('aes-256-gcm', valueKey, Buffer.from(sealed.iv, 'base64'))

	decipher.setAuthTag(payload.subarray(payload.length - 16))

	return Buffer.concat([decipher.update(payload.subarray(0, payload.length - 16)), decipher.final()]).toString('utf8')
}

describe('seal', () => {
	it('produces an envelope the machine key opens back into the value', async () => {
		const { publicKey, privateKey } = machineKeyPair()
		const value = 'postgres://bosun:pässwörd@db.internal:5432/app?sslmode=require'

		const sealed = await seal(publicKey, value)

		expect(sealed.v).toBe(1)
		expect(Buffer.from(sealed.iv, 'base64')).toHaveLength(12)
		expect(sealed.ciphertext).not.toContain('postgres')
		expect(open(sealed, privateKey)).toBe(value)
	})

	it('seals the same value differently each time', async () => {
		const { publicKey, privateKey } = machineKeyPair()

		const [first, second] = await Promise.all([seal(publicKey, 'hunter2'), seal(publicKey, 'hunter2')])

		expect(first.ciphertext).not.toBe(second.ciphertext)
		expect(first.iv).not.toBe(second.iv)
		expect(open(second, privateKey)).toBe('hunter2')
	})

	it('seals an empty value', async () => {
		const { publicKey, privateKey } = machineKeyPair()

		expect(open(await seal(publicKey, ''), privateKey)).toBe('')
	})
})
