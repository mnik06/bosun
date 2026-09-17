import { HttpError } from 'src/api/errors/HttpError';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

// The shared tail of both attach flows: by the time this runs the repository
// row already exists, and everything left — the one-repository-per-machine
// guard, announcing the row, writing the attachment, dispatching the frame and
// rolling the attachment back if it is refused or the machine is offline — is
// identical between a GitHub and an Azure attach. Only `dispatch` differs.
export async function finishAttach(opts: {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	machine: Machine;
	repository: Repository;
	dispatch: () => Promise<boolean>;
}): Promise<void> {
	if (opts.machine.repositoryId !== null && opts.machine.repositoryId !== opts.repository.id) {
		throw new HttpError(409, 'This machine is already attached to another repository — a machine works on one repository');
	}

	announceRepository({ socketRegistry: opts.socketRegistry, repository: opts.repository });

	const attached = await opts.machineRepo.setRepository({ id: opts.machine.id, repositoryId: opts.repository.id });
	const sent = await opts.dispatch().catch(async (error: unknown) => {
		await opts.machineRepo.clearRepositoryIf({ id: opts.machine.id, repositoryId: opts.repository.id });

		throw error;
	});

	if (!sent) {
		await opts.machineRepo.clearRepositoryIf({ id: opts.machine.id, repositoryId: opts.repository.id });

		throw new HttpError(409, 'machine offline');
	}

	if (attached) {
		announceMachine({ socketRegistry: opts.socketRegistry, machine: attached });
	}
}
