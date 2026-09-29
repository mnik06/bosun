import { Switch } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { machineKeys, patchMachineCapacity, type Machine } from '~/entities/machine'
import { notifyError } from '~/shared/lib'

export function AutoUpgradeSwitch ({ machine }: { machine: Pick<Machine, 'id' | 'autoUpgrade'> }) {
	const queryClient = useQueryClient()
	const save = useMutation({
		mutationFn: async (autoUpgrade: boolean) => patchMachineCapacity({ machineId: machine.id, autoUpgrade }),
		onSuccess: (updated) => {
			queryClient.setQueryData(machineKeys.detail(updated.id), updated)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change agent updates', error })
		}
	})

	return (
		<Switch
			label="Install new agent builds automatically"
			description="A release is offered here an hour after it ships, a couple of machines at a time, and never while this machine has work running. A build that fails on two machines stops being offered. Refresh still upgrades straight away."
			checked={save.isPending ? save.variables : (machine.autoUpgrade ?? false)}
			disabled={save.isPending}
			onChange={(event) => {
				save.mutate(event.currentTarget.checked)
			}}
		/>
	)
}
