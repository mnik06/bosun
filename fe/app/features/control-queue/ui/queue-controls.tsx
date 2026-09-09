import { Button, Group } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Pause, Play } from 'lucide-react'

import type { Queue } from '~/entities/queue'
import { useControlQueue } from '~/features/control-queue/api/use-control-queue'

const RESUMABLE = new Set(['paused'])
const PAUSABLE = new Set(['idle', 'running', 'blocked'])

export function QueueControls ({
	queue,
	// Whether a bullet is actually in flight. Only the queue page knows that — the
	// list has the queue row and not its runs — so leaving it out means "unknown",
	// and unknown asks.
	running
}: {
	queue: Queue,
	running?: boolean
}) {
	const control = useControlQueue({ queueId: queue.id, machineId: queue.machineId })

	// Pausing mid-bullet throws that attempt away, so it asks. Only a caller that
	// has looked at the runs may skip the question, and it skips it by saying so.
	const pause = () => {
		if (running === false) {
			control.mutate('pause')

			return
		}

		modals.openConfirmModal({
			title: `Pause ${queue.name}?`,
			centered: true,
			labels: { confirm: 'Pause the queue', cancel: 'Let it carry on' },
			confirmProps: { color: 'yellow' },
			children:
				running === true
					? 'The bullet running now is killed where it stands. Resuming runs that same bullet again from its last commit — what this attempt had written and not committed is discarded.'
					: 'A bullet in flight is killed where it stands. Resuming runs that same bullet again from its last commit — what the killed attempt had written and not committed is discarded.',
			onConfirm: () => {
				control.mutate('pause')
			}
		})
	}

	if (queue.status === 'provisioning') {
		return null
	}

	return (
		<Group gap="xs" wrap="nowrap">
			{PAUSABLE.has(queue.status) ? (
				<Button
					variant="light"
					size="xs"
					leftSection={<Pause size={14} />}
					loading={control.isPending}
					onClick={pause}
				>
					Pause
				</Button>
			) : null}

			{RESUMABLE.has(queue.status) ? (
				<Button
					variant="light"
					size="xs"
					leftSection={<Play size={14} />}
					loading={control.isPending}
					onClick={() => {
						control.mutate('resume')
					}}
				>
					Resume
				</Button>
			) : null}
		</Group>
	)
}
