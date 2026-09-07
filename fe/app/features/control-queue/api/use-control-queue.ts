import { useMutation, useQueryClient } from '@tanstack/react-query'

import { QueueSchema, queueKeys, type Queue } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export type QueueAction = 'pause' | 'resume' | 'stop'

export function useControlQueue (opts: { queueId: string, machineId: string }) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (action: QueueAction): Promise<Queue> => {
			const { data } = await apiClient.post<unknown>(`/queues/${opts.queueId}/control`, { action })

			return QueueSchema.parse(data)
		},
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: queueKeys.forMachine(opts.machineId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the queue', error })
		}
	})
}
