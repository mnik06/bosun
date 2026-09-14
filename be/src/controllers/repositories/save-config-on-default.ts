import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

// Taken only from an agent attached to that repository, and announced only when
// it changed: every reconnect re-reports it, and most of them say nothing new.
export async function saveConfigOnDefault(opts: {
	repositoryRepo: RepositoryRepo;
	socketRegistry: SocketRegistry;
	machine: Machine;
	reportedRepositoryId: string | null | undefined;
	configOnDefault: boolean | undefined;
}): Promise<void> {
	const repositoryId = opts.machine.repositoryId;

	if (opts.configOnDefault === undefined || repositoryId === null || opts.reportedRepositoryId !== repositoryId) {
		return;
	}

	const current = await opts.repositoryRepo.getById(repositoryId);

	if (!current || current.configOnDefault === opts.configOnDefault) {
		return;
	}

	const repository = await opts.repositoryRepo.saveConfigOnDefault({
		id: repositoryId,
		configOnDefault: opts.configOnDefault
	});

	if (repository) {
		announceRepository({ socketRegistry: opts.socketRegistry, repository });
	}
}
