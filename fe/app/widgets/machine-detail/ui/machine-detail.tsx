import { Alert, Button, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { Download } from 'lucide-react'
import type { ReactNode } from 'react'

import {
	machineKind,
	MachineStatusDot,
	PreflightChecklist,
	useMachineQuery,
	useUpgradeDecline,
	useUpgradingTo,
	type Machine,
	type UpgradeDecline
} from '~/entities/machine'
import { queueRefreshBlock, useMachineQueuesQuery } from '~/entities/queue'
import { AddMcpServerButton } from '~/features/add-mcp-server'
import { PausedBanner } from '~/features/pause-machine'
import { RefreshMachineButton, useRefreshMachine } from '~/features/refresh-machine'
import { SetupClaudeButton } from '~/features/setup-claude'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'
import { GitCard } from '~/widgets/machine-detail/ui/git-card'
import { MachineActions } from '~/widgets/machine-detail/ui/machine-actions'
import { ProjectSetupCard } from '~/widgets/machine-detail/ui/project-setup-card'
import { SetupCard } from '~/widgets/machine-detail/ui/setup-card'
import { QueuesPanel } from '~/widgets/queues-panel'

// Waiting is not a refusal, and a version this machine rolled back is not the
// same as one it simply cannot take.
function declineTone (decline: UpgradeDecline): string {
	if (decline.queued) {
		return 'blue'
	}

	return decline.retryable ? 'yellow' : 'gray'
}

export function MachineDetail ({
	machineId,
	renderSetup
}: {
	machineId: string,
	// The setup checklist and the onboarding report are widgets of their own, so
	// the page hands them in rather than this widget importing a sibling.
	renderSetup?: (machine: Machine) => ReactNode
}) {
	const { data, isPending, error } = useMachineQuery(machineId)
	const upgradingTo = useUpgradingTo(machineId)
	const decline = useUpgradeDecline(machineId)
	// The agent stamps lastSeenAt on every push, so a change to it is the signal
	// that its answer to the refresh has landed.
	const refresh = useRefreshMachine({ machineId, settleKey: data?.lastSeenAt ?? null })
	const queues = useMachineQueuesQuery(machineId)
	const refreshBlockedBy = queueRefreshBlock(queues.data)

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

	const kind = machineKind(data)

	return (
		<Stack gap="lg">
			<Group justify="space-between" align="start" gap="sm" wrap="nowrap">
				<Stack gap={4} className="min-w-0">
					<Group gap="sm">
						<MachineStatusDot status={data.status} />
						<Title order={2} className="min-w-0 break-words">
							{data.name}
						</Title>
						<RefreshMachineButton
							onRefresh={refresh.refresh}
							isRefreshing={refresh.isRefreshing}
							blockedReason={refreshBlockedBy}
						/>
					</Group>
					<Text size="xs" c="dimmed" className="font-mono break-all">
						{data.id} · seen {formatRelativeTime(data.lastSeenAt)}
						{data.agentVersion === null ? '' : ` · agent ${data.agentVersion}`}
					</Text>
				</Stack>

				<MachineActions
					machine={data}
					onRefresh={refresh.refresh}
					isRefreshing={refresh.isRefreshing}
					refreshBlockedBy={refreshBlockedBy}
				/>
			</Group>

			<PausedBanner machine={data} />

			{decline === null ? null : (
				<Alert
					color={declineTone(decline)}
					variant="light"
					title={
						decline.queued
							? `${decline.to} will install when this machine finishes its work`
							: `The agent did not upgrade to ${decline.to}`
					}
				>
					<Stack gap="xs" align="start">
						<Text size="sm">{decline.reason}</Text>
						{decline.retryable ? (
							<Button
								size="xs"
								variant="light"
								loading={refresh.isRefreshing}
								onClick={refresh.retryUpgrade}
							>
								Install {decline.to} anyway
							</Button>
						) : null}
					</Stack>
				</Alert>
			)}

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

			{kind === 'unattached' || kind === 'repository' ? renderSetup?.(data) : null}

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

			<GitCard machine={data} />

			<SetupCard
				title="MCP servers"
				description="Extra tools for planning sessions, configured on the machine itself."
				action={<AddMcpServerButton machineName={data.name} />}
			/>

			<ProjectSetupCard machine={data} />

			<QueuesPanel machineId={data.id} />
		</Stack>
	)
}
