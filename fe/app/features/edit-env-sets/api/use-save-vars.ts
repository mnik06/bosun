import { useMutation, useQueryClient } from '@tanstack/react-query'

import { machineKeys, putEnvSet, putSessionSecrets, sealVars, type Machine, type PlainVar } from '~/entities/machine'
import { repositoryKeys } from '~/entities/repository'
import type { VarsTarget } from '~/features/edit-env-sets/model/env-set-form'
import { notifyError } from '~/shared/lib'

// A save replaces the whole set for a path, or the whole secret list, so the
// caller sends every key it keeps — stored ones as null.
export function useSaveVars (machine: Pick<Machine, 'id' | 'publicKey'>) {
	const queryClient = useQueryClient()

	return useMutation({
		// The variables are secret values. With the default gcTime a settled
		// mutation holds them in the cache for minutes after the form is gone.
		gcTime: 0,
		mutationFn: async (opts: { target: VarsTarget, vars: PlainVar[] }): Promise<Machine> => {
			const sealed = await sealVars({ publicKey: machine.publicKey, vars: opts.vars })

			return opts.target.kind === 'env'
				? putEnvSet({ machineId: machine.id, path: opts.target.path, vars: sealed })
				: putSessionSecrets({ machineId: machine.id, vars: sealed })
		},
		// What onboarding still counts as missing is derived from what the machine
		// holds, so both change together.
		onSuccess: async () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: machineKeys.detail(machine.id) }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.machineOnboarding(machine.id) })
			]),
		onError: (error: unknown, opts) => {
			notifyError({
				title: opts.target.kind === 'env' ? 'Could not save the env variables' : 'Could not save the test accounts',
				error
			})
		}
	})
}
