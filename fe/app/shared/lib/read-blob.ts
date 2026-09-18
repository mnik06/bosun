// FileReader rather than `bytesToBase64`: a 10 MB screenshot run through a
// per-byte string concat freezes the tab for as long as the encode takes.
export async function readBlobAsDataUrl (blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()

		reader.onload = () => {
			// `readAsDataURL` always settles with a string; anything else is a reader
			// that did not do what it was asked.
			if (typeof reader.result === 'string') {
				resolve(reader.result)
			} else {
				reject(new Error('Could not read the file'))
			}
		}
		reader.onerror = () => {
			reject(reader.error ?? new Error('Could not read the file'))
		}
		reader.readAsDataURL(blob)
	})
}

export async function readBlobAsBase64 (blob: Blob): Promise<string> {
	const url = await readBlobAsDataUrl(blob)

	return url.slice(url.indexOf(',') + 1)
}
