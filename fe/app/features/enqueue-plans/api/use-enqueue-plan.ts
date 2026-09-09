import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// One request per plan rather than one for the batch: the backend refuses a plan
// that is not ready or belongs to another machine, and a batch endpoint would
// have to decide whether one bad plan cancels the rest. Reported per plan here
// instead, so the good ones land.
export function useEnqueuePlans (queueId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (planIds: string[]) => {
			const results = await Promise.allSettled(
				planIds.map(async (planId) => apiClient.post(`/queues/${queueId}/items`, { planId }))
			)
			const failed = results.filter((result) => result.status === 'rejected').length

			if (failed > 0) {
				throw new Error(`${failed} of ${planIds.length} plans could not be queued`)
			}
		},
		onSettled: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not queue every plan', error })
		}
	})
}
