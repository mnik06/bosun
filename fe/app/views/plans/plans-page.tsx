import { Button, Container, Group, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import { NewPlanModal } from '~/features/create-plan'
import { PlansList } from '~/widgets/plans-list'

export default function PlansPage () {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<Container size="md" py="xl">
			<Stack gap="lg">
				<Group justify="space-between">
					<Title order={2}>Plans</Title>
					<Button onClick={open}>New plan</Button>
				</Group>

				<PlansList />
			</Stack>

			<NewPlanModal opened={opened} onClose={close} />
		</Container>
	)
}
