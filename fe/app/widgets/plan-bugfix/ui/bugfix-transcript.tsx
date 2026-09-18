import { Alert, Stack, Text } from '@mantine/core'

import type { BugfixMessage } from '~/entities/plan'
import { ChatMessageBubble, StreamingTail } from '~/shared/ui'

function TranscriptEntry ({ message }: { message: BugfixMessage }) {
	if (message.role === 'user') {
		return <ChatMessageBubble text={message.content.text} />
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
	messages,
	streamingText,
	activity
}: {
	messages: BugfixMessage[]
	streamingText: string
	activity: string | null
}) {
	return (
		<Stack gap="lg">
			{messages.map((message) => (
				<TranscriptEntry key={message.id} message={message} />
			))}

			<StreamingTail streamingText={streamingText} activity={activity} />
		</Stack>
	)
}
