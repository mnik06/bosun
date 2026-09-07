import { useMutation, useQueryClient } from '@tanstack/react-query'

import { PlanSchema, patchPlan, type Plan } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

interface UpdatePlanVars {
	title?: string
	bodyMd?: string
}

export function useUpdatePlan (planId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (vars: UpdatePlanVars): Promise<Plan> => {
			const { data } = await apiClient.patch<unknown>(`/plans/${planId}`, vars)

			return PlanSchema.parse(data)
		},
		onSuccess: (plan) => {
			patchPlan(queryClient, plan)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the plan', error })
		}
	})
}
