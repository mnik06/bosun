import { useEffect, useEffectEvent, useState } from 'react'

import { clipboardFiles } from '~/shared/lib'

function carriesFiles (event: DragEvent): boolean {
	return event.dataTransfer?.types.includes('Files') ?? false
}

// Files pasted or dropped anywhere on the page, not only onto the text box: a
// screenshot is pasted with whatever happens to have focus, and dropped wherever
// the pointer is. Held on the window for as long as the caller is mounted, so
// only one composer may use it at a time.
//
// A dragged file is claimed even when the caller cannot take it. Left alone, a
// file dropped on the page is opened by the browser in place of the app.
//
// Returns whether files are being dragged over the page, for an overlay.
export function useWindowFileIntake (onFiles: (files: File[]) => void): boolean {
	const [dragging, setDragging] = useState(false)
	const take = useEffectEvent(onFiles)

	useEffect(() => {
		// `dragenter` and `dragleave` fire for every element the pointer crosses,
		// so a single leave means nothing until it has matched every enter.
		let depth = 0

		const onPaste = (event: ClipboardEvent) => {
			const files = clipboardFiles(event.clipboardData)

			if (files.length > 0) {
				event.preventDefault()
				take(files)
			}
		}
		const onDragEnter = (event: DragEvent) => {
			if (carriesFiles(event)) {
				depth += 1
				setDragging(true)
			}
		}
		const onDragLeave = (event: DragEvent) => {
			if (carriesFiles(event)) {
				depth = Math.max(0, depth - 1)
				setDragging(depth > 0)
			}
		}
		const onDragOver = (event: DragEvent) => {
			if (carriesFiles(event)) {
				event.preventDefault()
			}
		}
		const onDrop = (event: DragEvent) => {
			if (!carriesFiles(event)) {
				return
			}

			event.preventDefault()
			depth = 0
			setDragging(false)
			take(Array.from(event.dataTransfer?.files ?? []))
		}

		window.addEventListener('paste', onPaste)
		window.addEventListener('dragenter', onDragEnter)
		window.addEventListener('dragleave', onDragLeave)
		window.addEventListener('dragover', onDragOver)
		window.addEventListener('drop', onDrop)

		return () => {
			window.removeEventListener('paste', onPaste)
			window.removeEventListener('dragenter', onDragEnter)
			window.removeEventListener('dragleave', onDragLeave)
			window.removeEventListener('dragover', onDragOver)
			window.removeEventListener('drop', onDrop)
		}
	}, [])

	return dragging
}
