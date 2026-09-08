import { useMutation, useQueryClient } from '@tanstack/react-query'

import { MachineSchema, machineKeys, type Machine, type ProjectProfile } from '~/entities/machine'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useSaveProjectProfile (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (profile: ProjectProfile): Promise<Machine> => {
			const { data } = await apiClient.patch<unknown>(`/machines/${machineId}/profile`, profile)

			return MachineSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: machineKeys.detail(machineId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the project setup', error })
		}
	})
}
