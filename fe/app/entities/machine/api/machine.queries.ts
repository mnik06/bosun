import { useQuery } from '@tanstack/react-query'

import { MachineListSchema, MachineSchema, type Machine } from '~/entities/machine/model/machine'
import { apiClient } from '~/shared/api'

export const machineKeys = {
	all: ['machines'] as const,
	list: () => [...machineKeys.all, 'list'] as const,
	detail: (id: string) => [...machineKeys.all, 'detail', id] as const
}

export async function fetchMachines (): Promise<Machine[]> {
	const { data } = await apiClient.get<unknown>('/machines')

	return MachineListSchema.parse(data)
}

export async function fetchMachine (id: string): Promise<Machine> {
	const { data } = await apiClient.get<unknown>(`/machines/${id}`)

	return MachineSchema.parse(data)
}

export function useMachinesQuery () {
	return useQuery({
		queryKey: machineKeys.list(),
		queryFn: fetchMachines
	})
}

export function useMachineQuery (id: string) {
	return useQuery({
		queryKey: machineKeys.detail(id),
		queryFn: async () => fetchMachine(id)
	})
}
