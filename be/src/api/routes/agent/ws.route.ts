import { type WebSocket } from '@fastify/websocket';
import { type RawData } from 'ws';
import { FastifyBaseLogger, FastifyInstance, FastifyPluginAsync } from 'fastify';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { markMachineOffline } from 'src/controllers/machines/mark-machine-offline';
import { markMachineOnline } from 'src/controllers/machines/mark-machine-online';
import { saveMachinePreflight } from 'src/controllers/machines/save-machine-preflight';
import { stallMachinePlans } from 'src/controllers/plans/stall-machine-plans';
import { pauseMachineQueues } from 'src/controllers/queues/pause-machine-queues';
import { stallMachineRuns } from 'src/controllers/queues/stall-machine-runs';
import { schedulerDeps } from 'src/controllers/queues/scheduler-deps';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { DEFAULT_PROJECT_PROFILE } from 'src/types/ProjectProfileSchema';
import { AgentMsgSchema, type AgentMsg } from 'src/types/protocol';
import { handleAgentFrame, isExecFrame, isPlanFrame } from 'src/api/routes/agent/frame-router';

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;
// `lastSeenAt` is what tells a live machine from one whose socket died without a
// close frame, so it has to move while nothing else is happening — but a write
// per machine per pong is a write every 15 seconds for a column read by eye.
// A minute of resolution answers the question; the rest is load.
const TOUCH_MS = 60_000;

function announceUpdate(opts: { socketRegistry: SocketRegistry; machine: Machine }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.machine.projectId,
		message: { type: 'machine.updated', machine: opts.machine }
	});
}

