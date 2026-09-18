import { Alert, Stack, Text } from '@mantine/core'

import { UserChatTurn, type BugfixMessage } from '~/entities/plan'
import { StreamingTail } from '~/shared/ui'

function TranscriptEntry ({ planId, message }: { planId: string, message: BugfixMessage }) {
	if (message.role === 'user') {
		return <UserChatTurn planId={planId} text={message.content.text} attachments={message.content.attachments} />
	}

	// A force-end reads as an interruption, not a reply, so it never looks like
	// something the orchestrator itself said.
	if (message.role === 'system') {
		return (
			<Alert color="gray" variant="light" title="This session ended">
				{message.content.text}
			</Alert>
		)
	}

	return (
		<Text size="sm" className="whitespace-pre-wrap">
			{message.content.text}
		</Text>
	)
}

export function BugfixTranscript ({
	planId,
	messages,
	streamingText,
	activity
}: {
	planId: string
	messages: BugfixMessage[]
	streamingText: string
	activity: string | null
}) {
	return (
		<Stack gap="lg">
			{messages.map((message) => (
				<TranscriptEntry key={message.id} planId={planId} message={message} />
			))}

			<StreamingTail streamingText={streamingText} activity={activity} />
		</Stack>
	)
}
