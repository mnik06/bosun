import { isHistoryPlan, PlanSearchableList } from '~/entities/plan'

export function PlanList () {
	return (
		<PlanSearchableList
			filter={(entry) => !isHistoryPlan(entry)}
			emptyMessage="No active plans."
			noMatchMessage="No active plans match that search."
		/>
	)
}
