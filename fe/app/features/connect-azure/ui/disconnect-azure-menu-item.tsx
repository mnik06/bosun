import { Menu, Stack, Text } from '@mantine/core'
import { Trash2 } from 'lucide-react'

import type { AzureConnection } from '~/entities/repository'
import { useDisconnectAzureConnection } from '~/features/connect-azure/api/use-connect-azure'
import { confirmAction } from '~/shared/lib'

export function DisconnectAzureMenuItem ({ connection }: { connection: AzureConnection }) {
	const disconnect = useDisconnectAzureConnection()

	const confirm = () => {
		confirmAction({
			title: `Disconnect ${connection.organization}?`,
			confirmLabel: 'Disconnect',
			color: 'red',
			body: (
				<Stack gap="sm">
					<Text size="sm">
						This deletes the stored token and every webhook bosun created for its repositories, both here
						and on Azure DevOps.
					</Text>
					<Text size="sm" fw={600}>
						Every repository from {connection.organization} is deleted too, along with its build and
						onboarding history. A machine attached to one of them falls back to no repository attached.
					</Text>
				</Stack>
			),
			onConfirm: () => {
				disconnect.mutate(connection.id)
			}
		})
	}

	return (
		<Menu.Item color="red" leftSection={<Trash2 size={14} />} disabled={disconnect.isPending} onClick={confirm}>
			Disconnect
		</Menu.Item>
	)
}
