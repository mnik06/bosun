import { useMutation, useQueryClient } from '@tanstack/react-query'

import { dropPlan } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useDeletePlan () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (planId: string) => {
			await apiClient.delete(`/plans/${planId}`)

			return planId
		},
		onSuccess: (planId) => {
			dropPlan(queryClient, planId)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not delete the plan', error })
		}
	})
}
