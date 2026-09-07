import { HttpError } from 'src/api/errors/HttpError';
import { announceQueue } from 'src/controllers/queues/announce-queue';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { toQueueSlug, type Queue } from 'src/types/QueueSchema';

export async function createQueue(opts: {
	queueRepo: QueueRepo;
	machineRepo: MachineRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	userId: string;
	machineId: string;
	name: string;
	afk: boolean;
}): Promise<Queue> {
	const machine = await opts.machineRepo.getOwnedById({
		id: opts.machineId,
		userId: opts.userId
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	const slug = toQueueSlug(opts.name);

	if (slug === '') {
		throw new HttpError(400, 'Queue name must contain a letter or a digit');
	}

	const queue = await opts.queueRepo.create({
		id: opts.idService.createQueueId(),
		userId: opts.userId,
		machineId: opts.machineId,
		name: opts.name,
		slug,
		afk: opts.afk
	});

	// The row is created before the worktree exists, so a queue created against an
	// offline machine stays visible as `provisioning` rather than failing outright
	// — the ensure is re-sent when the agent comes back.
	opts.socketRegistry.sendToAgent({
		machineId: opts.machineId,
		message: { type: 'queue.worktree.ensure', queueId: queue.id, slug }
	});
	announceQueue({ socketRegistry: opts.socketRegistry, queue });

	return queue;
}
