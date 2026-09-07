import { Button, Group } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Pause, Play, Square } from 'lucide-react'

import type { Queue } from '~/entities/queue'
import { useControlQueue } from '~/features/control-queue/api/use-control-queue'

const RESUMABLE = new Set(['paused', 'stopped'])
const PAUSABLE = new Set(['idle', 'running'])

export function QueueControls ({ queue }: { queue: Queue }) {
	const control = useControlQueue({ queueId: queue.id, machineId: queue.machineId })

	// Stop is the only one that kills a session mid-edit, so it is the only one
	// that asks. Pause lands between bullets and needs no warning.
	const confirmStop = () => {
		modals.openConfirmModal({
			title: `Stop ${queue.name}?`,
			centered: true,
			labels: { confirm: 'Stop the queue', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			children:
				'The bullet running now is killed where it stands. What it already wrote stays in the worktree, uncommitted, for you to look at.',
			onConfirm: () => {
				control.mutate('stop')
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
					onClick={() => {
						control.mutate('pause')
					}}
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

			{queue.status === 'running' ? (
				<Button
					variant="light"
					color="red"
					size="xs"
					leftSection={<Square size={14} />}
					loading={control.isPending}
					onClick={confirmStop}
				>
					Stop
				</Button>
			) : null}
		</Group>
	)
}
