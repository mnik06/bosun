import { Button, Group, SegmentedControl } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { isHistoryPlan, usePlansQuery } from '~/entities/plan'
import { Page } from '~/shared/ui'
import { PlanBoard } from '~/widgets/plan-board'
import { PlanHistory } from '~/widgets/plan-history'
import { PlanList } from '~/widgets/plan-list'
import { PlanProposals } from '~/widgets/plan-proposals'
import { PlansEmptyState } from '~/widgets/plans-empty-state'

type PlansView = 'board' | 'list' | 'history'

export default function PlansPage () {
	const [view, setView] = useState<PlansView>('board')
	const plans = usePlansQuery()
	// Only once the list has loaded: a loading or failed list is the views' to render.
	const activeCount = plans.data?.filter((entry) => !isHistoryPlan(entry)).length ?? null
	const showEmpty = view !== 'history' && activeCount === 0

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
					<Button component={Link} to="/plans/new" variant="light" size="xs" leftSection={<Plus size={14} />}>
						New plan
					</Button>
				</Group>
			}
		>
			<PlanProposals />

			{showEmpty ? (
				<PlansEmptyState
					hasHistory={(plans.data?.length ?? 0) > 0}
					onShowHistory={() => {
						setView('history')
					}}
				/>
			) : null}

			{!showEmpty && view === 'board' ? <PlanBoard /> : null}
			{!showEmpty && view === 'list' ? <PlanList /> : null}
			{view === 'history' ? <PlanHistory /> : null}
		</Page>
	)
}
