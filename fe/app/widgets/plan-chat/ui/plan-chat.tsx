import { Alert, Anchor, Loader, ScrollArea, Stack, Text } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'

import { findPendingQuestion, type Plan, type PlanDetail, type PlanMessage } from '~/entities/plan'
import { QuestionPrompt, useAnswerQuestion } from '~/features/answer-question'
import { PlanComposer } from '~/features/say-to-plan'
import { Transcript } from '~/widgets/plan-chat/ui/transcript'

export function PlanChat ({
	plan,
	draftParts,
	messages,
	streamingText,
	activity
}: {
	plan: Plan
	draftParts: PlanDetail['draftParts']
	messages: PlanMessage[]
	streamingText: string
	activity: string | null
}) {
	const bottom = useRef<HTMLDivElement>(null)
	const pending = findPendingQuestion(messages)
	const answer = useAnswerQuestion(plan.id)

	// One sentence cannot be the answer to three questions, so the composer only
	// takes over the reply when exactly one is open.
	const open = pending !== null && pending.questions.length === 1 ? pending : null

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: 'end' })
	}, [messages.length, streamingText, pending?.questionId])

	return (
		<div className="flex min-h-0 grow flex-col gap-3">
			<ScrollArea className="min-h-0 grow" type="auto">
				<Stack gap="lg" pr="md">
					{plan.sessionPlanId === null ? null : (
						<Text size="xs" c="dimmed">
							Grilled in one session with other plans from the same ticket. While that session is up,
							what you say here goes to it and it answers in{' '}
							<Anchor component={Link} to={`/plans/${plan.sessionPlanId}`} size="xs">
								the plan it started from
							</Anchor>
							.
						</Text>
					)}

					{draftParts.length === 0 ? null : (
						<Text size="xs" c="dimmed">
							This session also writes{' '}
							{draftParts.map((part) => `#${part.number} ${part.title ?? 'Untitled'}`).join(', ')}.
							They appear in the plans list together, once every one of them is published.
						</Text>
					)}

					<Transcript planId={plan.id} messages={messages} streamingText={streamingText} activity={activity} />

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
			</ScrollArea>

			{/* Always here, whatever the plan's status. A ready plan is revised by
			    saying so, and a running one takes a correction mid-grill. */}
			<div className="shrink-0 px-1 pb-1">
				<PlanComposer
					planId={plan.id}
					busy={plan.status === 'planning'}
					answering={answer.isPending}
					onAnswer={
						open === null
							? undefined
							: async (text) =>
								answer.mutateAsync({
									questionId: open.questionId,
									answers: [{ selected: [text] }]
								})
					}
				/>
			</div>
		</div>
	)
}
