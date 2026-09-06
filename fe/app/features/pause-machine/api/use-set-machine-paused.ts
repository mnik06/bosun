import { useMutation, useQueryClient } from '@tanstack/react-query'

import { machineKeys, MachineSchema } from '~/entities/machine'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useSetMachinePaused (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (paused: boolean) => {
			const { data } = await apiClient.post<unknown>(
				`/machines/${machineId}/${paused ? 'pause' : 'resume'}`
			)

			return MachineSchema.parse(data)
		},
		// The backend also pushes this over the socket. Writing it here as well is
		// what keeps the button honest when the socket happens to be reconnecting.
		onSuccess: async (machine) => {
			queryClient.setQueryData(machineKeys.detail(machine.id), machine)

			return queryClient.invalidateQueries({ queryKey: machineKeys.list() })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the machine state', error })
		}
	})
}
