import type { KeyboardEvent } from 'react'

// Enter sends, shift+enter breaks the line: the box is a chat input first and
// a text editor second.
export function submitOnEnter (send: () => void): (event: KeyboardEvent<HTMLTextAreaElement>) => void {
	return (event) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			send()
		}
	}
}
