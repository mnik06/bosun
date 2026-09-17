import { Select } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'

import type { MachineOption } from '~/entities/machine/model/use-online-machine-options'

export function MachineSelectField<T extends { machineId: string }> ({ form, options }: {
	form: UseFormReturnType<T>
	options: MachineOption[]
}) {
	return (
		<Select
			label="Machine"
			placeholder="Pick an online machine"
			data={options}
			disabled={options.length === 0}
			data-autofocus
			key={form.key('machineId')}
			{...form.getInputProps('machineId')}
		/>
	)
}
