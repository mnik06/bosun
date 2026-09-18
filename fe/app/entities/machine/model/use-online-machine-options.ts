import { useEffect } from 'react'

import { useMachinesQuery } from '~/entities/machine/api/machine.queries'
import type { Machine } from '~/entities/machine/model/machine'

export interface MachineOption {
	value: string
	label: string
}

// Every machine picker offers only online machines, but what "usable" means
// beyond that is the caller's call — a plan can run on a bare checkout, a
// quick fix cannot.
export function useOnlineMachineOptions (opts: {
	filter: (machine: Machine) => boolean
	label: (machine: Machine) => string
	opened: boolean
	machineId: string
	onDefaultMachine: (machineId: string) => void
}): { options: MachineOption[] } {
	const { filter, label, opened, machineId, onDefaultMachine } = opts
	const machines = useMachinesQuery()

	const options = (machines.data ?? [])
		.filter((machine) => machine.status === 'online' && filter(machine))
		.map((machine) => ({ value: machine.id, label: label(machine) }))

	const firstMachineId = options[0]?.value

	// An effect rather than an initial value: the machines arrive after the form is
	// built, and a reset on close empties the pick again for the next open.
	useEffect(() => {
		if (opened && firstMachineId !== undefined && machineId === '') {
			onDefaultMachine(firstMachineId)
		}
	}, [opened, firstMachineId, machineId, onDefaultMachine])

	return { options }
}
