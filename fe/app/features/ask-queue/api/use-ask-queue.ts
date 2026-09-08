import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useAskQueue (queueId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (question: string) => {
			await apiClient.post(`/queues/${queueId}/messages`, { question })
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.detail(queueId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not ask that', error })
		}
	})
}
