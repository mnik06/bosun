import { useQuery } from '@tanstack/react-query'

import {
	QueueDetailSchema,
	QueueListSchema,
	type Queue,
	type QueueDetail
} from '~/entities/queue/model/queue'
import { apiClient, getActiveProjectId } from '~/shared/api'

// Every key carries the active project. Without it a switch shows the previous
// project's rows out of cache until the refetch lands, which is the one bug this
// change invites and the cheapest possible place to prevent it.
export const queueKeys = {
	all: () => ['queues', getActiveProjectId()] as const,
	list: () => [...queueKeys.all(), 'list'] as const,
	forMachine: (machineId: string) => [...queueKeys.all(), 'machine', machineId] as const,
	detail: (id: string) => [...queueKeys.all(), 'detail', id] as const
}

export async function fetchQueues (machineId?: string): Promise<Queue[]> {
	const { data } = await apiClient.get<unknown>('/queues', {
		params: machineId === undefined ? undefined : { machineId }
	})

	return QueueListSchema.parse(data)
}

export function useMachineQueuesQuery (machineId: string) {
	return useQuery({
		queryKey: queueKeys.forMachine(machineId),
		queryFn: async () => fetchQueues(machineId)
	})
}

export async function fetchQueueDetail (id: string): Promise<QueueDetail> {
	const { data } = await apiClient.get<unknown>(`/queues/${id}`)

	return QueueDetailSchema.parse(data)
}

export function useQueueDetailQuery (id: string) {
	return useQuery({
		queryKey: queueKeys.detail(id),
		queryFn: async () => fetchQueueDetail(id)
	})
}

export function useQueuesQuery () {
	return useQuery({
		queryKey: queueKeys.list(),
		queryFn: async () => fetchQueues()
	})
}
