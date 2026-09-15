import type { PlanListEntry } from '~/entities/plan/model/plan'

export function matchesPlanSearch (entry: PlanListEntry, search: string): boolean {
	const query = search.trim().toLowerCase().replace(/^#/, '')

	if (query === '') {
		return true
	}

	return String(entry.number).startsWith(query) || (entry.title ?? '').toLowerCase().includes(query)
}

export function sortPlansByRecency (entries: PlanListEntry[]): PlanListEntry[] {
	return [...entries].sort((a, b) => (b.build?.finishedAt ?? b.createdAt).localeCompare(a.build?.finishedAt ?? a.createdAt))
}
