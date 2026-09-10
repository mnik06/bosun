import os from 'os';
import WebSocket, { type RawData } from 'ws';
import { backoffDelay, nextAttempt } from './backoff';
import { createFrameSink, type FrameSink } from './frame-sink';
import { UPGRADE_EXIT_CODE } from '../services/upgrade.service';

// A deferred upgrade lands within a sweep of the machine going idle.
const UPGRADE_SWEEP_MS = 15_000;
import { parseServerFrame, routeServerFrame, type AgentState } from './router';
import { type AgentConfig } from '../config/config';
import { createAskSessions } from '../ask/session';
import { createExecutionSessions, type ExecutionSessions } from '../execution/session';
import { createPlanningSessions, type PlanningSessions } from '../planning/session';
import { planningPrompt, revisionPrompt } from '../prompts/planning';
import { preparationPrompt } from '../prompts/preparation';
import { summaryPrompt } from '../prompts/summary';
import { createSummarySessions } from '../summary/session';
import { type AgentMsg } from '../protocol';
import { type Services } from '../services/index';
import { AGENT_VERSION } from '../version';

// A refused upgrade carrying a well-formed key means the credential was
// destroyed on purpose. Retrying cannot fix it, and retrying forever is how a
// deleted machine turns into a process that reconnects until someone notices.
class RevokedError extends Error {}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function socketUrl(serverUrl: string): string {
	const url = new URL(serverUrl);

	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.pathname = '/agent/ws';

	return url.toString();
}

interface ConnectionDeps {
	config: AgentConfig;
	configPath: string;
	services: Services;
	state: AgentState;
	// All three outlive the connection, which is the point of them being passed in
	// rather than built here: see `holdConnection`.
	sink: FrameSink;
	executions: ExecutionSessions;
	sessions: PlanningSessions;
}

// What `refresh` runs is deliberately the same thing `open` runs. Everything the
// agent reports is read from disk at this moment — the env file, the MCP config,
// the skills directories — so a token pasted in after the agent started, or a
// server added since, takes effect without a restart.
function createAnnouncer(deps: ConnectionDeps & { socket: WebSocket }) {
	return async function announce(reason: 'connect' | 'refresh'): Promise<void> {
		if (deps.socket.readyState !== WebSocket.OPEN) {
			return;
		}

		// `markOnline` leaves a paused row paused, so re-announcing cannot silently
		// un-pause a machine.
		deps.socket.send(
			JSON.stringify({
				type: 'hello',
				agentVersion: AGENT_VERSION,
				hostname: os.hostname(),
				repoPath: deps.config.repoPath,
				reason,
				// Every run whose outcome this agent is still going to report: the ones
				// it is building, and the ones that settled while the connection was
				// down and are parked in the sink. A reconnect is otherwise
				// indistinguishable from an agent that came back with nothing, and the
				// backend settles every run it cannot account for — which would reset
				// the very sessions this connection was opened to keep reporting on.
				runIds: [...new Set([...deps.executions.held(), ...deps.sink.pendingRunIds()])],
				// The grills this agent is still holding, for the same reason: a
				// planning session outlives the socket it was started on, and a backend
				// that failed every `planning` plan on a reconnect would kill the grill
				// the person is in the middle of answering.
				planIds: [...new Set([...deps.sessions.held(), ...deps.sink.pendingPlanIds()])]
			})
		);

		const checks = await deps.services.preflight.collect();

		// Also logged, not only sent: preflight results otherwise exist solely in the
		// browser, and the person debugging a red check is usually on the box reading
		// journalctl.
		for (const check of checks.filter((entry) => !entry.ok)) {
			console.error(`preflight ${check.name}: ${check.detail ?? 'failed'}`);
		}

		if (deps.socket.readyState === WebSocket.OPEN) {
			deps.socket.send(JSON.stringify({ type: 'preflight', checks }));
		}
	};
}

