import { useMutation, useQueryClient } from '@tanstack/react-query'

import { MachineSchema, machineKeys, type Machine } from '~/entities/machine'
import type { EnvSetPayload } from '~/features/edit-env-sets/model/env-set-form'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useSaveEnvSet (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		// The variables are secret values. With the default gcTime a settled
		// mutation holds them in the cache for minutes after the modal is gone.
		gcTime: 0,
		mutationFn: async (payload: EnvSetPayload): Promise<Machine> => {
			const { data } = await apiClient.put<unknown>(`/machines/${machineId}/env-sets`, payload)

			return MachineSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: machineKeys.detail(machineId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the env variables', error })
		}
	})
}
