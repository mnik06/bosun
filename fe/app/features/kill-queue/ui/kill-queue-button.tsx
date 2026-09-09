import { Button, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Skull } from 'lucide-react'
import { useNavigate } from 'react-router'

import type { Queue } from '~/entities/queue'
import { useKillQueue } from '~/features/kill-queue/api/use-kill-queue'

// The end of a queue, and the only one: there is no stopped state to come back
// from. Everything it says here is irreversible, so it says all of it.
export function KillQueueButton ({ queue, goHome = false }: { queue: Queue, goHome?: boolean }) {
	const navigate = useNavigate()
	const kill = useKillQueue(queue.id)

	const confirm = () => {
		modals.openConfirmModal({
			title: `Kill ${queue.name}?`,
			centered: true,
			labels: { confirm: 'Kill the queue', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			children: (
				<Stack gap="sm">
					<Text size="sm">
						The bullet running now is killed where it stands. The worktree is removed from the
						machine, along with anything uncommitted in it and every local branch this queue cut.
					</Text>
					<Text size="sm">
						The queue, its plans&apos; place in it and its history go with it. It cannot be
						resumed and it cannot be undone.
					</Text>
					<Text size="sm" c="dimmed">
						Anything already pushed is left alone — those branches and their pull requests stay
						on the remote.
					</Text>
				</Stack>
			),
			onConfirm: () => {
				kill.mutate(undefined, {
					onSuccess: () => {
						if (goHome) {
							void navigate('/queues')
						}
					}
				})
			}
		})
	}

	return (
		<Button
			variant="light"
			color="red"
			size="xs"
			leftSection={<Skull size={14} />}
			loading={kill.isPending}
			onClick={confirm}
		>
			Kill
		</Button>
	)
}
