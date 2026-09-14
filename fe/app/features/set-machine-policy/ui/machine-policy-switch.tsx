import { Switch } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import { useSetMachinePolicy } from '~/features/set-machine-policy/api/use-set-machine-policy'

// Per machine and never in the file: whether a database may be migrated is a
// fact about where this box points, not about the code.
export function MachinePolicySwitch ({ machine }: { machine: Pick<Machine, 'id' | 'policy'> }) {
	const setPolicy = useSetMachinePolicy(machine.id)
	const policy = machine.policy ?? { applyMigrations: true, confirmed: false }

	return (
		<Switch
			label={policy.confirmed ? 'Apply migrations' : 'Apply migrations (not chosen yet)'}
			description="Off when this machine points at a database bosun must not migrate. Sessions then commit migrations and say they are pending."
			checked={policy.applyMigrations}
			disabled={setPolicy.isPending}
			onChange={(event) => {
				setPolicy.mutate(event.currentTarget.checked)
			}}
		/>
	)
}
