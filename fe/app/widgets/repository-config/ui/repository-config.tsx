import { Alert, Badge, Card, Center, Code, Group, Loader, Stack, Text } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import {
	useMachineOnboardingQuery,
	useRepositoriesQuery,
	useRepositoryConfigQuery,
	type RepositoryConfig as Config
} from '~/entities/repository'
import { ConfigDraftEditor } from '~/features/edit-config-draft'
import { OpenPullRequestButton } from '~/features/open-onboarding-pr'
import { AutoResolveSwitch } from '~/features/toggle-auto-resolve'
import { toErrorMessage } from '~/shared/lib'

function ConfigHeader ({ config, fullName }: { config: Config, fullName: string }) {
	const differs = config.file !== null && config.draft !== null && config.draft !== config.file

	return (
		<Stack gap={4}>
			<Group gap="sm">
				<Text fw={600} className="font-mono">
					.bosun/project.yaml
				</Text>
				{differs ? (
					<Badge color="yellow" variant="light" tt="none">
						differs from {config.defaultBranch}
					</Badge>
				) : null}
			</Group>

			{config.file === null ? (
				<Text size="sm" c="dimmed">
					No <Code>.bosun/project.yaml</Code> on {config.defaultBranch} yet — sessions on every machine of{' '}
					{fullName} use this draft.
				</Text>
			) : (
				<Text size="sm" c="dimmed">
					Sessions use <Code>.bosun/project.yaml</Code> on {config.defaultBranch}. Saving here proposes a
					change — open a pull request to land it.
				</Text>
			)}

			<Text size="xs" c="dimmed">
				Shared by every machine attached to {fullName}.
			</Text>
		</Stack>
	)
}

function ConfigPane ({ machineId, repositoryId }: { machineId: string, repositoryId: string }) {
	const config = useRepositoryConfigQuery(repositoryId)
	const repositories = useRepositoriesQuery()
	const onboarding = useMachineOnboardingQuery({ machineId, enabled: true })
	const repository = repositories.data?.find((entry) => entry.id === repositoryId)
	const fullName = repository?.fullName ?? 'this repository'

	if (config.isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (config.isError) {
		return (
			<Alert color="red" title="Could not load the config">
				{toErrorMessage(config.error, 'Unknown error')}
			</Alert>
		)
	}

	const initialYaml = config.data.draft ?? config.data.file ?? ''

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<ConfigHeader config={config.data} fullName={fullName} />

				{repository === undefined ? null : <AutoResolveSwitch repository={repository} />}

				<ConfigDraftEditor
					key={initialYaml}
					repositoryId={repositoryId}
					initialYaml={initialYaml}
					actions={
						onboarding.data?.run.status === 'ready' ? <OpenPullRequestButton repositoryId={repositoryId} /> : null
					}
				/>
			</Stack>
		</Card>
	)
}

export function RepositoryConfig ({ machine }: { machine: Pick<Machine, 'id' | 'repositoryId'> }) {
	return machine.repositoryId == null ? null : (
		<ConfigPane machineId={machine.id} repositoryId={machine.repositoryId} />
	)
}
