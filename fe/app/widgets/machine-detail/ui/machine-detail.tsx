import { Alert, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'

import { MachineStatusDot, PreflightChecklist, useMachineQuery } from '~/entities/machine'
import { PingButton } from '~/features/ping-machine'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'

export function MachineDetail ({ machineId }: { machineId: string }) {
	const { data, isPending, error } = useMachineQuery(machineId)

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load machine">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	return (
		<Stack gap="lg">
			<Group justify="space-between" align="start">
				<Stack gap={4}>
					<Group gap="sm">
						<MachineStatusDot status={data.status} />
						<Title order={2}>{data.name}</Title>
					</Group>
					<Text size="xs" c="dimmed" className="font-mono">
						{data.id} · seen {formatRelativeTime(data.lastSeenAt)}
						{data.agentVersion === null ? '' : ` · agent ${data.agentVersion}`}
					</Text>
				</Stack>

				<PingButton machineId={data.id} />
			</Group>

			<Card withBorder padding="md" radius="md">
				<Stack gap="sm">
					<Text fw={600}>Preflight</Text>
					<PreflightChecklist checks={data.capabilities} />
				</Stack>
			</Card>

			{data.repoPath === null ? null : (
				<Text size="sm" c="dimmed" className="font-mono">
					{data.repoPath}
				</Text>
			)}
		</Stack>
	)
}
