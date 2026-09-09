import { useMutation, useQueryClient } from '@tanstack/react-query'

import { PlanSchema, planKeys } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useConfirmPlan (planId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			const { data } = await apiClient.post<unknown>(`/plans/${planId}/confirm`)

			return PlanSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: planKeys.all() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not confirm the plan', error })
		}
	})
}
