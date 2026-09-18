import { redispatchAttach, type RedispatchAttachDeps } from 'src/controllers/machines/shared/redispatch-attach';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type Machine } from 'src/types/MachineSchema';

// The row names a repository the agent says it does not have. The reply to an
// attach is lost when the clone outlives its socket — a deploy, an upgrade, a
// dropped connection — and nothing else would ever ask again: the checklist reads
// the row as attached while every session on the box fails for want of a clone.
// Asking again is safe because the agent answers a repeat with the attach it is
// already running. An agent too old to report a repository reports nothing, and
// is left alone.
export async function reconcileRepository(
	opts: RedispatchAttachDeps & {
		repositoryRepo: RepositoryRepo;
		machine: Machine;
		reportedRepositoryId: string | null | undefined;
	}
): Promise<void> {
	if (opts.reportedRepositoryId !== null || opts.machine.repositoryId === null) {
		return;
	}

	const repository = await opts.repositoryRepo.getById(opts.machine.repositoryId);

	if (repository) {
		await redispatchAttach(opts, { machineId: opts.machine.id, repository });
	}
}
