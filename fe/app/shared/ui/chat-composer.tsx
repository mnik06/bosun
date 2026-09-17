import { ActionIcon, Group, Stack, Text, Textarea } from '@mantine/core'
import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'

import { submitOnEnter } from '~/shared/lib'

export function ChatComposer ({ placeholder, disabled = false, sending, hint, onSend }: {
	placeholder: string
	disabled?: boolean
	sending: boolean
	hint?: string | null
	onSend: (text: string) => Promise<unknown>
}) {
	const [text, setText] = useState('')

	const send = () => {
		const trimmed = text.trim()

		if (trimmed === '' || sending || disabled) {
			return
		}

		onSend(trimmed)
			.then(() => {
				setText('')
			})
			.catch(() => {
				// The caller's own mutation raises its own failure notification;
				// the typed text stays here for a retry.
			})
	}

	return (
		<Stack gap={4}>
			<Group gap="xs" align="end" wrap="nowrap">
				<Textarea
					className="grow"
					placeholder={placeholder}
					autosize
					minRows={1}
					maxRows={6}
					disabled={disabled}
					value={text}
					onChange={(event) => {
						setText(event.currentTarget.value)
					}}
					onKeyDown={submitOnEnter(send)}
				/>

				<ActionIcon
					size="lg"
					aria-label="Send"
					loading={sending}
					disabled={disabled || text.trim() === ''}
					onClick={send}
				>
					<SendHorizontal size={16} />
				</ActionIcon>
			</Group>

			{hint == null ? null : (
				<Text size="xs" c="dimmed">
					{hint}
				</Text>
			)}
		</Stack>
	)
}
