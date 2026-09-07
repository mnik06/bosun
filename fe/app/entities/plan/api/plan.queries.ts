import { useQuery } from '@tanstack/react-query'

import {
	PlanDetailSchema,
	PlanListSchema,
	type Plan,
	type PlanDetail
} from '~/entities/plan/model/plan'
import { apiClient } from '~/shared/api'

export const planKeys = {
	all: ['plans'] as const,
	list: () => [...planKeys.all, 'list'] as const,
	detail: (id: string) => [...planKeys.all, 'detail', id] as const
}

export async function fetchPlans (): Promise<Plan[]> {
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
