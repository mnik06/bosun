import { Alert, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'

import { MachineStatusDot, PreflightChecklist, useMachineQuery } from '~/entities/machine'
import { PausedBanner } from '~/features/pause-machine'
import { useRefreshMachine } from '~/features/refresh-machine'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'
import { MachineActions } from '~/widgets/machine-detail/ui/machine-actions'

export function MachineDetail ({ machineId }: { machineId: string }) {
	const { data, isPending, error } = useMachineQuery(machineId)
	// The agent stamps lastSeenAt on every push, so a change to it is the signal
	// that its answer to the refresh has landed.
	const refresh = useRefreshMachine({ machineId, settleKey: data?.lastSeenAt ?? null })

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

				<MachineActions
					machine={data}
					onRefresh={refresh.refresh}
					isRefreshing={refresh.isRefreshing}
				/>
			</Group>

			<PausedBanner machine={data} />

			<Card withBorder padding="md" radius="md">
				<Stack gap="sm">
					<Group gap="xs">
						<Text fw={600}>Preflight</Text>
						{refresh.isRefreshing ? (
							<Group gap={6}>
								<Loader size={14} />
								<Text size="xs" c="dimmed">
									refreshing on the machine…
								</Text>
							</Group>
						) : null}
					</Group>
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
