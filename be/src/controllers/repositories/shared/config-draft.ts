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

// What every planning frame carries about the project: the legacy profile's
// notes, and the draft a repository machine falls back on.
export async function planFrameContext(opts: {
	repositoryRepo: RepositoryRepo;
	machine: Pick<Machine, 'repositoryId' | 'projectProfile'> | null;
}): Promise<{ notes: string | null; configDraft: string | null }> {
	return {
		notes: opts.machine?.projectProfile?.notes ?? null,
		configDraft: await configDraftFor(opts)
	};
}

// Enrolled under plan 008 and not yet given a repository: there is no checkout to
// plan in or cut a worktree from, so nothing is offered to it.
export function awaitingRepository(machine: Pick<Machine, 'repositoryId' | 'repoPath'>): boolean {
	return machine.repositoryId === null && machine.repoPath === null;
}
