// Pickers name a machine by what it works on, because two boxes called `vps-1`
// and `vps-2` say nothing about which repository a plan will be written against.
export function machinePickerLabel (opts: {
	machine: { name: string, repositoryId?: string | null | undefined },
	repositories: { id: string, fullName: string }[] | undefined
}): string {
	const repository = opts.repositories?.find((entry) => entry.id === opts.machine.repositoryId)

	return repository === undefined ? opts.machine.name : `${opts.machine.name} · ${repository.fullName}`
}
