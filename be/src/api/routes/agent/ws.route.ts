import { type WebSocket } from '@fastify/websocket';
import { type RawData } from 'ws';
import { FastifyBaseLogger, FastifyInstance, FastifyPluginAsync } from 'fastify';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { markMachineOffline } from 'src/controllers/machines/mark-machine-offline';
import { markMachineOnline } from 'src/controllers/machines/mark-machine-online';
import { reconcileRepository } from 'src/controllers/machines/reconcile-repository';
import { saveMachinePreflight } from 'src/controllers/machines/save-machine-preflight';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { machineOfflineDeps, notifyMachineOffline } from 'src/controllers/machines/shared/notify-offline';
import { machineOnlineDeps, notifyMachineOnline } from 'src/controllers/machines/shared/notify-online';
import { lineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { resendWorktrees } from 'src/controllers/line/shared/dispatch';
import { pauseMachineBuilds, stallMachineBuilds } from 'src/controllers/line/stall-machine-builds';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { stallMachineOnboarding } from 'src/controllers/onboarding/stall-machine-onboarding';
import { saveConfigOnDefault } from 'src/controllers/repositories/save-config-on-default';
import { stallMachinePlans } from 'src/controllers/plans/stall-machine-plans';
import { type Machine } from 'src/types/MachineSchema';
import { AgentMsgSchema, type AgentMsg } from 'src/types/protocol';
import { handleAgentFrame, isOrderedFrame } from 'src/api/routes/agent/frame-router';

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;
// `lastSeenAt` is what tells a live machine from one whose socket died without a
// close frame, so it has to move while nothing else is happening — but a write
// per machine per pong is a write every 15 seconds for a column read by eye.
// A minute of resolution answers the question; the rest is load.
const TOUCH_MS = 60_000;

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

async function settleHello(opts: {
	fastify: FastifyInstance;
	machine: Machine;
	connectedAt: Date;
	msg: Extract<AgentMsg, { type: 'hello' }>;
}): Promise<void> {
	const { fastify, machine, msg } = opts;
	const socketRegistry = fastify.services.socketRegistry;

	fastify.services.disconnectGrace.cancel(machine.id);
	// Recorded before anything this connection carries next can settle a run and
	// schedule the machine's next bullet against it.
	fastify.services.machineMemory.set(machine.id, msg.memory);
	await stallMachineBuilds(lineDeps(fastify), {
		machineId: machine.id,
		connectedAt: opts.connectedAt,
		heldRunIds: msg.runIds,
		heldIntegrationIds: msg.integrationIds,
		uptimeMs: msg.uptimeMs,
		previousExit: msg.previousExit
	});
	await stallMachinePlans({
		planRepo: fastify.repos.planRepo,
		planTextService: fastify.services.planTextService,
		notificationRepo: fastify.repos.notificationRepo,
		pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo,
		projectMemberRepo: fastify.repos.projectMemberRepo,
		idService: fastify.services.idService,
		webPush: fastify.services.webPush,
		appUrl: fastify.env.PUBLIC_APP_URL,
		socketRegistry,
		machineId: machine.id,
		connectedAt: opts.connectedAt,
		heldPlanIds: msg.planIds
	});
	await saveConfigOnDefault({
		repositoryRepo: fastify.repos.repositoryRepo,
		socketRegistry,
		machine,
		reportedRepositoryId: msg.repositoryId,
		configOnDefault: msg.configOnDefault
	});
	await reconcileRepository({
		repositoryRepo: fastify.repos.repositoryRepo,
		githubInstallationRepo: fastify.repos.githubInstallationRepo,
		azureConnectionRepo: fastify.repos.azureConnectionRepo,
		githubApp: fastify.services.githubApp,
		socketRegistry,
		machine,
		reportedRepositoryId: msg.repositoryId
	});
	await stallMachineOnboarding(onboardingDeps(fastify), {
		machineId: machine.id,
		projectId: machine.projectId,
		connectedAt: opts.connectedAt,
		heldRunIds: msg.onboardingRunIds
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

	let machine: Machine | null;
	// True only on a real offline/pending→online flip: a `refresh`/`change` hello
	// arriving while the row already said `online` leaves this false.
	let justReconnected = false;

	if (opts.msg.type === 'hello') {
		const result = await markMachineOnline({
			machineRepo,
			id: opts.machineId,
			agentVersion: opts.msg.agentVersion,
			repoPath: opts.msg.repoPath,
			publicKey: opts.msg.publicKey,
			clonedRepositoryId: opts.msg.repositoryId,
			envSets: opts.msg.envSets,
			sessionSecrets: opts.msg.sessionSecrets
		});

		machine = result?.machine ?? null;
		justReconnected = result !== null && !result.wasOnline;
	} else {
		machine = await saveMachinePreflight({
			machineRepo,
			id: opts.machineId,
			checks: opts.msg.checks
		});
	}

	// The row can disappear mid-session: deleting the owner's account cascades to
	// their machines. Leaving the socket up would keep a machine nobody can reach
	// registered and counted as connected.
	if (!machine) {
		opts.log.warn({ machineId: opts.machineId }, 'machine row is gone; evicting agent socket');
		opts.socket.terminate();

		return;
	}

	announceMachine({ socketRegistry, machine });

	// Before anything else this connection is told to do. Neither a bullet nor a
	// grill dies with the socket it was dispatched over, so `hello` is the only
	// place the two sides can agree on what survived — and a reconnect fast enough
	// to keep the registry slot means `handleClose` bailed and nobody settled
	// anything.
	if (opts.msg.type === 'hello') {
		await settleHello({ fastify: opts.fastify, machine, connectedAt: opts.connectedAt, msg: opts.msg });
	}

	// Runs after `settleHello` so the held/unfinished counts reflect what this
	// reconnect actually resolved, not a stale pre-reconnect snapshot. A `paused`
	// row stays paused through `markOnline` regardless of this flip, so it is
	// excluded here rather than being able to read as a reconnect worth telling
	// anyone about.
	if (opts.msg.type === 'hello' && justReconnected && machine.status !== 'paused') {
		await notifyMachineOnline(machineOnlineDeps(opts.fastify), { machine });
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

	// Not on `change`: those follow a file under ~/.bosun being written, arrive in
	// bursts, and re-sending an ensure for a worktree still installing is how a
	// second setup ends up racing the first. A machine back online also picks up
	// whatever its line has been waiting to give it.
	if (opts.msg.type === 'hello' && opts.msg.reason !== 'change') {
		await resendWorktrees(lineDeps(opts.fastify), { machine });
		await scheduleMachine(lineDeps(opts.fastify), { machineId: machine.id });
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
// pongs stay off this queue: nothing about them is ordered.
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
	}).then(async (machine) => {
		if (!machine) {
			return;
		}

		announceMachine({ socketRegistry, machine });
		await notifyMachineOffline(machineOfflineDeps(opts.fastify), { machine });
	});
	// Not settled here. The agent keeps its `claude` processes across a reconnect,
	// so a close says nothing about whether the bullet on this machine is still
	// being built — settling on it failed live bullets for every proxy timeout and
	// every deploy. The window is cancelled by the `hello` that follows, which
	// settles the same work against the runs the agent says it still holds.
	opts.fastify.services.disconnectGrace.schedule({
		machineId: opts.machineId,
		settle: () => pauseMachineBuilds(lineDeps(opts.fastify), { machineId: opts.machineId })
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

			if (isOrderedFrame(msg)) {
				enqueue(handle);

				return;
			}

			// A rejection nobody awaits takes the whole process down, and the agent's
			// reconnect replays the same frame into the restarted one.
			void handle().catch((error: unknown) => request.log.error({ error, machineId, type: msg.type }, 'failed handling an agent frame'));
		});

		socket.on('close', () => {
			stopHeartbeat();
			handleClose({ fastify, machineId, socket });
		});
	});
};

export default routes;
