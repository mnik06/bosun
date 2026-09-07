import { Alert, Loader, Stack, Text } from '@mantine/core'
import { useEffect, useRef } from 'react'

import { findPendingQuestion, type Plan, type PlanMessage } from '~/entities/plan'
import { QuestionPrompt } from '~/features/answer-question'
import { Transcript } from '~/widgets/plan-chat/ui/transcript'

export function PlanChat ({
	plan,
	messages,
	streamingText,
	activity
}: {
	plan: Plan
	messages: PlanMessage[]
	streamingText: string
	activity: string | null
}) {
	const bottom = useRef<HTMLDivElement>(null)
	const pending = findPendingQuestion(messages)

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: 'end' })
	}, [messages.length, streamingText, pending?.questionId])

	return (
		<Stack gap="lg">
			<Transcript messages={messages} streamingText={streamingText} activity={activity} />

			{plan.status === 'failed' ? (
				<Alert color="red" title="This session ended early">
					{plan.failureReason ?? 'The session stopped without finishing.'}
				</Alert>
			) : null}

			{pending === null ? null : (
				<QuestionPrompt planId={plan.id} pending={pending} disabled={plan.status !== 'planning'} />
			)}

			{plan.status === 'planning' && pending === null && activity === null &&
			streamingText.length === 0 ? (
					<Text size="xs" c="dimmed">
						<Loader size={12} className="mr-2 inline-block align-middle" />
						Waiting for the session…
					</Text>
				) : null}

			<div ref={bottom} />
		</Stack>
	)
}
