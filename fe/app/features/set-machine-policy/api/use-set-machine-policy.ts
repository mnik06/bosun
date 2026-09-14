import { useMutation, useQueryClient } from '@tanstack/react-query'

import { machineKeys, putMachinePolicy, type Machine } from '~/entities/machine'
import { notifyError } from '~/shared/lib'

export function useSetMachinePolicy (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (applyMigrations: boolean): Promise<Machine> =>
			putMachinePolicy({ machineId, applyMigrations }),
		onSuccess: (machine) => {
			queryClient.setQueryData(machineKeys.detail(machine.id), machine)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the migration policy', error })
		}
	})
}
