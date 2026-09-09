import { Card, Stack, Text } from '@mantine/core'

import type { QueueItemDetail } from '~/entities/queue'
import { QueueItemCard } from '~/widgets/queue-detail/ui/queue-item-card'

export function QueueWork ({
	items,
	activity,
	now,
	onRemove
}: {
	items: QueueItemDetail[],
	activity: Record<string, string>,
	now: number,
	onRemove: (itemId: string) => void
}) {
	if (items.length === 0) {
		return (
			<Card withBorder padding="md" radius="md">
				<Text size="sm" c="dimmed">
					Nothing queued. Add a finished plan and it runs here, bullet by bullet, on a branch of
					its own.
				</Text>
			</Card>
		)
	}

	return (
		<Stack gap="md">
			{items.map((item) => (
				<QueueItemCard
					key={item.id}
					item={item}
					activity={activity}
					now={now}
					onRemove={onRemove}
				/>
			))}
		</Stack>
	)
}
