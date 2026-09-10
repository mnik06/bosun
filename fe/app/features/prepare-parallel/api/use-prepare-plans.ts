import { useMutation, useQueryClient } from '@tanstack/react-query'

import { PlanSchema, patchPlan, type Plan } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

async function preparePlans (planIds: string[]): Promise<Plan> {
	const { data } = await apiClient.post<unknown>('/plans/prepare', { planIds })

	return PlanSchema.parse(data)
}

export function usePreparePlans () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: preparePlans,
		onSuccess: (plan) => {
			patchPlan(queryClient, plan)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not prepare those plans', error })
		}
	})
}