// Protocol-level ping frames, not the application ping: this is what catches a
// TCP connection that died without either side sending a close frame. The pong
// is also the only liveness signal that survives a quiet machine, so it is what
// keeps `lastSeenAt` honest between the hello that set it and the close that
// would have moved it.
function startHeartbeat(opts: {
	socket: WebSocket;
	machineId: string;
	machineRepo: MachineRepo;
	log: FastifyBaseLogger;
}): () => void {
	let missed = 0;
	// Seeded to now because `hello` has just written the same timestamp: starting
	// at zero would spend a write restating it.
	let touchedAt = Date.now();

	opts.socket.on('pong', () => {
		missed = 0;

		const now = Date.now();

		if (now - touchedAt < TOUCH_MS) {
			return;
		}

		touchedAt = now;
		void opts.machineRepo.touch({ id: opts.machineId, now: new Date(now) }).catch(
			(error: unknown) => {
				// A heartbeat that cannot be recorded is not a reason to drop a working
				// socket; the machine stays reachable and only the column goes stale.
				opts.log.warn(
					{ error, machineId: opts.machineId },
					'failed recording an agent heartbeat'
				);
			}
		);
	});

	const timer = setInterval(() => {
		if (missed >= MAX_MISSED) {
			opts.socket.terminate();

			return;
		}

		missed += 1;
		opts.socket.ping();
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

async function offerUpgrade(opts: {
	fastify: FastifyInstance;
	machine: Machine;
	reported: string;
	log: FastifyBaseLogger;
}): Promise<void> {
	const target = await opts.fastify.services.agentRelease.target(opts.reported);

	if (!target) {
		return;
	}

	const { socketRegistry, pendingUpgrades } = opts.fastify.services;

	// Logged with both versions because the comparison is equality, not "newer
	// than": a pinned version below what a machine runs is a deliberate rollback,
	// and it should read as one rather than as an upgrade that quietly went
	// backwards.
	opts.log.info(
		{ machineId: opts.machine.id, from: opts.reported, to: target.version },
		'offering the agent an upgrade'
	);
	socketRegistry.sendToAgent({
		machineId: opts.machine.id,
		message: { type: 'upgrade', ...target, force: pendingUpgrades.take(opts.machine.id) }
	});
	socketRegistry.broadcastToUi({
		projectId: opts.machine.projectId,
		message: {
			type: 'machine.upgrading',
			machineId: opts.machine.id,
			from: opts.reported,
			to: target.version
		}
	});
}

export async function applyMachineFrame(opts: {
	fastify: FastifyInstance;
	machineId: string;
	socket: WebSocket;
	// When this socket was registered, not when the frame arrived: it is what
	// separates the work this connection was given from the work the one before it
	// took to its grave.
	connectedAt: Date;
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
				checks: opts.msg.checks
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

	// Before anything else this connection is told to do. Neither a bullet nor a
	// grill dies with the socket it was dispatched over, so `hello` is the only
	// place the two sides can agree on what survived — and a reconnect fast enough
	// to keep the registry slot means `handleClose` bailed and nobody settled
	// anything.
	if (opts.msg.type === 'hello') {
		opts.fastify.services.disconnectGrace.cancel(machine.id);
		await stallMachineRuns(schedulerDeps(opts.fastify), {
			machineId: machine.id,
			connectedAt: opts.connectedAt,
			heldRunIds: opts.msg.runIds
		});
		await stallMachinePlans({
			planRepo: opts.fastify.repos.planRepo,
			planTextService: opts.fastify.services.planTextService,
			socketRegistry,
			machineId: machine.id,
			connectedAt: opts.connectedAt,
			heldPlanIds: opts.msg.planIds
		});
	}

	// Offered only when the operator asked for it. A connect-triggered upgrade
	// would push a new build to every machine the moment it reconnects, which
	// turns one bad release into a fleet-wide outage with nobody having chosen it.
	if (opts.msg.type === 'hello' && opts.msg.reason === 'refresh') {
		await offerUpgrade({
			fastify: opts.fastify,
			machine,
			reported: opts.msg.agentVersion,
			log: opts.log
		});
	}

	// A queue created while its machine was offline has a row and no directory.
	// The ensure is idempotent, so re-sending it on every announce is what makes a
	// frame the machine never received self-correcting rather than a queue stuck
	// in `provisioning` with nothing left to retry it.
	if (opts.msg.type === 'hello') {
		const pending = await opts.fastify.repos.queueRepo.listProvisioningForMachine(machine.id);

		for (const queue of pending) {
			const profile = machine.projectProfile ?? DEFAULT_PROJECT_PROFILE;

			socketRegistry.sendToAgent({
				machineId: machine.id,
				message: {
					type: 'queue.worktree.ensure',
					queueId: queue.id,
					slug: queue.slug,
					setupCommand: profile.setupCommand
				}
			});
		}
	}

	// A paused machine that reconnects is still paused — the row outranks the
	// socket — so the agent is told again rather than left to infer from silence
	// that bosun is not dispatching to it.
	if (opts.msg.type === 'hello' && machine.status === 'paused') {
		socketRegistry.sendToAgent({ machineId: machine.id, message: { type: 'pause' } });
	}
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

// Planning plans are deliberately left alone here. The agent keeps its `claude`
// processes across a reconnect, so a close says nothing about whether a grill is
// still alive — `stallMachinePlans` settles that on the next `hello`, against
// what the agent says it still holds.
function handleClose(opts: {
	fastify: FastifyInstance;
	machineId: string;
	socket: WebSocket;
}): void {
	const { socketRegistry } = opts.fastify.services;

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
	// Not settled here. The agent keeps its `claude` processes across a reconnect,
	// so a close says nothing about whether the bullet on this machine is still
	// being built — settling on it failed live bullets for every proxy timeout and
	// every deploy. The window is cancelled by the `hello` that follows, which
	// settles the same work against the runs the agent says it still holds.
	opts.fastify.services.disconnectGrace.schedule({
		machineId: opts.machineId,
		settle: () => pauseMachineQueues(schedulerDeps(opts.fastify), { machineId: opts.machineId })
	});
}

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.get('/ws', { websocket: true }, (socket, request) => {
		const { machineId, projectId } = request.agent!;
		// Taken before the socket is registered, so a run dispatched over it can only
		// ever be newer than this instant — which is what lets `hello` tell the runs
		// this connection was handed from the ones the previous connection stranded.
		const connectedAt = new Date();

		fastify.services.socketRegistry.registerAgentSocket({ machineId, socket });
		const stopHeartbeat = startHeartbeat({
			socket,
			machineId,
			machineRepo: fastify.repos.machineRepo,
			log: request.log
		});
		const enqueue = createFrameQueue(request.log);

		socket.on('message', (raw: RawData) => {
			const msg = parseFrame({ raw: raw.toString(), machineId, log: request.log });

			if (!msg) {
				return;
			}

			const handle = async () =>
				handleAgentFrame({
					fastify,
					machineId,
					projectId,
					socket,
					connectedAt,
					msg,
					log: request.log
				});

			if (isPlanFrame(msg) || isExecFrame(msg)) {
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
