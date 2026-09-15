import { PlanSearchableList } from '~/entities/plan'

export function PlanList () {
	return <PlanSearchableList emptyMessage="No plans yet." noMatchMessage="No plans match that search." />
}
