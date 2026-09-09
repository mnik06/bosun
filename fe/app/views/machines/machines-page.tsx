import { Button } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useDisclosure } from '@mantine/hooks'

import { useActiveProject } from '~/entities/project'
import { AddMachineModal } from '~/features/add-machine'
import { Page } from '~/shared/ui'
import { MachinesList } from '~/widgets/machines-list'

export default function MachinesPage () {
	const [opened, { open, close }] = useDisclosure(false)
	const { isLeader } = useActiveProject()

	// Hidden here and refused by the API: a hidden button is not a permission.
	return (
		<Page title="Machines" actions={
			isLeader ? (
				<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
					Add machine
				</Button>
			) : null
		}>
			<MachinesList />

			<AddMachineModal opened={opened} onClose={close} />
		</Page>
	)
}
