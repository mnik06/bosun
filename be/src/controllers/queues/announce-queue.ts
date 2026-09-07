import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Queue } from 'src/types/QueueSchema';

export function announceQueue(opts: { socketRegistry: SocketRegistry; queue: Queue }): void {
	opts.socketRegistry.broadcastToUi({
		userId: opts.queue.userId,
		message: { type: 'queue.updated', queue: opts.queue }
	});
}
