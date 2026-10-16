import { Alert, Anchor, Badge, Card, Code, Collapse, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

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
				{run.steps.at(-1)?.label ?? 'Reading the repository'} — what bosun understood refreshes once the new config is published.
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

// Collapsed: the compiled config is bosun's, read to check it, never edited.
function CompiledConfig ({ config, stale }: { config: string | null, stale: boolean }) {
	const [opened, { toggle }] = useDisclosure(false)

	return (
		<Stack gap={6}>
			<Group gap="xs">
				<Anchor component="button" type="button" size="sm" onClick={toggle}>
					What bosun understood — {opened ? 'hide' : 'show'}
				</Anchor>
				{stale ? (
					<Badge size="sm" variant="light" color="yellow">
						Out of date
					</Badge>
				) : null}
			</Group>
			<Collapse expanded={opened}>
				{config === null ? (
					<Text size="sm" c="dimmed">
						None yet.
					</Text>
				) : (
					<Code block className="text-xs whitespace-pre-wrap break-words">
						{config}
					</Code>
				)}
			</Collapse>
		</Stack>
	)
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
						<Text fw={600}>Project instructions</Text>
						<Text size="xs" c="dimmed">
							Shared by every machine attached to {fullName}. Bosun compiles its config from them.
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

				<CompiledConfig config={config.data.config} stale={config.data.stale} />
			</Stack>
		</Card>
	)
}

export function RepositoryConfig ({ machine }: { machine: ConfigMachine }) {
	return machine.repositoryId == null ? null : <ConfigPane machine={machine} repositoryId={machine.repositoryId} />
}
