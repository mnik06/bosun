import { useQuery } from '@tanstack/react-query'

import {
	PlanDetailSchema,
	PlanListSchema,
	type PlanDetail,
	type PlanListEntry
} from '~/entities/plan/model/plan'
import { apiClient, getActiveProjectId } from '~/shared/api'
import { readBlobAsDataUrl } from '~/shared/lib'

// Every key carries the active project. Without it a switch shows the previous
// project's rows out of cache until the refetch lands, which is the one bug this
// change invites and the cheapest possible place to prevent it.
export const planKeys = {
	all: () => ['plans', getActiveProjectId()] as const,
	list: () => [...planKeys.all(), 'list'] as const,
	detail: (id: string) => [...planKeys.all(), 'detail', id] as const,
	attachment: (opts: { planId: string, attachmentId: string }) =>
		[...planKeys.all(), 'attachment', opts.planId, opts.attachmentId] as const
}

export async function fetchPlans (): Promise<PlanListEntry[]> {
	const { data } = await apiClient.get<unknown>('/plans')

	return PlanListSchema.parse(data)
}

export async function fetchPlan (id: string): Promise<PlanDetail> {
	const { data } = await apiClient.get<unknown>(`/plans/${id}`)

	return PlanDetailSchema.parse(data)
}

export function usePlansQuery () {
	return useQuery({ queryKey: planKeys.list(), queryFn: fetchPlans })
}

export function usePlanQuery (id: string) {
	return useQuery({
		queryKey: planKeys.detail(id),
		queryFn: async () => fetchPlan(id)
	})
}

export async function fetchPlanAttachment (opts: { planId: string, attachmentId: string }): Promise<Blob> {
	const { data } = await apiClient.get<Blob>(`/plans/${opts.planId}/attachments/${opts.attachmentId}`, {
		responseType: 'blob'
	})

	return data
}

// Cached as a data URL rather than an object URL: an object URL pins its blob
// until somebody revokes it, and nothing here knows when the cache lets go.
// Never stale, because an attachment is never rewritten.
export function usePlanAttachmentImageQuery (opts: { planId: string, attachmentId: string }) {
	return useQuery({
		queryKey: planKeys.attachment(opts),
		queryFn: async () => readBlobAsDataUrl(await fetchPlanAttachment(opts)),
		staleTime: Infinity
	})
}
