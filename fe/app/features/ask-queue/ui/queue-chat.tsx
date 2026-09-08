import { ActionIcon, Card, Group, Loader, Stack, Text, Textarea } from '@mantine/core'
import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'

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
	const [question, setQuestion] = useState('')
	const ask = useAskQueue(queueId)

	// The last message being theirs means the answer has not landed yet — either
	// it is streaming into the panel or the session is still reading the worktree.
	const awaiting = messages.at(-1)?.role === 'user'

	const send = () => {
		if (question.trim() === '') {
			return
		}

		ask.mutate(question.trim(), { onSuccess: () => { setQuestion('') } })
	}

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<Stack gap={2}>
					<Text fw={600}>Ask about this queue</Text>
					<Text size="sm" c="dimmed">
						Answered by a session standing in the worktree, with read access and git. It looks
						rather than guesses, and it changes nothing.
					</Text>
				</Stack>

				{messages.length === 0 ? null : (
					<Stack gap="sm">
						{messages.map((message) => (
							<Bubble key={message.id} message={message} />
						))}
					</Stack>
				)}

				{awaiting ? (
					<Group gap="xs" align="center">
						<Loader size={14} />
						<Text size="sm" c="dimmed">
							{streaming ?? 'Reading the worktree…'}
						</Text>
					</Group>
				) : null}

				<Group gap="xs" align="end" wrap="nowrap">
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
			</Stack>
		</Card>
	)
}
