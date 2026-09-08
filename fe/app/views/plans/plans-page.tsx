import { Button } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useDisclosure } from '@mantine/hooks'

import { NewPlanModal } from '~/features/create-plan'
import { Page } from '~/shared/ui'
import { PlansList } from '~/widgets/plans-list'

export default function PlansPage () {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<Page title="Plans" actions={
			<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
					New plan
			</Button>
		}>
			<PlansList />

			<NewPlanModal opened={opened} onClose={close} />
		</Page>
	)
}
