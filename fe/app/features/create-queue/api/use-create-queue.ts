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

export function useCreateQueue () {
	const queryClient = useQueryClient()

	// The whole queue tree, not one machine's slice: a queue created from the
	// queues page picks its machine in the form, so the key to invalidate is not
	// known at the call site.
	return useMutation({
		mutationFn: createQueue,
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not create queue', error })
		}
	})
}
