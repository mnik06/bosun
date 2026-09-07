import { type WebSocket } from '@fastify/websocket';
import { type RawData } from 'ws';
import { FastifyBaseLogger, FastifyInstance, FastifyPluginAsync } from 'fastify';
import { markMachineOffline } from 'src/controllers/machines/mark-machine-offline';
import { markMachineOnline } from 'src/controllers/machines/mark-machine-online';
import { saveMachinePreflight } from 'src/controllers/machines/save-machine-preflight';
import { failMachinePlans } from 'src/controllers/plans/fail-machine-plans';
import { recordPlanFrame } from 'src/controllers/plans/record-plan-frame';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { AgentMsgSchema, type AgentMsg } from 'src/types/protocol';

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;

type PlanFrame = Extract<AgentMsg, { type: `plan.${string}` }>;

function isPlanFrame(msg: AgentMsg): msg is PlanFrame {
	return msg.type.startsWith('plan.');
}

function announceUpdate(opts: { socketRegistry: SocketRegistry; machine: Machine }): void {
	opts.socketRegistry.broadcastToUi({
		userId: opts.machine.userId,
		message: { type: 'machine.updated', machine: opts.machine }
	});
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

function parseFrame(opts: {
	raw: string;
	machineId: string;
	log: FastifyBaseLogger;
}): AgentMsg | null {
	let json: unknown;

	try {
		json = JSON.parse(opts.raw);
	} catch {
		opts.log.warn({ machineId: opts.machineId }, 'agent sent unparseable frame');

		return null;
	}

	const parsed = AgentMsgSchema.safeParse(json);

	if (!parsed.success) {
		opts.log.warn({ machineId: opts.machineId }, 'agent sent frame failing schema');

		return null;
	}

	return parsed.data;
}

async function applyMachineFrame(opts: {
	fastify: FastifyInstance;
	machineId: string;
	socket: WebSocket;
	msg: Extract<AgentMsg, { type: 'hello' | 'preflight' }>;
	log: FastifyBaseLogger;
}): Promise<void> {
	const machineRepo = opts.fastify.repos.machineRepo;
	const socketRegistry = opts.fastify.services.socketRegistry;
	const machine =
		opts.msg.type === 'hello'
			? await markMachineOnline({
				machineRepo,
				id: opts.machineId,
				agentVersion: opts.msg.agentVersion,
				repoPath: opts.msg.repoPath
			})
			: await saveMachinePreflight({
				machineRepo,
				id: opts.machineId,
				checks: opts.msg.checks,
				claudeAuthMode: opts.msg.claudeAuthMode
			});

	// The row can disappear mid-session: deleting the owner's account cascades to
	// their machines. Leaving the socket up would keep a machine nobody can reach
	// registered and counted as connected.
	if (!machine) {
		opts.log.warn({ machineId: opts.machineId }, 'machine row is gone; evicting agent socket');
		opts.socket.terminate();

		return;
	}

	announceUpdate({ socketRegistry, machine });

	// A paused machine that reconnects is still paused — the row outranks the
	// socket — so the agent is told again rather than left to infer from silence
	// that bosun is not dispatching to it.
	if (opts.msg.type === 'hello' && machine.status === 'paused') {
		socketRegistry.sendToAgent({ machineId: machine.id, message: { type: 'pause' } });
	}
}

async function handleMessage(opts: {
	fastify: FastifyInstance;
	machineId: string;
	userId: string;
	socket: WebSocket;
	msg: AgentMsg;
	log: FastifyBaseLogger;
}): Promise<void> {
	const { msg } = opts;
	const { pendingPings, socketRegistry, idService, planTextService } = opts.fastify.services;

	if (msg.type === 'pong') {
		const rttMs = pendingPings.resolve({
			commandId: msg.id,
			machineId: opts.machineId,
			at: Date.now()
		});

		if (rttMs !== null) {
			socketRegistry.broadcastToUi({
				userId: opts.userId,
				message: { type: 'machine.pong', machineId: opts.machineId, id: msg.id, rttMs }
			});
		}

		return;
	}

	if (isPlanFrame(msg)) {
		await recordPlanFrame({
			planRepo: opts.fastify.repos.planRepo,
			planMessageRepo: opts.fastify.repos.planMessageRepo,
			acRepo: opts.fastify.repos.acRepo,
			idService,
			planTextService,
			socketRegistry,
			machineId: opts.machineId,
			frame: msg
		});

		return;
	}

	await applyMachineFrame({ ...opts, msg });
}

// Plan frames are handled one at a time, in arrival order. They append to a
// transcript whose sequence numbers come from `max(seq) + 1`, so two overlapping
// appends would collide on the unique index — and an answer recorded before the
// question it answers is a transcript that cannot be replayed. Machine frames and
// pongs stay off this queue: nothing about them is ordered, and a pong waiting
// behind a database write is a round-trip time that measures the wrong thing.
function createFrameQueue(log: FastifyBaseLogger) {
	let tail = Promise.resolve();

	return function enqueue(run: () => Promise<void>): void {
		tail = tail.then(run).catch((error: unknown) => {
			log.error({ error }, 'failed handling an agent frame');
		});
	};
}

function handleClose(opts: {
	fastify: FastifyInstance;
	machineId: string;
	socket: WebSocket;
}): void {
	const { socketRegistry, planTextService } = opts.fastify.services;

	if (!socketRegistry.unregisterAgentSocket({ machineId: opts.machineId, socket: opts.socket })) {
		return;
	}

	void markMachineOffline({
		machineRepo: opts.fastify.repos.machineRepo,
		id: opts.machineId
	}).then((machine) => {
		if (machine) {
			announceUpdate({ socketRegistry, machine });
		}
	});
	void failMachinePlans({
		planRepo: opts.fastify.repos.planRepo,
		planTextService,
		socketRegistry,
		machineId: opts.machineId
	});
}

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.get('/ws', { websocket: true }, (socket, request) => {
		const { machineId, userId } = request.agent!;

		fastify.services.socketRegistry.registerAgentSocket({ machineId, socket });
		const stopHeartbeat = startHeartbeat(socket);
		const enqueue = createFrameQueue(request.log);

		socket.on('message', (raw: RawData) => {
			const msg = parseFrame({ raw: raw.toString(), machineId, log: request.log });

			if (!msg) {
				return;
			}

			const handle = async () =>
				handleMessage({ fastify, machineId, userId, socket, msg, log: request.log });

			if (isPlanFrame(msg)) {
				enqueue(handle);

				return;
			}

			void handle();
		});

		socket.on('close', () => {
			stopHeartbeat();
			handleClose({ fastify, machineId, socket });
		});
	});
};

export default routes;
