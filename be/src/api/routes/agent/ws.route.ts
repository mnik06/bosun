import { type WebSocket } from '@fastify/websocket';
import { type RawData } from 'ws';
import { FastifyBaseLogger, FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticateAgent } from 'src/controllers/agent/authenticate-agent';
import { markMachineOffline } from 'src/controllers/machines/mark-machine-offline';
import { markMachineOnline } from 'src/controllers/machines/mark-machine-online';
import { saveMachinePreflight } from 'src/controllers/machines/save-machine-preflight';
import {
	broadcastToUi,
	registerAgentSocket,
	unregisterAgentSocket
} from 'src/services/sockets/registry.service';
import { resolvePing } from 'src/services/sockets/pending-pings.service';
import { type Machine } from 'src/types/MachineSchema';
import { AgentMsgSchema } from 'src/types/protocol';

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;

function announce(machine: Machine | null): void {
	if (machine) {
		broadcastToUi({ type: 'machine.updated', machine });
	}
}

// Protocol-level ping frames, not the application ping: this is what catches a
// TCP connection that died without either side sending a close frame.
function startHeartbeat(socket: WebSocket): () => void {
	let missed = 0;

	socket.on('pong', () => {
		missed = 0;
	});

	const timer = setInterval(() => {
		if (missed >= MAX_MISSED) {
			socket.terminate();

			return;
		}

		missed += 1;
		socket.ping();
	}, HEARTBEAT_MS);

	return () => {
		clearInterval(timer);
	};
}

async function handleMessage(opts: {
	fastify: FastifyInstance;
	machineId: string;
	raw: string;
	log: FastifyBaseLogger;
}): Promise<void> {
	const machineRepo = opts.fastify.repos.machineRepo;
	let json: unknown;

	try {
		json = JSON.parse(opts.raw);
	} catch {
		opts.log.warn({ machineId: opts.machineId }, 'agent sent unparseable frame');

		return;
	}

	const parsed = AgentMsgSchema.safeParse(json);

	if (!parsed.success) {
		opts.log.warn({ machineId: opts.machineId }, 'agent sent frame failing schema');

		return;
	}

	const msg = parsed.data;

	if (msg.type === 'hello') {
		announce(
			await markMachineOnline({
				machineRepo,
				id: opts.machineId,
				agentVersion: msg.agentVersion,
				repoPath: msg.repoPath
			})
		);

		return;
	}

	if (msg.type === 'preflight') {
		announce(
			await saveMachinePreflight({ machineRepo, id: opts.machineId, checks: msg.checks })
		);

		return;
	}

	const rttMs = resolvePing({ commandId: msg.id, machineId: opts.machineId, at: Date.now() });

	if (rttMs !== null) {
		broadcastToUi({ type: 'machine.pong', machineId: opts.machineId, id: msg.id, rttMs });
	}
}

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', async (request, reply) => {
		const machineId = await authenticateAgent({
			machineRepo: fastify.repos.machineRepo,
			authorization: request.headers.authorization
		});

		if (!machineId) {
			return reply.status(401).send({ message: 'Unauthorized' });
		}

		request.machineId = machineId;
	});

	fastify.get('/ws', { websocket: true }, (socket, request) => {
		const machineId = request.machineId!;

		registerAgentSocket({ machineId, socket });
		const stopHeartbeat = startHeartbeat(socket);

		socket.on('message', (raw: RawData) => {
			void handleMessage({
				fastify,
				machineId,
				raw: raw.toString(),
				log: request.log
			});
		});

		socket.on('close', () => {
			stopHeartbeat();

			if (unregisterAgentSocket({ machineId, socket })) {
				const machineRepo = fastify.repos.machineRepo;

				void markMachineOffline({ machineRepo, id: machineId }).then(announce);
			}
		});
	});
};

export default routes;
