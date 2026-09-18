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

// Attached, but the clone has not landed: the agent has no tree to run a session
// in yet. Absent is a backend that does not track the clone, and is taken as
// cloned rather than blocking every attached machine behind a field it never sends.
export function repositoryCloning (machine: Pick<Machine, 'repositoryId' | 'clonedRepositoryId'>): boolean {
	return machine.repositoryId != null && machine.clonedRepositoryId !== undefined && machine.clonedRepositoryId !== machine.repositoryId
}
