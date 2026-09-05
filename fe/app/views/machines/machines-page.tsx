import { Button, Container, Group, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import { AddMachineModal } from '~/features/add-machine'
import { MachinesList } from '~/widgets/machines-list'

export default function MachinesPage () {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<Container size="md" py="xl">
			<Stack gap="lg">
				<Group justify="space-between">
					<Title order={2}>Machines</Title>
					<Button onClick={open}>Add machine</Button>
				</Group>

				<MachinesList />
			</Stack>

			<AddMachineModal opened={opened} onClose={close} />
		</Container>
	)
}
