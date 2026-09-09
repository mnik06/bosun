import { Alert, Button, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'

import type { Plan } from '~/entities/plan'
import { useMachineQueuesQuery } from '~/entities/queue'
import { useEnqueuePlans } from '~/features/enqueue-plans'
import { AppModal } from '~/shared/ui'

function QueuePicker ({
	machineId,
	plans,
	onDone
}: {
	machineId: string,
	plans: Plan[],
	onDone: () => void
}) {
	const { data, isPending } = useMachineQueuesQuery(machineId)
	const [queueId, setQueueId] = useState<string | null>(null)
	const enqueue = useEnqueuePlans(queueId ?? '')

	const usable = (data ?? []).filter((queue) => queue.status !== 'provisioning')

	if (!isPending && usable.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				That machine has no queue with a worktree yet. Create one on the machine page first.
			</Text>
		)
	}

	return (
		<Stack gap="md">
			<Select
				label="Queue"
				placeholder={isPending ? 'Loading…' : 'Pick a queue'}
				data={usable.map((queue) => ({
					value: queue.id,
					label: queue.afk ? `${queue.name} (AFK)` : queue.name
				}))}
				value={queueId}
				onChange={setQueueId}
			/>

			<Text size="xs" c="dimmed">
				{plans.length} plan{plans.length === 1 ? '' : 's'} go on the end, in the order shown. Each
				runs on a branch of its own, cut fresh — so one failing does not land in the next
				one&apos;s pull request.
			</Text>

			<Button
				loading={enqueue.isPending}
				disabled={queueId === null}
				onClick={() => {
					enqueue.mutate(
						plans.map((plan) => plan.id),
						{ onSuccess: onDone }
					)
				}}
			>
				Push to queue
			</Button>
		</Stack>
	)
}

export function PushToQueueModal ({
	plans,
	opened,
	onClose
}: {
	plans: Plan[],
	opened: boolean,
	onClose: () => void
}) {
	// A queue is a worktree of one machine's repository, so a selection spanning
	// two machines has no single queue it could go to.
	const machineIds = [...new Set(plans.map((plan) => plan.machineId))]

	return (
		<AppModal opened={opened} onClose={onClose} title="Push to a queue" centered>
			<Body machineIds={machineIds} plans={plans} onDone={onClose} />
		</AppModal>
	)
}

function Body ({
	machineIds,
	plans,
	onDone
}: {
	machineIds: string[],
	plans: Plan[],
	onDone: () => void
}) {
	if (machineIds.length > 1) {
		return (
			<Alert color="yellow" variant="light" title="Those plans are on different machines">
				<Text size="sm">
					A queue runs in a worktree of one machine. Select plans from a single machine and push
					them together.
				</Text>
			</Alert>
		)
	}

	const machineId = machineIds[0]

	if (machineId === undefined) {
		return (
			<Text size="sm" c="dimmed">
				Nothing selected.
			</Text>
		)
	}

	return <QueuePicker machineId={machineId} plans={plans} onDone={onDone} />
}
