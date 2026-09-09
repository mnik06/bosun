import os from 'os';
import WebSocket, { type RawData } from 'ws';
import { backoffDelay, nextAttempt } from './backoff';
import { createFrameSink, type FrameSink } from './frame-sink';
import { UPGRADE_EXIT_CODE } from '../services/upgrade.service';
import { parseServerFrame, routeServerFrame, type AgentState } from './router';
import { type AgentConfig } from '../config/config';
import { createAskSessions } from '../ask/session';
import { createExecutionSessions, type ExecutionSessions } from '../execution/session';
import { createPlanningSessions } from '../planning/session';
import { planningPrompt, revisionPrompt } from '../prompts/planning';
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
	// Both outlive the connection, which is the point of them being passed in
	// rather than built here: see `holdConnection`.
	sink: FrameSink;
	executions: ExecutionSessions;
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
				runIds: [...new Set([...deps.executions.held(), ...deps.sink.pendingRunIds()])]
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
		// Dropped rather than queued, for the sessions below only: closing this
		// socket is also what kills them, so a replay would be reporting on
		// processes that no longer exist. Logged because a session settling into
		// silence otherwise leaves nothing anywhere saying so.
		const send = (message: AgentMsg): void => {
			if (socket.readyState !== WebSocket.OPEN) {
				console.error(`dropped ${message.type}: the connection is not open`);

				return;
			}

			socket.send(JSON.stringify(message));
		};

		// Planning and ask sessions are per-connection. A grill is answered over
		// this socket, so one that has gone cannot deliver an answer to a question
		// already in flight — keeping the process alive across a reconnect would
		// only leak it. Execution is the exception and is built in `holdConnection`:
		// an AFK bullet needs the socket to report, not to work.
		const sessions = createPlanningSessions({
			config: deps.config,
			services: deps.services,
			prompt: planningPrompt,
			revisionPrompt,
			send
		});
		const summaries = createSummarySessions({
			config: deps.config,
			services: deps.services,
			prompt: summaryPrompt
		});
		const asks = createAskSessions({ services: deps.services, send });
		const announce = createAnnouncer({ ...deps, socket });

		// Exits rather than restarting itself: `Restart=on-failure` is what brings
		// the unit back, now running the binary that was just swapped in.
		const onUpgrade = async (target: { version: string; downloadBaseUrl: string }) => {
			const decision = deps.services.upgrade.decide({
				current: AGENT_VERSION,
				target: target.version,
				sessionsRunning: sessions.running() + deps.executions.running()
			});

			console.log(`upgrade: ${decision.reason}`);

			if (!decision.proceed) {
				return;
			}

			try {
				await deps.services.upgrade.apply(target);
				console.log(`upgrade: installed ${target.version}, restarting`);
				process.exit(UPGRADE_EXIT_CODE);
			} catch (error) {
				console.error(`upgrade failed: ${error instanceof Error ? error.message : error}`);
			}
		};
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

		// `executions` is deliberately absent from both: a bullet is not cancelled by
		// the socket it happened to be dispatched over. Detaching parks its frames
		// until the next connection instead of throwing the session away.
		socket.on('error', (error) => {
			deps.sink.detach();
			sessions.cancelAll();
			summaries.cancelAll();
			asks.cancelAll();
			settle(error);
		});

		socket.on('close', () => {
			deps.sink.detach();
			sessions.cancelAll();
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

	for (;;) {
		try {
			await connectOnce({ ...opts, state, sink, executions });
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
