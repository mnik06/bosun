import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Queue } from 'src/types/QueueSchema';

export function announceQueue(opts: { socketRegistry: SocketRegistry; queue: Queue }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.queue.projectId,
		message: { type: 'queue.updated', queue: opts.queue }
	});
}
