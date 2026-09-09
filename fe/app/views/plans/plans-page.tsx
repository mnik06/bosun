import { Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { ListPlus, Plus } from 'lucide-react'
import { useState } from 'react'

import { usePlansQuery } from '~/entities/plan'
import { NewPlanModal } from '~/features/create-plan'
import { PushToQueueModal } from '~/features/push-to-queue'
import { Page } from '~/shared/ui'
import { PlansList } from '~/widgets/plans-list'

export default function PlansPage () {
	const [opened, { open, close }] = useDisclosure(false)
	const [selected, setSelected] = useState<string[]>([])
	const [pushing, setPushing] = useState(false)
	const { data } = usePlansQuery()

	// Filtered against the list rather than trusted: a plan deleted while it was
	// ticked would otherwise be pushed to a queue as an id with nothing behind it.
	const chosen = (data ?? []).filter((plan) => selected.includes(plan.id))

	return (
		<Page
			title="Plans"
			actions={
				<Group gap="xs">
					{chosen.length === 0 ? null : (
						<Button
							variant="light"
							size="xs"
							leftSection={<ListPlus size={14} />}
							onClick={() => {
								setPushing(true)
							}}
						>
							Push to queue ({chosen.length})
						</Button>
					)}

					<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
						New plan
					</Button>
				</Group>
			}
		>
			<PlansList selected={selected} onSelectedChange={setSelected} />

			<NewPlanModal opened={opened} onClose={close} />

			<PushToQueueModal
				plans={chosen}
				opened={pushing}
				onClose={() => {
					setPushing(false)
					setSelected([])
				}}
			/>
		</Page>
	)
}
