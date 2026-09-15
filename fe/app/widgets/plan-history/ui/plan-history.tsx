import { HISTORY_STATES, PlanSearchableList, resolvePlanState } from '~/entities/plan'

export function PlanHistory () {
	return (
		<PlanSearchableList
			filter={(entry) => HISTORY_STATES.includes(resolvePlanState(entry))}
			emptyMessage="Nothing merged, failed or cancelled yet."
			noMatchMessage="Nothing merged, failed or cancelled matches that."
		/>
	)
}
