import type { Machine } from '~/entities/machine/model/machine'

export type MachineKind = 'pending' | 'legacy' | 'unattached' | 'repository'

// A machine enrolled before repositories carries the operator's checkout as its
// repo path and keeps working exactly as it did. One enrolled since has no path
// until bosun attaches a repository, and until then there is nothing it can
// plan or build against.
export function machineKind (machine: Pick<Machine, 'status' | 'repoPath' | 'repositoryId'>): MachineKind {
	if (machine.repositoryId != null) {
		return 'repository'
	}

	if (machine.status === 'pending') {
		return 'pending'
	}

	return machine.repoPath === null ? 'unattached' : 'legacy'
}
