import { Card, Group, Loader, Stack, Text } from '@mantine/core'

import { AnsweredQuestion, type PlanAnswer, type PlanMessage } from '~/entities/plan'

function answersByQuestion (messages: PlanMessage[]): Record<string, PlanAnswer[]> {
	return Object.fromEntries(
		messages.flatMap((message) =>
			message.role === 'answer' ? [[message.content.questionId, message.content.answers]] : []
		)
	)
}

function TranscriptEntry ({
	message,
	answers
}: {
	message: PlanMessage
	answers: Record<string, PlanAnswer[]>
}) {
	if (message.role === 'user') {
		return (
			<Card withBorder padding="md" radius="md" bg="var(--mantine-color-default-hover)">
				<Text size="sm" className="whitespace-pre-wrap">
					{message.content.text}
				</Text>
			</Card>
		)
	}

	if (message.role === 'assistant') {
		return (
			<Text size="sm" className="whitespace-pre-wrap">
				{message.content.text}
			</Text>
		)
	}

	// An unanswered question is rendered by the prompt below the transcript, so
	// it does not appear twice while it is still waiting.
	if (message.role === 'question') {
		const given = answers[message.content.questionId]

		return given === undefined ? null : (
			<Card withBorder padding="md" radius="md">
				<AnsweredQuestion questions={message.content.questions} answers={given} />
			</Card>
		)
	}

	return null
}

export function Transcript ({
	messages,
	streamingText,
	activity
}: {
	messages: PlanMessage[]
	streamingText: string
	activity: string | null
}) {
	const answers = answersByQuestion(messages)

	return (
		<Stack gap="lg">
			{messages.map((message) => (
				<TranscriptEntry key={message.id} message={message} answers={answers} />
			))}

			{streamingText.length === 0 ? null : (
				<Text size="sm" className="whitespace-pre-wrap">
					{streamingText}
				</Text>
			)}

			{activity === null ? null : (
				<Group gap="xs">
					<Loader size={14} />
					<Text size="xs" c="dimmed">
						{activity}
					</Text>
				</Group>
			)}
		</Stack>
	)
}
