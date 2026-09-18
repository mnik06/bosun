// What a browser names an image that came off the clipboard rather than off disk.
const CLIPBOARD_IMAGE_NAME = /^image\.(png|jpe?g|gif|webp)$/i

function pad (value: number): string {
	return String(value).padStart(2, '0')
}

// Every pasted screenshot arrives as `image.png`, and three of them in one message
// are three identical names in the chat and in the session's prompt.
function nameClipboardImage (opts: { file: File, index: number, now: Date }): File {
	const extension = CLIPBOARD_IMAGE_NAME.exec(opts.file.name)?.[1]

	if (extension === undefined) {
		return opts.file
	}

	const { now } = opts
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`
	const suffix = opts.index === 0 ? '' : ` (${opts.index + 1})`

	return new File([opts.file], `Screenshot ${stamp}${suffix}.${extension.toLowerCase()}`, {
		type: opts.file.type,
		lastModified: opts.file.lastModified
	})
}

// The files a paste carries, or none when it is really text. Office apps put a
// rendered picture of the selection on the clipboard beside the text itself, so
// a paste that has both plain text and HTML is somebody pasting words, and taking
// the picture would attach a screenshot of a spreadsheet nobody asked for. A
// screenshot, a copied image and a file copied in the file manager carry no such
// pair. `items` is read before `files`: some browsers only list a pasted image
// there.
export function clipboardFiles (data: DataTransfer | null, now = new Date()): File[] {
	if (!data || (data.types.includes('text/html') && data.getData('text/plain').trim() !== '')) {
		return []
	}

	const fromItems = Array.from(data.items).flatMap((item) => {
		const file = item.kind === 'file' ? item.getAsFile() : null

		return file ? [file] : []
	})
	const files = fromItems.length > 0 ? fromItems : Array.from(data.files)

	return files.map((file, index) => nameClipboardImage({ file, index, now }))
}
