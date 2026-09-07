import os from 'os';
import WebSocket, { type RawData } from 'ws';
import { backoffDelay, nextAttempt } from './backoff';
import { UPGRADE_EXIT_CODE } from '../services/upgrade.service';
import { parseServerFrame, routeServerFrame, type AgentState } from './router';
import { type AgentConfig } from '../config/config';
import { createPlanningSessions } from '../planning/session';
import { planningPrompt } from '../prompts/planning';
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
				reason
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
		// Sessions are per-connection. A grill is answered over this socket, so one
		// that has gone cannot deliver an answer to a question already in flight —
		// keeping the process alive across a reconnect would only leak it.
		const sessions = createPlanningSessions({
			config: deps.config,
			services: deps.services,
			prompt: planningPrompt,
			send: (message: AgentMsg) => {
				if (socket.readyState === WebSocket.OPEN) {
					socket.send(JSON.stringify(message));
				}
			}
		});
		const announce = createAnnouncer({ ...deps, socket });

		// Exits rather than restarting itself: `Restart=on-failure` is what brings
		// the unit back, now running the binary that was just swapped in.
		const onUpgrade = async (target: { version: string; downloadBaseUrl: string }) => {
			const decision = deps.services.upgrade.decide({
				current: AGENT_VERSION,
				target: target.version,
				sessionsRunning: sessions.running()
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
			void announce('connect');
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

		socket.on('error', (error) => {
			sessions.cancelAll();
			settle(error);
		});

		socket.on('close', () => {
			sessions.cancelAll();
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

	for (;;) {
		try {
			await connectOnce({ ...opts, state });
			console.log('connection closed');
			attempt = 0;
		} catch (error) {
			if (error instanceof RevokedError) {
				await opts.services.systemd.terminateSelf({
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
