import { ActionIcon, Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { ExternalLink, X } from 'lucide-react'

import type { QueueItemDetail, QueueItemStatus } from '~/entities/queue'
import { RetryPlanButton } from '~/features/retry-plan'
import { SliceRunRow } from '~/widgets/queue-detail/ui/slice-run-row'

const COLORS: Record<QueueItemStatus, string> = {
	queued: 'gray',
	running: 'blue',
	done: 'green',
	failed: 'red',
	cancelled: 'gray'
}

export function QueueItemCard ({
	item,
	activity,
	onRemove
}: {
	item: QueueItemDetail,
	activity: Record<string, string>,
	onRemove: (itemId: string) => void
}) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="start" wrap="nowrap">
					<Stack gap={2} className="min-w-0">
						<Group gap="xs">
							<Text fw={600} truncate>
								{item.planTitle ?? 'Untitled plan'}
							</Text>
							<Badge size="sm" variant="light" color={COLORS[item.status]}>
								{item.status}
							</Badge>
						</Group>

						{item.branch === null ? null : (
							<Text size="xs" c="dimmed" className="font-mono">
								{item.branch}
							</Text>
						)}

						{item.failureReason === null ? null : (
							<Text size="xs" c="red">
								{item.failureReason}
							</Text>
						)}

						{item.prUrl === null ? null : (
							<Anchor href={item.prUrl} target="_blank" rel="noreferrer" size="xs">
								<Group gap={4} align="center">
									Pull request
									<ExternalLink size={12} />
								</Group>
							</Anchor>
						)}
					</Stack>

					<Group gap="xs" wrap="nowrap">
						<RetryPlanButton item={item} />

						{item.status === 'queued' ? (
							<ActionIcon
								variant="subtle"
								color="red"
								aria-label="Remove from the queue"
								onClick={() => {
									onRemove(item.id)
								}}
							>
								<X size={16} />
							</ActionIcon>
						) : null}
					</Group>
				</Group>

				<Stack gap={6}>
					{item.runs.map((run) => (
						<SliceRunRow key={run.id} run={run} activity={activity[run.id]} />
					))}
				</Stack>
			</Stack>
		</Card>
	)
}
