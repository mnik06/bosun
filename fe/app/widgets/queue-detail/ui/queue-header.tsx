import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core'
import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { QueueStatusBadge, type Queue } from '~/entities/queue'
import { QueueControls } from '~/features/control-queue'
import { KillQueueButton } from '~/features/kill-queue'
import { AfkSwitch } from '~/features/toggle-afk'

// Stacked below `sm` rather than left to `Group` to wrap: a queue name fills the
// row on its own, and the four controls need a line of their own on a phone.
export function QueueHeader ({
	queue,
	running,
	subtitle,
	onAddPlans
}: {
	queue: Queue,
	running: boolean,
	subtitle: string,
	onAddPlans: () => void
}) {
	return (
		<div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<Stack gap={4} className="min-w-0 grow">
				<Anchor component={Link} to="/queues" size="sm" className="w-fit">
					← Queues
				</Anchor>

				<Group gap="sm">
					<Title order={2} className="min-w-0 break-words">
						{queue.name}
					</Title>
					<QueueStatusBadge status={queue.status} pausing={running} />
				</Group>

				<Text size="xs" c="dimmed" truncate className="font-mono">
					{subtitle}
				</Text>
			</Stack>

			<Group gap="xs" align="center" className="shrink-0">
				<AfkSwitch queue={queue} />
				<QueueControls queue={queue} running={running} />
				<KillQueueButton queue={queue} goHome />
				<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={onAddPlans}>
					Add plans
				</Button>
			</Group>
		</div>
	)
}
