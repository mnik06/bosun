import { Card, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

// A person's own turn in a live chat transcript, shared by plan chat and
// bug-fixing chat: the one message role every such transcript sets apart from
// the session's own prose with a bordered card instead of plain text. What they
// attached goes under the text; a turn can be files alone.
export function ChatMessageBubble ({ text, children }: { text: string, children?: ReactNode }) {
	return (
		<Card withBorder padding="md" radius="md" bg="var(--mantine-color-default-hover)">
			<Stack gap="sm">
				{text === '' ? null : (
					<Text size="sm" className="whitespace-pre-wrap">
						{text}
					</Text>
				)}
				{children}
			</Stack>
		</Card>
	)
}
