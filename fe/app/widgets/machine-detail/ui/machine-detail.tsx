import { Alert, Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { Download } from 'lucide-react'
import type { ReactNode } from 'react'

import {
	machineKind,
	MachineStatusDot,
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
import { MachineTabs } from '~/widgets/machine-detail/ui/machine-tabs'
import { ProjectSetupCard } from '~/widgets/machine-detail/ui/project-setup-card'
import { SetupCard } from '~/widgets/machine-detail/ui/setup-card'

// Waiting is not a refusal, and a version this machine rolled back is not the
// same as one it simply cannot take.
function declineTone (decline: UpgradeDecline): string {
	if (decline.queued) {
		return 'blue'
	}

	return decline.retryable ? 'yellow' : 'gray'
}

function UpgradeNotices ({
	decline,
	upgradingTo,
	isRefreshing,
	onRetry
}: {
	decline: UpgradeDecline | null,
	upgradingTo: string | null,
	isRefreshing: boolean,
	onRetry: () => void
}) {
	return (
		<>
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
							<Button size="xs" variant="light" loading={isRefreshing} onClick={onRetry}>
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
		</>
	)
}

export function MachineDetail ({
	machineId,
	renderSetup,
	renderOnboarding,
	renderInputs,
	renderConfig
}: {
	machineId: string,
	// The checklist, onboarding report, inputs and config are widgets of their
	// own, so the page hands them in rather than this widget importing siblings.
	renderSetup?: (machine: Machine) => ReactNode,
	renderOnboarding?: (machine: Machine) => ReactNode,
	renderInputs?: (machine: Machine) => ReactNode,
	renderConfig?: (machine: Machine) => ReactNode
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
	// A machine enrolled before repositories keeps the page it always had: it has
	// no onboarding to put in a tab.
	const tabbed = kind === 'unattached' || kind === 'repository'

	const setup = (
		<Stack gap="lg">
			{tabbed ? renderSetup?.(data) : null}

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

			{kind === 'legacy' ? <ProjectSetupCard machine={data} /> : null}
		</Stack>
	)

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

			<UpgradeNotices
				decline={decline}
				upgradingTo={upgradingTo}
				isRefreshing={refresh.isRefreshing}
				onRetry={refresh.retryUpgrade}
			/>

			{tabbed ? (
				<MachineTabs
					machine={data}
					setup={setup}
					panes={{ onboarding: renderOnboarding, inputs: renderInputs, config: renderConfig }}
				/>
			) : (
				setup
			)}
		</Stack>
	)
}
