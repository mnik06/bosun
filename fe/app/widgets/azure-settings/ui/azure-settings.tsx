import { Alert, Card, Group, Loader, Stack, Text } from '@mantine/core'

import { useAzureConnectionsQuery } from '~/entities/repository'
import { AzureConnectionBadge, ConnectAzureButton } from '~/features/connect-azure'
import { toErrorMessage } from '~/shared/lib'

export function AzureSettings () {
	const connections = useAzureConnectionsQuery()
	const connected = connections.data ?? []

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="center" gap="sm">
					<Stack gap={2} className="min-w-0">
						<Text fw={600}>Azure DevOps</Text>
						<Text size="sm" c="dimmed">
							A leader connects an organization with a personal access token. Machines attached to a
							repository from it receive that token directly — unlike GitHub&apos;s hour-long tokens, it
							is long-lived, so scope and expiry it carefully.
						</Text>
					</Stack>
					<ConnectAzureButton />
				</Group>

				{connections.error === null ? null : (
					<Alert color="red" variant="light" title="Could not load connections">
						{toErrorMessage(connections.error, 'Unknown error')}
					</Alert>
				)}

				{connections.isPending ? <Loader size="sm" /> : null}

				{connected.length === 0 ? null : (
					<Group gap="xs">
						{connected.map((connection) => (
							<AzureConnectionBadge key={connection.id} connection={connection} />
						))}
					</Group>
				)}
			</Stack>
		</Card>
	)
}
