import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useDeleteQueue (opts: { queueId: string, machineId: string }) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.delete(`/queues/${opts.queueId}`)
		},
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: queueKeys.forMachine(opts.machineId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not delete queue', error })
		}
	})
}
