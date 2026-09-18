import { useMutation, useQueryClient } from '@tanstack/react-query'

import { refreshAfterBuild } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useCloseBugfixSession (planId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.post(`/plans/${planId}/bugfix/close`)
		},
		onSuccess: () => {
			refreshAfterBuild({ queryClient, planId })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not end this session', error })
		}
	})
}