async function connectOnce(deps: ConnectionDeps): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const socket = new WebSocket(socketUrl(deps.config.serverUrl), {
			headers: { Authorization: `Bearer ${deps.config.machineKey}` }
		});
		// Dropped rather than queued, for the per-connection senders only — ask
		// sessions and the upgrade handshake. Both are answers to something this
		// socket asked for, so replaying one on the next connection would be
		// answering a question nobody is waiting on. Everything that outlives the
		// connection sends through the sink instead.
		const send = (message: AgentMsg): void => {
			if (socket.readyState !== WebSocket.OPEN) {
				console.error(`dropped ${message.type}: the connection is not open`);

				return;
			}

			socket.send(JSON.stringify(message));
		};

		const { sessions } = deps;
		const summaries = createSummarySessions({
			config: deps.config,
			services: deps.services,
			prompt: summaryPrompt
		});
		const asks = createAskSessions({ services: deps.services, send });
		const announce = createAnnouncer({ ...deps, socket });

		// Exits rather than restarting itself: `Restart=on-failure` is what brings
		// the unit back, now running the binary that was just swapped in.
		// Held when the machine is busy rather than dropped. Without it a deferral is
		// a dead end: the operator presses Refresh, nothing happens, and they have to
		// guess when the machine is free and press again.
		let pendingUpgrade: { version: string; downloadBaseUrl: string; force: boolean } | null =
			null;

		const sessionsRunning = (): number => sessions.running() + deps.executions.running();

		const install = async (target: {
			version: string;
			downloadBaseUrl: string;
			force: boolean;
		}): Promise<void> => {
			// The warm sessions are ended before the swap, not left to be orphaned:
			// they are detached processes, so exiting without this leaves a `claude`
			// per idle grill running against a worktree with nobody listening.
			sessions.endIdle();

			try {
				await deps.services.upgrade.apply(target);

				// After the install, never before: a version cleared from the block
				// list by an attempt that then failed to download would be offered
				// again on the next refresh with nothing having changed.
				if (target.force) {
					deps.services.upgrade.unblock(target.version);
				}

				console.log(`upgrade: installed ${target.version}, restarting`);
				process.exit(UPGRADE_EXIT_CODE);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				console.error(`upgrade failed: ${message}`);
				send({
					type: 'upgrade.declined',
					version: target.version,
					reason: `install failed: ${message}`,
					retryable: true,
					queued: false
				});
			}
		};

		// Exits rather than restarting itself: `Restart=on-failure` is what brings
		// the unit back, now running the binary that was just swapped in.
		const onUpgrade = async (target: {
			version: string;
			downloadBaseUrl: string;
			force: boolean;
		}) => {
			const decision = deps.services.upgrade.decide({
				current: AGENT_VERSION,
				target: target.version,
				sessionsRunning: sessionsRunning(),
				force: target.force
			});

			console.log(`upgrade: ${decision.reason}`);

			if (decision.proceed) {
				await install(target);

				return;
			}

			// A newer offer replaces an older one: whatever is waiting should be the
			// version the backend last said was current.
			pendingUpgrade = decision.deferred ? target : null;

			// Said out loud, not just logged. The operator pressed a button and the
			// only place the answer used to appear was a file on this box.
			send({
				type: 'upgrade.declined',
				version: target.version,
				reason: decision.reason,
				retryable: decision.retryable,
				queued: decision.deferred
			});
		};

		// Polled rather than pushed from the places a session ends: several paths
		// finish one — a result, an error, a cancel, a reap — and a callback wired
		// into each is a callback the next one forgets. The cost of being up to a
		// sweep late is nothing next to an upgrade that never lands.
		const upgradeSweep = setInterval(() => {
			const target = pendingUpgrade;

			if (target === null || sessionsRunning() > 0) {
				return;
			}

			pendingUpgrade = null;
			console.log(`upgrade: the machine is idle — installing ${target.version} now`);
			void install(target);
		}, UPGRADE_SWEEP_MS);

		upgradeSweep.unref();

		let settled = false;

		const settle = (error?: Error) => {
			if (settled) {
				return;
			}

			settled = true;
			error ? reject(error) : resolve();
		};

		socket.on('open', () => {
			const paused = deps.state.paused ? ' (paused by bosun)' : '';

			console.log(`connected to ${deps.config.serverUrl}${paused}`);
			deps.services.upgrade.clearProbation();
			// Announced before the sink is attached, and `announce` sends `hello`
			// before its first await, so the backend learns which runs survived
			// before any frame buffered during the outage arrives to describe one.
			void announce('connect');
			deps.sink.attach((message: AgentMsg) => {
				socket.send(JSON.stringify(message));
			});
		});

		socket.on('message', (raw: RawData) => {
			const msg = parseServerFrame(raw.toString());

			if (!msg) {
				return;
			}

			void routeServerFrame(
				{
					socket,
					services: deps.services,
					configPath: deps.configPath,
					state: deps.state,
					sessions,
					executions: deps.executions,
					summaries,
					asks,
					announce,
					onUpgrade
				},
				msg
			);
		});

		socket.on('unexpected-response', (_req, res) => {
			settle(
				res.statusCode === 401
					? new RevokedError('this machine is no longer registered with bosun')
					: new Error(`server refused the connection (${res.statusCode})`)
			);
		});

		// `executions` and `sessions` are deliberately absent from both: neither a
		// bullet nor a grill is cancelled by the socket it happened to be dispatched
		// over. Detaching parks their frames until the next connection instead of
		// throwing the session away.
		socket.on('error', (error) => {
			clearInterval(upgradeSweep);
			deps.sink.detach();
			summaries.cancelAll();
			asks.cancelAll();
			settle(error);
		});

		socket.on('close', () => {
			deps.sink.detach();
			summaries.cancelAll();
			asks.cancelAll();
			settle();
		});
	});
}

