import { Button, Group, SegmentedControl } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { NewPlanModal } from '~/features/create-plan'
import { Page } from '~/shared/ui'
import { PlanBoard } from '~/widgets/plan-board'
import { PlanHistory } from '~/widgets/plan-history'
import { PlanList } from '~/widgets/plan-list'
import { PlanProposals } from '~/widgets/plan-proposals'

type PlansView = 'board' | 'list' | 'history'

export default function PlansPage () {
	const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false)
	const [view, setView] = useState<PlansView>('board')

	return (
		<Page
			title="Plans"
			size="xl"
			actions={
				<Group gap="xs">
					<SegmentedControl
						size="xs"
						value={view}
						data={[
							{ value: 'board', label: 'Board' },
							{ value: 'list', label: 'List' },
							{ value: 'history', label: 'History' }
						]}
						onChange={(value) => {
							setView(value === 'list' || value === 'history' ? value : 'board')
						}}
					/>
					<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={openCreate}>
						New plan
					</Button>
				</Group>
			}
		>
			<PlanProposals />

			{view === 'board' ? <PlanBoard /> : null}
			{view === 'list' ? <PlanList /> : null}
			{view === 'history' ? <PlanHistory /> : null}

			<NewPlanModal opened={creating} onClose={closeCreate} />
		</Page>
	)
}
