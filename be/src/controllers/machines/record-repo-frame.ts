import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type AgentMsg } from 'src/types/protocol';

type RepoFrame = Extract<AgentMsg, { type: 'repo.attached' | 'repo.error' }>;

// The repository named by the frame is checked against the machine's own row, so
// an agent cannot report on — or clear — a repository it was never attached to.
export async function recordRepoFrame(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	socketRegistry: SocketRegistry;
	machineId: string;
	projectId: string;
	frame: RepoFrame;
}): Promise<void> {
	if (opts.frame.type === 'repo.error') {
		const cleared = await opts.machineRepo.clearRepositoryIf({ id: opts.machineId, repositoryId: opts.frame.repositoryId });

		if (!cleared) {
			return;
		}

		opts.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'machine.updated', machine: cleared } });
		opts.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
			message: {
				type: 'machine.repository.error',
				machineId: opts.machineId,
				repositoryId: opts.frame.repositoryId,
				message: opts.frame.message
			}
		});

		return;
	}

	const machine = await opts.machineRepo.getById(opts.machineId);

	if (machine?.repositoryId !== opts.frame.repositoryId) {
		return;
	}

	const repository = await opts.repositoryRepo.saveConfigOnDefault({
		id: opts.frame.repositoryId,
		configOnDefault: opts.frame.configOnDefault
	});

	if (repository) {
		announceRepository({ socketRegistry: opts.socketRegistry, repository });
	}
}
