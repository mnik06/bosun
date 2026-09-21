import { useMutation, useQueryClient } from '@tanstack/react-query'

import { refreshNeedsYou } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useDismissProposal () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (proposalId: string) => {
			await apiClient.post(`/plans/proposals/${proposalId}/dismiss`)
		},
		onSuccess: () => {
			refreshNeedsYou(queryClient)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not dismiss the proposal', error })
		}
	})
}
