import { ActionIcon, FileButton, Group, Overlay, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'

import { usePendingFiles, useWindowFileIntake } from '~/shared/hooks'
import { submitOnEnter, type FileLimits } from '~/shared/lib'

import { PendingFilePills } from './pending-file-pills'

export interface ChatComposerMessage {
	text: string
	files: File[]
}

function DropOverlay ({ message }: { message: string }) {
	return (
		<Overlay fixed center blur={2} backgroundOpacity={0.35} zIndex={400} className="pointer-events-none">
			<Text size="lg" fw={600} c="white">
				{message}
			</Text>
		</Overlay>
	)
}

export function ChatComposer ({
	placeholder,
	disabled = false,
	sending,
	hint,
	attachments,
	attachmentsOff,
	onSend
}: {
	placeholder: string
	disabled?: boolean
	sending: boolean
	hint?: string | null
	// Given when the message may carry files: picked with the paperclip, pasted
	// anywhere on the page, or dropped anywhere on it. Without it the composer
	// takes text only.
	attachments?: FileLimits | undefined
	// Why files cannot go with this message right now, told to whoever pastes or
	// drops one anyway rather than letting it vanish.
	attachmentsOff?: string | null
	onSend: (message: ChatComposerMessage) => Promise<unknown>
}) {
	const [text, setText] = useState('')
	const limits = disabled ? undefined : attachments
	const pending = usePendingFiles(limits)
	const resetPicker = useRef<() => void>(null)
	const empty = text.trim() === '' && pending.files.length === 0
	const offReason = attachmentsOff ?? 'This message cannot carry files.'

	const dragging = useWindowFileIntake((files) => {
		if (limits) {
			pending.add(files)

			return
		}

		notifications.show({ color: 'yellow', title: 'Files not attached', message: offReason })
	})

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

	return (
		<Stack gap={4}>
			{dragging ? <DropOverlay message={limits ? 'Drop to attach' : offReason} /> : null}

			{pending.files.length === 0 ? null : <PendingFilePills files={pending.files} onRemove={pending.remove} />}

			<Group gap="xs" align="end" wrap="nowrap">
				{limits ? (
					<FileButton
						multiple
						resetRef={resetPicker}
						onChange={(files) => {
							pending.add(files)
							resetPicker.current?.()
						}}
					>
						{(props) => (
							<ActionIcon {...props} size="lg" variant="subtle" aria-label="Attach files">
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
