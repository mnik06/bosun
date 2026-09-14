import { Alert, Badge, Card, Center, Group, Loader, Stack, Text } from '@mantine/core'

import { useMachinesQuery } from '~/entities/machine'
import { useGithubInstallationsQuery, useRepositoriesQuery } from '~/entities/repository'
import { AddRepositoryForm } from '~/features/add-repository'
import { ConnectGithubButton } from '~/features/connect-github'
import { toErrorMessage } from '~/shared/lib'
import { RepositoryCard } from '~/widgets/repositories-panel/ui/repository-card'

function Installations () {
	const installations = useGithubInstallationsQuery()
	const connected = installations.data ?? []

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="center" gap="sm">
					<Stack gap={2} className="min-w-0">
						<Text fw={600}>GitHub</Text>
						<Text size="sm" c="dimmed">
							Machines clone and push with an hour-long token for one repository, and pull requests are
							opened through the App. No GitHub credential is kept on a machine.
						</Text>
					</Stack>
					<ConnectGithubButton label={connected.length === 0 ? 'Connect GitHub' : 'Connect another account'} />
				</Group>

				{installations.error === null ? null : (
					<Alert color="red" variant="light" title="Could not load installations">
						{toErrorMessage(installations.error, 'Unknown error')}
					</Alert>
				)}

				{connected.length === 0 ? null : (
					<Group gap="xs">
						{connected.map((installation) => (
							<Badge key={installation.id} variant="default" tt="none">
								{installation.accountLogin}
							</Badge>
						))}
					</Group>
				)}

				<AddRepositoryForm enabled={connected.length > 0} />
			</Stack>
		</Card>
	)
}

export function RepositoriesPanel () {
	const repositories = useRepositoriesQuery()
	const machines = useMachinesQuery()

	return (
		<Stack gap="md">
			<Installations />

			{repositories.isPending ? (
				<Center py="xl">
					<Loader />
				</Center>
			) : null}

			{repositories.error === null ? null : (
				<Alert color="red" title="Could not load repositories">
					{toErrorMessage(repositories.error, 'Unknown error')}
				</Alert>
			)}

			{(repositories.data ?? []).map((repository) => (
				<RepositoryCard key={repository.id} repository={repository} machines={machines.data ?? []} />
			))}
		</Stack>
	)
}
