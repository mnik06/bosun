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
	sendToAgent,
	unregisterAgentSocket
} from 'src/services/sockets/registry.service';
import { resolvePing } from 'src/services/sockets/pending-pings.service';
import { type Machine } from 'src/types/MachineSchema';
import { AgentMsgSchema } from 'src/types/protocol';

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;

function announceUpdate(machine: Machine): void {
	broadcastToUi({ userId: machine.userId, message: { type: 'machine.updated', machine } });
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
	userId: string;
	socket: WebSocket;
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

	if (msg.type === 'pong') {
		const rttMs = resolvePing({ commandId: msg.id, machineId: opts.machineId, at: Date.now() });

		if (rttMs !== null) {
			broadcastToUi({
				userId: opts.userId,
				message: { type: 'machine.pong', machineId: opts.machineId, id: msg.id, rttMs }
			});
		}

		return;
	}

	const machine =
		msg.type === 'hello'
			? await markMachineOnline({
				machineRepo,
				id: opts.machineId,
				agentVersion: msg.agentVersion,
				repoPath: msg.repoPath
			})
			: await saveMachinePreflight({ machineRepo, id: opts.machineId, checks: msg.checks });

	// The row can disappear mid-session: deleting the owner's account cascades to
	// their machines. Leaving the socket up would keep a machine nobody can reach
	// registered and counted as connected.
	if (!machine) {
		opts.log.warn({ machineId: opts.machineId }, 'machine row is gone; evicting agent socket');
		opts.socket.terminate();

		return;
	}

	announceUpdate(machine);

	// A paused machine that reconnects is still paused — the row outranks the
	// socket — so the agent is told again rather than left to infer from silence
	// that bosun is not dispatching to it.
	if (msg.type === 'hello' && machine.status === 'paused') {
		sendToAgent({ machineId: machine.id, message: { type: 'pause' } });
	}
}

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', async (request, reply) => {
		const agent = await authenticateAgent({
			machineRepo: fastify.repos.machineRepo,
			authorization: request.headers.authorization
		});

		if (!agent) {
			return reply.status(401).send({ message: 'Unauthorized' });
		}

		request.agent = agent;
	});

	fastify.get('/ws', { websocket: true }, (socket, request) => {
		const { machineId, userId } = request.agent!;

		registerAgentSocket({ machineId, socket });
		const stopHeartbeat = startHeartbeat(socket);

		socket.on('message', (raw: RawData) => {
			void handleMessage({
				fastify,
				machineId,
				userId,
				socket,
				raw: raw.toString(),
				log: request.log
			});
		});

		socket.on('close', () => {
			stopHeartbeat();

			if (unregisterAgentSocket({ machineId, socket })) {
				const machineRepo = fastify.repos.machineRepo;

				void markMachineOffline({ machineRepo, id: machineId }).then((machine) => {
					if (machine) {
						announceUpdate(machine);
					}
				});
			}
		});
	});
};

export default routes;
