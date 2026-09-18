export function saveBlob (opts: { blob: Blob, name: string }): void {
	const url = URL.createObjectURL(opts.blob)
	const link = document.createElement('a')

	link.href = url
	link.download = opts.name
	link.click()
	// Deferred: revoking in the same tick can cancel the download the click
	// has only just started.
	setTimeout(() => {
		URL.revokeObjectURL(url)
	}, 0)
}
