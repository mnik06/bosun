import { Button } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useDisclosure } from '@mantine/hooks'

import { AddMachineModal } from '~/features/add-machine'
import { Page } from '~/shared/ui'
import { MachinesList } from '~/widgets/machines-list'
import { SetupProgressBadge } from '~/widgets/setup-checklist'

export default function MachinesPage () {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<Page title="Machines" actions={
			<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
				Add machine
			</Button>
		}>
			<MachinesList renderBadge={(machine) => <SetupProgressBadge machine={machine} />} />

			<AddMachineModal opened={opened} onClose={close} />
		</Page>
	)
}
