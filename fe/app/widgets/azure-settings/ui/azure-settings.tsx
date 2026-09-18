import { Group } from '@mantine/core'

import { useAzureConnectionsQuery } from '~/entities/repository'
import { AzureConnectionBadge, ConnectAzureButton } from '~/features/connect-azure'
import { SettingsCard } from '~/shared/ui'

export function AzureSettings () {
	const connections = useAzureConnectionsQuery()
	const connected = connections.data ?? []

	return (
		<SettingsCard
			title="Azure DevOps"
			description={
				<>
					A leader connects an organization with a personal access token. Machines attached to a
					repository from it receive that token directly — unlike GitHub&apos;s hour-long tokens, it
					is long-lived, so scope and expiry it carefully.
				</>
			}
			actions={<ConnectAzureButton />}
			error={connections.error}
			loading={connections.isPending}
			isEmpty={connected.length === 0}
		>
			<Group gap="xs">
				{connected.map((connection) => (
					<AzureConnectionBadge key={connection.id} connection={connection} />
				))}
			</Group>
		</SettingsCard>
	)
}
