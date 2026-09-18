import { Card, Text } from '@mantine/core'

// A person's own turn in a live chat transcript, shared by plan chat and
// bug-fixing chat: the one message role every such transcript sets apart from
// the session's own prose with a bordered card instead of plain text.
export function ChatMessageBubble ({ text }: { text: string }) {
	return (
		<Card withBorder padding="md" radius="md" bg="var(--mantine-color-default-hover)">
			<Text size="sm" className="whitespace-pre-wrap">
				{text}
			</Text>
		</Card>
	)
}
