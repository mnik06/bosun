import { Menu, Stack, Text } from '@mantine/core'
import { Trash2 } from 'lucide-react'

import type { GithubPatConnection } from '~/entities/repository'
import { useDisconnectGithubPatConnection } from '~/features/connect-github-pat/api/use-connect-github-pat'
import { confirmAction } from '~/shared/lib'

export function DisconnectGithubPatMenuItem ({ connection }: { connection: GithubPatConnection }) {
	const disconnect = useDisconnectGithubPatConnection()

	const confirm = () => {
		confirmAction({
			title: `Disconnect ${connection.githubLogin}'s token?`,
			confirmLabel: 'Disconnect',
			color: 'red',
			body: (
				<Stack gap="sm">
					<Text size="sm">This deletes the stored token and any webhook bosun created for its repositories.</Text>
					<Text size="sm" fw={600}>
						Every repository attached through this token is deleted too, along with its build and
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
