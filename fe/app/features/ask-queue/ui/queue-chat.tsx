import { ActionIcon, Card, Group, Loader, ScrollArea, Stack, Text, Textarea } from '@mantine/core'
import { SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { QueueMessage } from '~/entities/queue'
import { useAskQueue } from '~/features/ask-queue/api/use-ask-queue'
import { MarkdownBlock } from '~/shared/ui'

function Bubble ({ message }: { message: QueueMessage }) {
	const mine = message.role === 'user'

	return (
		<Card
			withBorder
			padding="sm"
			radius="md"
			className={mine ? 'self-end max-w-[80%]' : 'max-w-[90%]'}
		>
			{mine ? <Text size="sm">{message.content}</Text> : <MarkdownBlock source={message.content} />}
		</Card>
	)
}

export function QueueChat ({
	queueId,
	messages,
	streaming
}: {
	queueId: string,
	messages: QueueMessage[],
	streaming: string | null
}) {
	const bottom = useRef<HTMLDivElement>(null)
	const [question, setQuestion] = useState('')
	const ask = useAskQueue(queueId)

	// The last message being theirs means the answer has not landed yet — either
	// it is streaming into the panel or the session is still reading the worktree.
	const awaiting = messages.at(-1)?.role === 'user'

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: 'end' })
	}, [messages.length, streaming])

	const send = () => {
		if (question.trim() === '') {
			return
		}

		ask.mutate(question.trim(), { onSuccess: () => { setQuestion('') } })
	}

	// A card that fills its pane and scrolls the transcript inside itself: the
	// queue page gives it a fixed height, and a transcript that grew the card
	// would push the composer off the bottom of it.
	return (
		<Card withBorder padding="md" radius="md" className="flex min-h-0 grow flex-col">
			<Stack gap={2} className="shrink-0">
				<Text fw={600}>Ask about this queue</Text>
				<Text size="sm" c="dimmed">
					Answered by a session standing in the worktree, with read access and git. It looks rather
					than guesses, and it changes nothing.
				</Text>
			</Stack>

			<ScrollArea className="min-h-0 grow" type="auto" mt="md">
				<Stack gap="sm" pr="md">
					{messages.map((message) => (
						<Bubble key={message.id} message={message} />
					))}

					{awaiting ? (
						<Group gap="xs" align="center">
							<Loader size={14} />
							<Text size="sm" c="dimmed">
								{streaming ?? 'Reading the worktree…'}
							</Text>
						</Group>
					) : null}

					<div ref={bottom} />
				</Stack>
			</ScrollArea>

			<Group gap="xs" align="end" wrap="nowrap" className="shrink-0 px-1 pt-3 pb-1">
				<Textarea
					className="grow"
					autosize
					minRows={1}
					maxRows={5}
					placeholder="What is it up to?"
					value={question}
					onChange={(event) => {
						setQuestion(event.currentTarget.value)
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault()
							send()
						}
					}}
				/>

				<ActionIcon
					size="lg"
					variant="light"
					aria-label="Ask"
					loading={ask.isPending}
					disabled={question.trim() === ''}
					onClick={send}
				>
					<SendHorizontal size={16} />
				</ActionIcon>
			</Group>
		</Card>
	)
}
