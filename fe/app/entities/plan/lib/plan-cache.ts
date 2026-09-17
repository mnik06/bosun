import type { QueryClient } from '@tanstack/react-query'

import { lineKeys, needsYouKeys } from '~/entities/plan/api/line.queries'
import { planKeys } from '~/entities/plan/api/plan.queries'
import type {
	Ac,
	Plan,
	PlanDetail,
	PlanListEntry,
	PlanMessage,
	Slice
} from '~/entities/plan/model/plan'
import { refetchQuery } from '~/shared/lib'

// A pushed row carries no derived state, so the state already held survives it:
// a push saying nothing about the build must not blank what the board shows.
export function patchPlan (queryClient: QueryClient, plan: Plan): void {
	queryClient.setQueryData<PlanDetail>(planKeys.detail(plan.id), (previous) =>
		previous === undefined
			? previous
			: { ...previous, plan: { ...plan, state: plan.state ?? previous.plan.state } }
	)
	queryClient.setQueryData<PlanListEntry[]>(planKeys.list(), (previous) =>
		previous?.some((entry) => entry.id === plan.id)
			? previous.map((entry) =>
				entry.id === plan.id ? { ...entry, ...plan, state: plan.state ?? entry.state } : entry
			)
			: [{ ...plan, build: null, reason: null, ownerEmail: null }, ...(previous ?? [])]
	)
}

export function dropPlan (queryClient: QueryClient, planId: string): void {
	queryClient.removeQueries({ queryKey: planKeys.detail(planId) })
	queryClient.setQueryData<PlanListEntry[]>(planKeys.list(), (previous) =>
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

// Everything a moved build can change: the board, the plan's own page, the line's
// capacity and the header count. Refetched rather than merged, because the reason
// lines and capacity are computed by the backend.
export function refreshAfterBuild (opts: { queryClient: QueryClient, planId: string | null }): void {
	refetchQuery(opts.queryClient, planKeys.list())
	refetchQuery(opts.queryClient, lineKeys.all())
	refetchQuery(opts.queryClient, needsYouKeys.all())

	if (opts.planId !== null) {
		refetchQuery(opts.queryClient, planKeys.detail(opts.planId))
	}
}

export function refreshPlanDetail (queryClient: QueryClient, planId: string): void {
	refetchQuery(queryClient, planKeys.detail(planId))
}

export function refreshNeedsYou (queryClient: QueryClient): void {
	refetchQuery(queryClient, needsYouKeys.all())
}

export function refreshLine (queryClient: QueryClient): void {
	refetchQuery(queryClient, planKeys.list())
	refetchQuery(queryClient, lineKeys.all())
}
