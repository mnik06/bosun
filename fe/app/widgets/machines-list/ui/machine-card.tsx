import { Card, Group, Stack, Text } from '@mantine/core'

import { MachineStatusDot, type Machine } from '~/entities/machine'
import { formatRelativeTime } from '~/shared/lib'

export function MachineCard ({ machine }: { machine: Machine }) {
	return (
		<Card withBorder padding="md" radius="md">
			<Group justify="space-between" wrap="nowrap">
				<Group gap="sm" wrap="nowrap">
					<MachineStatusDot status={machine.status} />
					<Stack gap={2}>
						<Text fw={600}>{machine.name}</Text>
						<Text size="xs" c="dimmed" className="font-mono">
							{machine.id}
						</Text>
					</Stack>
				</Group>
				<Stack gap={2} align="end">
					<Text size="sm">{machine.status}</Text>
					<Text size="xs" c="dimmed">
						seen {formatRelativeTime(machine.lastSeenAt)}
					</Text>
				</Stack>
			</Group>
		</Card>
	)
}
