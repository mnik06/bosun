import { isHistoryPlan, PlanSearchableList } from '~/entities/plan'

export function PlanHistory () {
	return (
		<PlanSearchableList
			filter={isHistoryPlan}
			emptyMessage="Nothing merged or cancelled yet."
			noMatchMessage="Nothing merged or cancelled matches that."
		/>
	)
}
