import { describe, expect, it } from 'vitest'

import { clipboardFiles } from './clipboard-files'

const NOW = new Date(2026, 8, 18, 9, 5, 7)

function clipboard (opts: { files?: File[], itemFiles?: File[], text?: string, html?: string }): DataTransfer {
	const data: Record<string, string> = {}

	if (opts.text !== undefined) {
		data['text/plain'] = opts.text
	}

	if (opts.html !== undefined) {
		data['text/html'] = opts.html
	}

	const items = (opts.itemFiles ?? []).map((file) => ({ kind: 'file', getAsFile: () => file }))
	const hasFiles = items.length > 0 || (opts.files ?? []).length > 0

	return {
		types: [...Object.keys(data), ...(hasFiles ? ['Files'] : [])],
		getData: (type: string) => data[type] ?? '',
		items: [...items, ...Object.keys(data).map(() => ({ kind: 'string', getAsFile: () => null }))],
		files: opts.files ?? []
	} as unknown as DataTransfer
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('clipboardFiles', () => {
	it('names pasted screenshots apart instead of calling every one image.png', () => {
		const files = clipboardFiles(clipboard({ itemFiles: [png('image.png'), png('image.png')] }), NOW)

		expect(files.map((file) => file.name)).toEqual([
			'Screenshot 2026-09-18 09.05.07.png',
			'Screenshot 2026-09-18 09.05.07 (2).png'
		])
		expect(files.map((file) => file.type)).toEqual(['image/png', 'image/png'])
	})

	it('keeps the name of a file copied from disk', () => {
		expect(clipboardFiles(clipboard({ files: [png('design.png')] }), NOW).map((file) => file.name)).toEqual(['design.png'])
	})

	it('reads the items when the browser leaves files empty', () => {
		expect(clipboardFiles(clipboard({ itemFiles: [png('image.png')], files: [] }), NOW)).toHaveLength(1)
	})

	it('takes an image copied from a web page, which comes with HTML but no text', () => {
		expect(clipboardFiles(clipboard({ itemFiles: [png('image.png')], html: '<img src="x">' }), NOW)).toHaveLength(1)
	})

	it('leaves a paste of text from an office app to the text box, picture and all', () => {
		expect(clipboardFiles(clipboard({ itemFiles: [png('image.png')], text: 'A1\tB1', html: '<table></table>' }), NOW)).toEqual([])
	})

	it('finds nothing in a plain text paste', () => {
		expect(clipboardFiles(clipboard({ text: 'hello' }), NOW)).toEqual([])
		expect(clipboardFiles(null, NOW)).toEqual([])
	})
})
