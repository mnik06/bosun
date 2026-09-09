import { Alert, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { Download } from 'lucide-react'

import {
	MachineStatusDot,
	PreflightChecklist,
	useMachineQuery,
	useUpgradingTo
} from '~/entities/machine'
import { useActiveProject } from '~/entities/project'
import { AddMcpServerButton } from '~/features/add-mcp-server'
import { ProjectProfileButton } from '~/features/edit-project-profile'
import { PausedBanner } from '~/features/pause-machine'
import { RefreshMachineButton, useRefreshMachine } from '~/features/refresh-machine'
import { SetupClaudeButton } from '~/features/setup-claude'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'
import { GitCard } from '~/widgets/machine-detail/ui/git-card'
import { MachineActions } from '~/widgets/machine-detail/ui/machine-actions'
import { SetupCard } from '~/widgets/machine-detail/ui/setup-card'
import { QueuesPanel } from '~/widgets/queues-panel'

export function MachineDetail ({ machineId }: { machineId: string }) {
	const { data, isPending, error } = useMachineQuery(machineId)
	const { isLeader } = useActiveProject()
	const upgradingTo = useUpgradingTo(machineId)
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
						{isLeader ? <RefreshMachineButton
							onRefresh={refresh.refresh}
							isRefreshing={refresh.isRefreshing}
						/> : null}
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

			{upgradingTo === null ? null : (
				<Alert
					color="blue"
					variant="light"
					icon={<Download size={18} />}
					title={`Upgrading the agent to ${upgradingTo}`}
				>
					<Group gap="xs" align="center">
						<Loader size={14} />
						<Text size="sm">
							It downloads the build, verifies it, swaps its own binary and restarts. The machine
							drops offline for a few seconds and comes back on its own — nothing to do here.
						</Text>
					</Group>
				</Alert>
			)}

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

			<SetupCard
				title="Claude"
				description="The CLI and the credential every session on this machine runs on."
				action={<SetupClaudeButton machineName={data.name} />}
			/>

			<GitCard machineName={data.name} />

			<SetupCard
				title="MCP servers"
				description="Extra tools for planning sessions, configured on the machine itself."
				action={<AddMcpServerButton machineName={data.name} />}
			/>

			<SetupCard
				title="Project setup"
				description="What a session cannot work out by reading the repository — migrations, the commands to run it, where the test credentials live."
				action={isLeader ? <ProjectProfileButton machine={data} /> : null}
			/>

			<QueuesPanel machineId={data.id} />
		</Stack>
	)
}
