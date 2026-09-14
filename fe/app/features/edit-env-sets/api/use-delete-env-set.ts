import { useMutation, useQueryClient } from '@tanstack/react-query'

import { MachineSchema, machineKeys, type Machine } from '~/entities/machine'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useDeleteEnvSet (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (path: string): Promise<Machine> => {
			const { data } = await apiClient.delete<unknown>(`/machines/${machineId}/env-sets`, {
				params: { path }
			})

			return MachineSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: machineKeys.detail(machineId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not delete the env variables', error })
		}
	})
}
