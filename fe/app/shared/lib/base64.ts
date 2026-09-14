export function bytesToBase64 (bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
	let binary = ''

	for (const byte of view) {
		binary += String.fromCharCode(byte)
	}

	return btoa(binary)
}

export function base64ToBytes (value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value)
	const bytes = new Uint8Array(binary.length)

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}

	return bytes
}
