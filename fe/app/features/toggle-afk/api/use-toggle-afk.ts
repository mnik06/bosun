import { useMutation, useQueryClient } from '@tanstack/react-query'

import { QueueSchema, queueKeys, type Queue } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useToggleAfk (queueId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (afk: boolean): Promise<Queue> => {
			const { data } = await apiClient.patch<unknown>(`/queues/${queueId}`, { afk })

			return QueueSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change AFK', error })
		}
	})
}
