import { Alert, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import { useQueueAnswer, useRunActivity } from '~/entities/machine'
import { QueueStatusBadge, queueElapsedMs, queueKeys, useQueueDetailQuery } from '~/entities/queue'
import { RunQuestionPanel } from '~/features/answer-run'
import { QueueChat } from '~/features/ask-queue'
import { QueueControls } from '~/features/control-queue'
import { EnqueuePlansModal } from '~/features/enqueue-plans'
import { KillQueueButton } from '~/features/kill-queue'
import { AfkSwitch } from '~/features/toggle-afk'
import { apiClient } from '~/shared/api'
import { useNow } from '~/shared/hooks'
import { formatDuration, notifyError, toErrorMessage } from '~/shared/lib'
import { QueueItemCard } from '~/widgets/queue-detail/ui/queue-item-card'

export function QueueDetail ({ queueId }: { queueId: string }) {
	const { data, isPending, error } = useQueueDetailQuery(queueId)
	const activity = useRunActivity()
	const streaming = useQueueAnswer(queueId)
	const queryClient = useQueryClient()
	const now = useNow()
	const [opened, { open, close }] = useDisclosure(false)

	const runningRun = data?.items
		.flatMap((item) => item.runs)
		.find((run) => run.status === 'running')
	// Read off the run rather than out of the socket: the question is a row, so a
	// reload still finds the control that answers it.
	const asking = data?.items
		.flatMap((item) => item.runs)
		.find((run) => run.questionId !== null && run.question !== null)

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load queue">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	const remove = (itemId: string) => {
		apiClient
			.delete(`/queues/${queueId}/items/${itemId}`)
			.then(async () => queryClient.invalidateQueries({ queryKey: queueKeys.all() }))
			.catch((cause: unknown) => {
				notifyError({ title: 'Could not remove that plan', error: cause })
			})
	}

	return (
		<Stack gap="lg">
			<Group justify="space-between" align="start" wrap="nowrap">
				<Stack gap={4} className="min-w-0">
					<Group gap="sm" wrap="nowrap">
						<Title order={2}>{data.queue.name}</Title>
						<QueueStatusBadge
							status={data.queue.status}
							pausing={runningRun !== undefined}
						/>
					</Group>
					<Text size="xs" c="dimmed" truncate className="font-mono">
						{data.queue.worktreePath ?? 'no worktree yet'}
						{data.queue.baseRef === null ? '' : ` · from ${data.queue.baseRef}`}
						{` · ${formatDuration(queueElapsedMs({ items: data.items, now }))} of work`}
					</Text>
				</Stack>

				<Group gap="xs" align="center" wrap="nowrap">
					<AfkSwitch queue={data.queue} />
					<QueueControls queue={data.queue} running={runningRun !== undefined} />
					<KillQueueButton queue={data.queue} goHome />
					<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
						Add plans
					</Button>
				</Group>
			</Group>

			{data.queue.failureReason === null ? null : (
				<Alert color="red" variant="light">
					{data.queue.failureReason}
				</Alert>
			)}

			{asking?.questionId == null || asking.question === null ? null : (
				<RunQuestionPanel
					runId={asking.id}
					questionId={asking.questionId}
					questions={asking.question}
				/>
			)}

			{data.items.length === 0 ? (
				<Card withBorder padding="md" radius="md">
					<Text size="sm" c="dimmed">
						Nothing queued. Add a finished plan and it runs here, bullet by bullet, on a branch of
						its own.
					</Text>
				</Card>
			) : (
				<Stack gap="md">
					{data.items.map((item) => (
						<QueueItemCard
							key={item.id}
							item={item}
							activity={activity}
							now={now}
							onRemove={remove}
						/>
					))}
				</Stack>
			)}

			<QueueChat queueId={queueId} messages={data.messages} streaming={streaming} />

			<EnqueuePlansModal queue={data.queue} opened={opened} onClose={close} />
		</Stack>
	)
}
