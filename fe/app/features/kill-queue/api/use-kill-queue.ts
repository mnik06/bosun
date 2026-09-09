import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useKillQueue (queueId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.delete(`/queues/${queueId}`)
		},
		// Every queue cache: killing is done from the list and from the queue's own
		// page, and the row has to leave both.
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not kill the queue', error })
		}
	})
}
