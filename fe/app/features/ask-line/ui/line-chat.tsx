import { ActionIcon, Card, Group, Loader, ScrollArea, Stack, Text, Textarea } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
	repositoryKeys,
	useRepositoryAnswer,
	useRepositoryMessagesQuery,
	type RepositoryMessage
} from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'
import { MarkdownBlock } from '~/shared/ui'

function Bubble ({ message }: { message: RepositoryMessage }) {
	const mine = message.role === 'user'

	return (
		<Card withBorder padding="sm" radius="md" className={mine ? 'max-w-[80%] self-end' : 'max-w-[90%]'}>
			{mine ? <Text size="sm">{message.content}</Text> : <MarkdownBlock source={message.content} />}
		</Card>
	)
}

export function LineChat ({ repositoryId }: { repositoryId: string }) {
	const bottom = useRef<HTMLDivElement>(null)
	const [question, setQuestion] = useState('')
	const queryClient = useQueryClient()
	const messages = useRepositoryMessagesQuery(repositoryId)
	const streaming = useRepositoryAnswer(repositoryId)
	const ask = useMutation({
		mutationFn: async (text: string) => {
			await apiClient.post(`/repositories/${repositoryId}/messages`, { question: text })
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.messages(repositoryId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not ask that', error })
		}
	})
	const list = messages.data ?? []
	// The last message being theirs means the answer has not landed yet.
	const awaiting = list.at(-1)?.role === 'user'

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: 'end' })
	}, [list.length, streaming])

	const send = () => {
		if (question.trim() === '') {
			return
		}

		ask.mutate(question.trim(), { onSuccess: () => { setQuestion('') } })
	}

	return (
		<div className="flex min-h-0 grow flex-col">
			<Text size="sm" c="dimmed" className="shrink-0">
				Answered by a session reading the repository, with what bosun knows about the line. It looks
				rather than guesses, and it changes nothing.
			</Text>

			<ScrollArea className="min-h-0 grow" type="auto" mt="md">
				<Stack gap="sm" pr="md">
					{messages.isPending ? <Loader size="sm" /> : null}

					{list.map((message) => (
						<Bubble key={message.id} message={message} />
					))}

					{awaiting ? (
						<Group gap="xs" align="center">
							<Loader size={14} />
							<Text size="sm" c="dimmed">
								{streaming ?? 'Reading the repository…'}
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
					placeholder="What is waiting on what?"
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
		</div>
	)
}
