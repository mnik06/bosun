import { Alert, Badge, Card, Group, Stack, Text } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import {
	useMachineOnboardingQuery,
	useRepositoriesQuery,
	useRepositoryConfigQuery,
	type OnboardingRun
} from '~/entities/repository'
import { InstructionsEditor } from '~/features/edit-instructions'
import { GenerateConfigButton } from '~/features/start-onboarding'
import { toErrorMessage } from '~/shared/lib'
import { SectionLoader } from '~/shared/ui'

type ConfigMachine = Pick<Machine, 'id' | 'status' | 'repositoryId' | 'clonedRepositoryId' | 'capabilities'>

function ConfigRunStatus ({ run }: { run: OnboardingRun | null }) {
	if (run?.status === 'discovering') {
		return (
			<Alert color="blue" title="Generating the config">
				{run.steps.at(-1)?.label ?? 'Reading the repository'} — the instructions are rewritten once it finishes.
			</Alert>
		)
	}

	if (run?.status === 'failed') {
		return (
			<Alert color="red" title="Could not generate the config">
				{run.failureReason ?? 'Unknown error'}
			</Alert>
		)
	}

	return null
}

function ConfigPane ({ machine, repositoryId }: { machine: ConfigMachine, repositoryId: string }) {
	const config = useRepositoryConfigQuery(repositoryId)
	const repositories = useRepositoriesQuery()
	const onboarding = useMachineOnboardingQuery({ machineId: machine.id, enabled: true })
	const repository = repositories.data?.find((entry) => entry.id === repositoryId)
	const fullName = repository?.fullName ?? 'this repository'
	const configRun = onboarding.data?.configRun ?? null

	if (config.isPending) {
		return <SectionLoader />
	}

	if (config.isError) {
		return (
			<Alert color="red" title="Could not load the config">
				{toErrorMessage(config.error, 'Unknown error')}
			</Alert>
		)
	}

	const instructions = config.data.instructions ?? ''

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
					<Stack gap={4}>
						<Group gap="xs">
							<Text fw={600}>Project instructions</Text>
							{config.data.stale ? (
								<Badge size="sm" variant="light" color="yellow">
									Out of date
								</Badge>
							) : null}
						</Group>
						<Text size="xs" c="dimmed">
							Shared by every machine attached to {fullName}. Generating the config rewrites them from what bosun found.
						</Text>
					</Stack>
					<GenerateConfigButton
						machine={machine}
						hasConfig={config.data.config !== null}
						running={configRun?.status === 'discovering'}
					/>
				</Group>

				<ConfigRunStatus run={configRun} />

				<InstructionsEditor key={instructions} repositoryId={repositoryId} initialText={instructions} />

			</Stack>
		</Card>
	)
}

export function RepositoryConfig ({ machine }: { machine: ConfigMachine }) {
	return machine.repositoryId == null ? null : <ConfigPane machine={machine} repositoryId={machine.repositoryId} />
}
