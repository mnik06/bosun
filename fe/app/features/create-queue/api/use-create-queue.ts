import { useMutation, useQueryClient } from '@tanstack/react-query'

import { QueueSchema, queueKeys, type Queue } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export interface CreateQueueForm {
	machineId: string
	name: string
	afk: boolean
}

async function createQueue (form: CreateQueueForm): Promise<Queue> {
	const { data } = await apiClient.post<unknown>('/queues', form)

	return QueueSchema.parse(data)
}

export function useCreateQueue (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: createQueue,
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: queueKeys.forMachine(machineId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not create queue', error })
		}
	})
}
