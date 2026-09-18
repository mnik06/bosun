import { formatFileSize } from './format-bytes'

export interface FileLimits {
	maxFiles: number
	maxFileBytes: number
	maxTotalBytes: number
}

// Taken in order until a limit stops one, and every file refused is named with
// its reason: the whole message goes up as one request, so a file over a limit
// is better turned away at the paperclip than as a refused send.
export function admitFiles (opts: { current: File[], incoming: File[], limits: FileLimits }): {
	files: File[]
	refused: string[]
} {
	const { limits } = opts
	const files = [...opts.current]
	const refused: string[] = []
	let total = files.reduce((sum, file) => sum + file.size, 0)

	for (const file of opts.incoming) {
		if (files.length >= limits.maxFiles) {
			refused.push(`${file.name}: at most ${limits.maxFiles} files per message`)
		} else if (file.size > limits.maxFileBytes) {
			refused.push(`${file.name}: larger than ${formatFileSize(limits.maxFileBytes)}`)
		} else if (total + file.size > limits.maxTotalBytes) {
			refused.push(`${file.name}: files on one message cannot pass ${formatFileSize(limits.maxTotalBytes)}`)
		} else {
			files.push(file)
			total += file.size
		}
	}

	return { files, refused }
}
