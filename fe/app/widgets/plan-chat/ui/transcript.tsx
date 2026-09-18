import { Card, Stack, Text } from '@mantine/core'

import { AnsweredQuestion, UserChatTurn, type PlanAnswer, type PlanMessage } from '~/entities/plan'
import { StreamingTail } from '~/shared/ui'

function answersByQuestion (messages: PlanMessage[]): Record<string, PlanAnswer[]> {
	return Object.fromEntries(
		messages.flatMap((message) =>
			message.role === 'answer' ? [[message.content.questionId, message.content.answers]] : []
		)
	)
}

function TranscriptEntry ({
	planId,
	message,
	answers
}: {
	planId: string
	message: PlanMessage
	answers: Record<string, PlanAnswer[]>
}) {
	if (message.role === 'user') {
		return <UserChatTurn planId={planId} text={message.content.text} attachments={message.content.attachments} />
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
	planId,
	messages,
	streamingText,
	activity
}: {
	planId: string
	messages: PlanMessage[]
	streamingText: string
	activity: string | null
}) {
	const answers = answersByQuestion(messages)

	return (
		<Stack gap="lg">
			{messages.map((message) => (
				<TranscriptEntry key={message.id} planId={planId} message={message} answers={answers} />
			))}

			<StreamingTail streamingText={streamingText} activity={activity} />
		</Stack>
	)
}
