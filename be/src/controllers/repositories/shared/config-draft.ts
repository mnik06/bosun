import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type Machine } from 'src/types/MachineSchema';

// What a repository machine is told to fall back on when the tree it works in has
// no `.bosun/project.yaml`. Null for a machine with no repository, which keeps
// running on its profile.
export async function configDraftFor(opts: {
	repositoryRepo: RepositoryRepo;
	machine: Pick<Machine, 'repositoryId'> | null;
}): Promise<string | null> {
	if (!opts.machine?.repositoryId) {
		return null;
	}

	return (await opts.repositoryRepo.getById(opts.machine.repositoryId))?.configDraft ?? null;
}

// Enrolled under plan 008 and not yet given a repository: there is no checkout to
// plan in or cut a worktree from, so nothing is offered to it.
export function awaitingRepository(machine: Pick<Machine, 'repositoryId' | 'repoPath'>): boolean {
	return machine.repositoryId === null && machine.repoPath === null;
}

// Attached but not yet cloned. Until the agent reports the clone, it has no tree
// for the repository and refuses every session with "no repository attached".
export function repositoryCloning(machine: Pick<Machine, 'repositoryId' | 'clonedRepositoryId'>): boolean {
	return machine.repositoryId !== null && machine.clonedRepositoryId !== machine.repositoryId;
}
