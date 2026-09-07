import type { QueryClient } from '@tanstack/react-query'

import { planKeys } from '~/entities/plan/api/plan.queries'
import type { Ac, Plan, PlanDetail, PlanMessage, Slice } from '~/entities/plan/model/plan'

export function patchPlan (queryClient: QueryClient, plan: Plan): void {
	queryClient.setQueryData<PlanDetail>(planKeys.detail(plan.id), (previous) =>
		previous === undefined ? previous : { ...previous, plan }
	)
	queryClient.setQueryData<Plan[]>(planKeys.list(), (previous) =>
		previous?.some((entry) => entry.id === plan.id)
			? previous.map((entry) => (entry.id === plan.id ? plan : entry))
			: [plan, ...(previous ?? [])]
	)
}

export function dropPlan (queryClient: QueryClient, planId: string): void {
	queryClient.removeQueries({ queryKey: planKeys.detail(planId) })
	queryClient.setQueryData<Plan[]>(planKeys.list(), (previous) =>
		previous?.filter((entry) => entry.id !== planId)
	)
}

// Appended by id rather than blindly, because the same message arrives both on
// the push and in the refetch a reconnect triggers.
export function appendPlanMessage (opts: {
	queryClient: QueryClient
	planId: string
	message: PlanMessage
}): void {
	opts.queryClient.setQueryData<PlanDetail>(planKeys.detail(opts.planId), (previous) => {
		if (previous === undefined || previous.messages.some((entry) => entry.id === opts.message.id)) {
			return previous
		}

		return { ...previous, messages: [...previous.messages, opts.message] }
	})
}

export function patchPlanArtifact (opts: {
	queryClient: QueryClient
	planId: string
	acs: Ac[]
	slices: Slice[]
}): void {
	opts.queryClient.setQueryData<PlanDetail>(planKeys.detail(opts.planId), (previous) =>
		previous === undefined ? previous : { ...previous, acs: opts.acs, slices: opts.slices }
	)
}
