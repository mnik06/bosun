import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useRetryVerify (opts: { queueId: string, itemId: string }) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.post(`/queues/${opts.queueId}/items/${opts.itemId}/verify/retry`)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not run the verify bullet again', error })
		}
	})
}