export async function holdConnection(opts: {
	config: AgentConfig;
	configPath: string;
	services: Services;
}): Promise<never> {
	let attempt = 0;
	const state: AgentState = { paused: false };
	// Outside the loop, which is the whole fix: a bullet is not tied to the socket
	// it was dispatched over. `claude` keeps building through a backend deploy, and
	// the sessions map plus the frames they produced while nothing was listening
	// have to still be here when the connection comes back.
	const sink = createFrameSink();
	const executions = createExecutionSessions({ services: opts.services, send: sink.send });
	// A grill is a conversation with a person, and a person does not stop being in
	// the middle of one because a proxy dropped an idle socket or the backend
	// deployed. The session survives the gap and reports on whatever connection is
	// current; `hello` names the ones it still holds so the backend can settle the
	// rest.
	const sessions = createPlanningSessions({
		config: opts.config,
		services: opts.services,
		prompt: planningPrompt,
		revisionPrompt,
		preparationPrompt,
		send: sink.send
	});

	// The children are detached so cancelling reaps their process groups, which
	// also means nothing reaps them when this process is stopped. That was
	// tolerable while a grill died with its socket; a session that now survives
	// reconnects would otherwise leave a `claude` holding a port, a worktree and a
	// credential behind every `systemctl restart`.
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => {
			sessions.cancelAll();
			executions.cancelAll();
			process.exit(0);
		});
	}

	for (;;) {
		try {
			await connectOnce({ ...opts, state, sink, executions, sessions });
			console.log('connection closed');
			attempt = 0;
		} catch (error) {
			if (error instanceof RevokedError) {
				await opts.services.teardown.terminateSelf({
					configPath: opts.configPath,
					reason: error.message
				});
			}

			console.error(error instanceof Error ? error.message : error);
		}

		const delay = backoffDelay(attempt);

		attempt = nextAttempt(attempt);
		console.log(`reconnecting in ${Math.round(delay / 100) / 10}s`);
		await sleep(delay);
	}
}
