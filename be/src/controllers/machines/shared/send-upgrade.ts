import { type FastifyBaseLogger } from 'fastify';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

export function sendUpgrade(opts: {
	socketRegistry: SocketRegistry;
	machine: Pick<Machine, 'id' | 'projectId'>;
	from: string;
	target: { version: string; downloadBaseUrl: string };
	force: boolean;
	trigger: 'refresh' | 'auto';
	log: Pick<FastifyBaseLogger, 'info'>;
}): boolean {
	// Logged with both versions because the comparison is equality, not "newer
	// than": a pinned version below what a machine runs is a deliberate rollback,
	// and it should read as one rather than as an upgrade that quietly went
	// backwards.
	opts.log.info(
		{
			machineId: opts.machine.id,
			from: opts.from,
			to: opts.target.version,
			trigger: opts.trigger
		},
		'offering the agent an upgrade'
	);

	const sent = opts.socketRegistry.sendToAgent({
		machineId: opts.machine.id,
		message: { type: 'upgrade', ...opts.target, force: opts.force }
	});

	if (sent) {
		opts.socketRegistry.broadcastToUi({
			projectId: opts.machine.projectId,
			message: {
				type: 'machine.upgrading',
				machineId: opts.machine.id,
				from: opts.from,
				to: opts.target.version
			}
		});
	}

	return sent;
}
