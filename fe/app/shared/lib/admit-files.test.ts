import { describe, expect, it } from 'vitest'

import { admitFiles } from './admit-files'

const MB = 1024 * 1024
const limits = { maxFiles: 3, maxFileBytes: 10 * MB, maxTotalBytes: 20 * MB }

function file (name: string, size: number): File {
	const value = new File([], name)

	Object.defineProperty(value, 'size', { value: size })

	return value
}

describe('admitFiles', () => {
	it('keeps what is already attached and adds what fits', () => {
		const current = [file('a.png', MB)]
		const result = admitFiles({ current, incoming: [file('b.log', 2 * MB)], limits })

		expect(result.files.map((entry) => entry.name)).toEqual(['a.png', 'b.log'])
		expect(result.refused).toEqual([])
	})

	it('refuses a file over the per-file limit and still takes the ones after it', () => {
		const result = admitFiles({
			current: [],
			incoming: [file('huge.mov', 10 * MB + 1), file('ok.png', 10 * MB)],
			limits
		})

		expect(result.files.map((entry) => entry.name)).toEqual(['ok.png'])
		expect(result.refused).toEqual(['huge.mov: larger than 10.0 MB'])
	})

	it('counts the files already attached towards the total', () => {
		const result = admitFiles({
			current: [file('a.png', 9 * MB), file('b.png', 9 * MB)],
			incoming: [file('c.png', 3 * MB), file('d.png', 2 * MB)],
			limits
		})

		expect(result.files.map((entry) => entry.name)).toEqual(['a.png', 'b.png', 'd.png'])
		expect(result.refused).toEqual(['c.png: files on one message cannot pass 20.0 MB'])
	})

	it('stops at the file count', () => {
		const result = admitFiles({
			current: [file('a', 1), file('b', 1)],
			incoming: [file('c', 1), file('d', 1)],
			limits
		})

		expect(result.files.map((entry) => entry.name)).toEqual(['a', 'b', 'c'])
		expect(result.refused).toEqual(['d: at most 3 files per message'])
	})
})
