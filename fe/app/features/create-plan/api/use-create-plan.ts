import { useMutation, useQueryClient } from '@tanstack/react-query'

import { PlanSchema, patchPlan, type Plan } from '~/entities/plan'
import type { CreatePlanForm } from '~/features/create-plan/model/create-plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

async function createPlan (form: CreatePlanForm): Promise<Plan> {
	const { data } = await apiClient.post<unknown>('/plans', form)

	return PlanSchema.parse(data)
}

export function useCreatePlan () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: createPlan,
		onSuccess: (plan) => {
			patchPlan(queryClient, plan)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not start planning', error })
		}
	})
}
