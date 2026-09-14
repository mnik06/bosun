import { useMutation, useQueryClient } from '@tanstack/react-query'

import { machineKeys, putEnvSet, sealVars, type Machine } from '~/entities/machine'
import type { EnvSetPayload } from '~/features/edit-env-sets/model/env-set-form'
import { notifyError } from '~/shared/lib'

export function useSaveEnvSet (machine: Pick<Machine, 'id' | 'publicKey'>) {
	const queryClient = useQueryClient()

	return useMutation({
		// The variables are secret values. With the default gcTime a settled
		// mutation holds them in the cache for minutes after the modal is gone.
		gcTime: 0,
		mutationFn: async (payload: EnvSetPayload): Promise<Machine> =>
			putEnvSet({
				machineId: machine.id,
				path: payload.path,
				vars: await sealVars({ publicKey: machine.publicKey, vars: payload.vars })
			}),
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: machineKeys.detail(machine.id) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the env variables', error })
		}
	})
}
