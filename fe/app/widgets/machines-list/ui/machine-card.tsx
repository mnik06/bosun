import { Card, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { MachineStatusDot, type Machine } from '~/entities/machine'
import { formatRelativeTime } from '~/shared/lib'

export function MachineCard ({ machine, badge }: { machine: Machine, badge?: ReactNode }) {
	return (
		<Card withBorder padding="md" radius="md" component={Link} to={`/machines/${machine.id}`}>
			<Group justify="space-between" gap="sm">
				<Group gap="sm" wrap="nowrap" className="min-w-0">
					<MachineStatusDot status={machine.status} />
					<Stack gap={2} className="min-w-0">
						<Text fw={600} truncate>
							{machine.name}
						</Text>
						<Text size="xs" c="dimmed" truncate className="font-mono">
							{machine.id}
						</Text>
					</Stack>
				</Group>
				<Stack gap={2} align="end">
					<Group gap="xs">
						{badge}
						<Text size="sm">{machine.status}</Text>
					</Group>
					<Text size="xs" c="dimmed">
						seen {formatRelativeTime(machine.lastSeenAt)}
					</Text>
				</Stack>
			</Group>
		</Card>
	)
}
