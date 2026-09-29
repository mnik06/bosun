import { Alert, Card, Stack, Text } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import { useRepositoriesQuery, useRepositoryConfigQuery } from '~/entities/repository'
import { ConfigEditor } from '~/features/edit-config'
import { AutoResolveSwitch } from '~/features/toggle-auto-resolve'
import { toErrorMessage } from '~/shared/lib'
import { SectionLoader } from '~/shared/ui'

function ConfigPane ({ repositoryId }: { repositoryId: string }) {
	const config = useRepositoryConfigQuery(repositoryId)
	const repositories = useRepositoriesQuery()
	const repository = repositories.data?.find((entry) => entry.id === repositoryId)
	const fullName = repository?.fullName ?? 'this repository'

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

	const initialText = config.data.config ?? ''

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<Stack gap={4}>
					<Text fw={600}>Project config</Text>
					<Text size="xs" c="dimmed">
						Shared by every machine attached to {fullName}.
					</Text>
				</Stack>

				{repository === undefined ? null : <AutoResolveSwitch repository={repository} />}

				<ConfigEditor key={initialText} repositoryId={repositoryId} initialText={initialText} />
			</Stack>
		</Card>
	)
}

export function RepositoryConfig ({ machine }: { machine: Pick<Machine, 'repositoryId'> }) {
	return machine.repositoryId == null ? null : <ConfigPane repositoryId={machine.repositoryId} />
}
