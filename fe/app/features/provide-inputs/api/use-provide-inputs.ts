import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
	machineKeys,
	putEnvSet,
	putMachinePolicy,
	putSessionSecrets,
	sealVars,
	type Machine
} from '~/entities/machine'
import { repositoryKeys } from '~/entities/repository'
import type { InputWrites } from '~/features/provide-inputs/lib/input-plan'
import { notifyError } from '~/shared/lib'

// One write per set, in order. The backend decides a machine is ready for
// verify from what it holds after each one, and starts verify itself when the
// last missing input lands — so nothing here asks for it.
export function useProvideInputs (machine: Pick<Machine, 'id' | 'publicKey'>) {
	const queryClient = useQueryClient()

	return useMutation({
		gcTime: 0,
		mutationFn: async (opts: { writes: InputWrites, applyMigrations: boolean | null }): Promise<void> => {
			for (const set of opts.writes.envSets) {
				await putEnvSet({
					machineId: machine.id,
					path: set.path,
					vars: await sealVars({ publicKey: machine.publicKey, vars: set.vars })
				})
			}

			if (opts.writes.sessionSecrets !== null) {
				await putSessionSecrets({
					machineId: machine.id,
					vars: await sealVars({ publicKey: machine.publicKey, vars: opts.writes.sessionSecrets })
				})
			}

			if (opts.applyMigrations !== null) {
				await putMachinePolicy({ machineId: machine.id, applyMigrations: opts.applyMigrations })
			}
		},
		onSettled: async () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: machineKeys.detail(machine.id) }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.machineOnboarding(machine.id) })
			]),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the inputs', error })
		}
	})
}
