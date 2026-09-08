import { Menu, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'

import type { Machine } from '~/entities/machine'
import { useDeleteMachine } from '~/features/delete-machine/api/use-delete-machine'

export function DeleteMenuItem ({ machine }: { machine: Machine }) {
	const navigate = useNavigate()
	const deleteMachine = useDeleteMachine(machine.id)

	// Confirmed, and the dialog says what cannot be undone from here: bosun
	// reaches a machine only through a socket that machine opened, so once the
	// agent has shut itself down nothing in the browser can bring it back.
	const confirm = () => {
		modals.openConfirmModal({
			title: `Delete ${machine.name}?`,
			centered: true,
			labels: { confirm: 'Delete machine', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			children: (
				<Stack gap="sm">
					<Text size="sm">
						This cannot be undone. The agent shuts itself down, disables its service and deletes
						every file bosun put on that machine — its binary, its credentials and its worktrees.
					</Text>
					<Text size="sm">
						Your own checkout and anything already committed and pushed are left alone.
					</Text>
					<Text size="sm" fw={600}>
						Connecting this machine again needs terminal access to that box. It cannot be done
						from here.
					</Text>
				</Stack>
			),
			onConfirm: () => {
				deleteMachine.mutate(undefined, {
					onSuccess: () => {
						void navigate('/')
					}
				})
			}
		})
	}

	return (
		<Menu.Item
			color="red"
			leftSection={<Trash2 size={14} />}
			disabled={deleteMachine.isPending}
			onClick={confirm}
		>
			Delete machine
		</Menu.Item>
	)
}
