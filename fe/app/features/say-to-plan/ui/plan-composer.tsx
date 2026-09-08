import { ActionIcon, Group, Stack, Text, Textarea } from '@mantine/core'
import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'

import { useSayToPlan } from '~/features/say-to-plan/api/use-say-to-plan'

export function PlanComposer ({
	planId,
	busy,
	onAnswer,
	answering = false
}: {
	planId: string,
	busy: boolean,
	// Given when a question is open. Typed text answers it rather than joining the
	// queue behind it: the session is blocked inside the tool call that asked, so a
	// queued line would wait for the thing that is waiting for it.
	onAnswer?: ((text: string) => Promise<unknown>) | undefined,
	answering?: boolean
}) {
	const [text, setText] = useState('')
	const say = useSayToPlan(planId)
	const sending = say.isPending || answering

	const send = () => {
		const trimmed = text.trim()

		if (trimmed === '' || sending) {
			return
		}

		if (onAnswer) {
			onAnswer(trimmed)
				.then(() => {
					setText('')
				})
				.catch(() => {
					// The mutation raises its own notification; the text stays for a retry.
				})

			return
		}

		say.mutate(trimmed, {
			onSuccess: () => {
				setText('')
			}
		})
	}

	return (
		<Stack gap={4}>
			<Group gap="xs" align="end" wrap="nowrap">
				<Textarea
					className="grow"
					placeholder={onAnswer ? 'Answer in your own words' : 'Ask for a change, or add what you forgot'}
					autosize
					minRows={1}
					maxRows={6}
					value={text}
					onChange={(event) => {
						setText(event.currentTarget.value)
					}}
					onKeyDown={(event) => {
						// Enter sends, shift+enter breaks the line: the box is a chat input
						// first and a text editor second.
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault()
							send()
						}
					}}
				/>

				<ActionIcon
					size="lg"
					aria-label="Send"
					loading={sending}
					disabled={text.trim() === ''}
					onClick={send}
				>
					<SendHorizontal size={16} />
				</ActionIcon>
			</Group>

			{busy && !onAnswer ? (
				<Text size="xs" c="dimmed">
					The session is working — what you send waits and is picked up the moment its current step
					finishes.
				</Text>
			) : null}
		</Stack>
	)
}
