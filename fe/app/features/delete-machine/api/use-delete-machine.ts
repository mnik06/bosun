import { useMutation, useQueryClient } from '@tanstack/react-query'

import { machineKeys } from '~/entities/machine'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useDeleteMachine (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.delete(`/machines/${machineId}`)
		},
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: machineKeys.detail(machineId) })

			return queryClient.invalidateQueries({ queryKey: machineKeys.list() })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not delete machine', error })
		}
	})
}
