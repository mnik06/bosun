import { Alert, Button, Checkbox, Modal, Stack, Text } from '@mantine/core'
import { useState } from 'react'

import { usePlansQuery } from '~/entities/plan'
import type { Queue } from '~/entities/queue'
import { useEnqueuePlans } from '~/features/enqueue-plans/api/use-enqueue-plan'

function PlanPicker ({ queue, onDone }: { queue: Queue, onDone: () => void }) {
	const { data } = usePlansQuery()
	const [selected, setSelected] = useState<string[]>([])
	const enqueue = useEnqueuePlans(queue.id)

	// A queue runs in a worktree of its machine's repository, so a plan written
	// against a different machine has nowhere to run. Filtered rather than shown
	// and refused, which would only ask the user to work out why.
	const eligible = (data ?? []).filter(
		(plan) => plan.machineId === queue.machineId && plan.status === 'ready'
	)

	if (eligible.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				No finished plans for this machine yet. A plan can be queued once its grill is done.
			</Text>
		)
	}

	return (
		<Stack gap="md">
			<Checkbox.Group value={selected} onChange={setSelected}>
				<Stack gap="xs">
					{eligible.map((plan) => (
						<Checkbox key={plan.id} value={plan.id} label={plan.title ?? 'Untitled'} />
					))}
				</Stack>
			</Checkbox.Group>

			<Text size="xs" c="dimmed">
				They run in the order you see here, one after another. Adding to a queue that is already
				running is fine — they go on the end.
			</Text>

			<Button
				loading={enqueue.isPending}
				disabled={selected.length === 0}
				onClick={() => {
					enqueue.mutate(selected, { onSuccess: onDone })
				}}
			>
				Add {selected.length === 0 ? '' : selected.length} to {queue.name}
			</Button>
		</Stack>
	)
}

export function EnqueuePlansModal ({
	queue,
	opened,
	onClose
}: {
	queue: Queue,
	opened: boolean,
	onClose: () => void
}) {
	return (
		<Modal opened={opened} onClose={onClose} title={`Add plans to ${queue.name}`} centered>
			<Stack gap="md">
				<PlanPicker queue={queue} onDone={onClose} />

				{queue.afk ? (
					<Alert color="yellow" variant="light" title="This queue is AFK">
						<Text size="sm">
							Sessions here decide alone and never stop to ask. Turn AFK off if you want to be
							consulted.
						</Text>
					</Alert>
				) : null}
			</Stack>
		</Modal>
	)
}
