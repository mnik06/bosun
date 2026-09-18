import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { BugfixMessageSchema, PlanBugSchema, type BugfixMessage, type PlanBug } from '~/entities/plan/model/bugfix'
import { apiClient, getActiveProjectId } from '~/shared/api'

// Every key carries the active project, on the same terms as every other query
// key in this slice: without it a project switch shows the previous project's
// rows out of cache until the refetch lands.
export const bugfixKeys = {
	all: () => ['bugfix', getActiveProjectId()] as const,
	messages: (planId: string) => [...bugfixKeys.all(), 'messages', planId] as const,
	bugs: (planId: string) => [...bugfixKeys.all(), 'bugs', planId] as const
}

export async function fetchBugfixMessages (planId: string): Promise<BugfixMessage[]> {
	const { data } = await apiClient.get<unknown>(`/plans/${planId}/bugfix/messages`)

	return z.array(BugfixMessageSchema).parse(data)
}

export async function fetchPlanBugs (planId: string): Promise<PlanBug[]> {
	const { data } = await apiClient.get<unknown>(`/plans/${planId}/bugs`)

	return z.array(PlanBugSchema).parse(data)
}

export function useBugfixMessagesQuery (planId: string) {
	return useQuery({
		queryKey: bugfixKeys.messages(planId),
		queryFn: async () => fetchBugfixMessages(planId)
	})
}

export function usePlanBugsQuery (planId: string) {
	return useQuery({
		queryKey: bugfixKeys.bugs(planId),
		queryFn: async () => fetchPlanBugs(planId)
	})
}
