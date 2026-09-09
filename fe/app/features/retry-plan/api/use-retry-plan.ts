import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useRetryPlan (opts: { queueId: string, itemId: string }) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.post(`/queues/${opts.queueId}/items/${opts.itemId}/retry`)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not retry that plan', error })
		}
	})
}
