import { Group, Loader, Text } from '@mantine/core'

// The trailing two lines of a live chat transcript, shared by plan chat and
// bug-fixing chat: the buffered delta a session is still producing, then the
// activity label while it works. Neither renders once its value is empty.
export function StreamingTail ({ streamingText, activity }: { streamingText: string, activity: string | null }) {
	return (
		<>
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
		</>
	)
}
