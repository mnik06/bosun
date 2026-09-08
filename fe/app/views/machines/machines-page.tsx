import { Button } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useDisclosure } from '@mantine/hooks'

import { AddMachineModal } from '~/features/add-machine'
import { Page } from '~/shared/ui'
import { MachinesList } from '~/widgets/machines-list'

export default function MachinesPage () {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<Page title="Machines" actions={
			<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
					Add machine
			</Button>
		}>
			<MachinesList />

			<AddMachineModal opened={opened} onClose={close} />
		</Page>
	)
}
