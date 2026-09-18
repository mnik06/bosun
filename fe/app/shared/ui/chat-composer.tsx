import { ActionIcon, FileButton, Group, Stack, Text, Textarea } from '@mantine/core'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'

import { usePendingFiles } from '~/shared/hooks'
import { submitOnEnter, type FileLimits } from '~/shared/lib'

import { PendingFilePills } from './pending-file-pills'

export interface ChatComposerMessage {
	text: string
	files: File[]
}

export function ChatComposer ({ placeholder, disabled = false, sending, hint, attachments, onSend }: {
	placeholder: string
	disabled?: boolean
	sending: boolean
	hint?: string | null
	// Given when the message may carry files. Without it the composer takes text
	// only — the paperclip is hidden and a paste or drop of files does nothing.
	attachments?: FileLimits | undefined
	onSend: (message: ChatComposerMessage) => Promise<unknown>
}) {
	const [text, setText] = useState('')
	const pending = usePendingFiles(disabled ? undefined : attachments)
	const resetPicker = useRef<() => void>(null)
	const empty = text.trim() === '' && pending.files.length === 0

	const send = () => {
		if (empty || sending || disabled) {
			return
		}

		onSend({ text: text.trim(), files: pending.files })
			.then(() => {
				setText('')
				pending.clear()
			})
			.catch(() => {
				// The caller's own mutation raises its own failure notification;
				// the typed text and the picked files stay here for a retry.
			})
	}

	const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		const files = Array.from(event.clipboardData.files)

		if (files.length > 0 && attachments) {
			event.preventDefault()
			pending.add(files)
		}
	}

	const onDrop = (event: DragEvent<HTMLDivElement>) => {
		if (attachments && event.dataTransfer.files.length > 0) {
			event.preventDefault()
			pending.add(Array.from(event.dataTransfer.files))
		}
	}

	return (
		<Stack
			gap={4}
			onDragOver={(event) => {
				if (attachments) {
					event.preventDefault()
				}
			}}
			onDrop={onDrop}
		>
			{pending.files.length === 0 ? null : <PendingFilePills files={pending.files} onRemove={pending.remove} />}

			<Group gap="xs" align="end" wrap="nowrap">
				{attachments ? (
					<FileButton
						multiple
						resetRef={resetPicker}
						disabled={disabled}
						onChange={(files) => {
							pending.add(files)
							resetPicker.current?.()
						}}
					>
						{(props) => (
							<ActionIcon {...props} size="lg" variant="subtle" aria-label="Attach files" disabled={disabled}>
								<Paperclip size={16} />
							</ActionIcon>
						)}
					</FileButton>
				) : null}

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
					onPaste={onPaste}
				/>

				<ActionIcon
					size="lg"
					aria-label="Send"
					loading={sending}
					disabled={disabled || empty}
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
