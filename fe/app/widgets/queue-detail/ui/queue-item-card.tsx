import { ActionIcon, Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { ExternalLink, X } from 'lucide-react'

import { planLabel } from '~/entities/plan'
import { itemElapsedMs, type QueueItemDetail, type QueueItemStatus } from '~/entities/queue'
import { RetryPlanButton } from '~/features/retry-plan'
import { formatDuration } from '~/shared/lib'
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
	now,
	onRemove
}: {
	item: QueueItemDetail,
	activity: Record<string, string>,
	now: number,
	onRemove: (itemId: string) => void
}) {
	const elapsed = itemElapsedMs({ item, now })
	const waiting = item.waitingFor ?? []

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="start" gap="sm">
					<Stack gap={2} className="min-w-0 grow">
						<Group gap="xs">
							<Text fw={600} truncate>
								{item.planTitle ?? 'Untitled plan'}
							</Text>
							<Badge size="sm" variant="light" color={COLORS[item.status]}>
								{item.status}
							</Badge>
							{elapsed === null ? null : (
								<Text size="xs" c="dimmed">
									{formatDuration(elapsed)}
								</Text>
							)}
						</Group>

						{item.branch === null ? null : (
							<Text size="xs" c="dimmed" className="font-mono break-all">
								{item.branch}
							</Text>
						)}

						{item.failureReason === null ? null : (
							<Text size="xs" c="red">
								{item.failureReason}
							</Text>
						)}

						{waiting.length === 0 ? null : (
							<Text size="xs" c="orange">
								Waiting for {waiting.map(planLabel).join(', ')}
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

					<Group gap="xs" wrap="nowrap" className="shrink-0">
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
						<SliceRunRow key={run.id} run={run} activity={activity[run.id] ?? run.activity} />
					))}
				</Stack>
			</Stack>
		</Card>
	)
}
