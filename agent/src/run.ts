import os from 'os';
import WebSocket, { type RawData } from 'ws';
import { type AgentConfig } from './config';
import { collectPreflight } from './preflight';
import { ServerMsgSchema } from './protocol';
import { terminateSelf } from './terminate';
import { AGENT_VERSION } from './version';

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const MAX_BACKOFF_STEPS = 5;

// A refused upgrade carrying a well-formed key means the credential was
// destroyed on purpose. Retrying cannot fix it, and retrying forever is how a
// deleted machine turns into a process that reconnects until someone notices.
class RevokedError extends Error {}

interface AgentState {
	paused: boolean;
}

function socketUrl(serverUrl: string): string {
	const url = new URL(serverUrl);

	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.pathname = '/agent/ws';

	return url.toString();
}

// Jittered, because an unjittered backoff brings every agent back at the same
// instant after the backend restarts.
function backoffDelay(attempt: number): number {
	const capped = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

	return Math.round(capped * (0.7 + Math.random() * 0.6));
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPreflight(socket: WebSocket, repoPath: string): Promise<void> {
	const checks = await collectPreflight(repoPath);

	if (socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify({ type: 'preflight', checks }));
	}
}

async function announce(socket: WebSocket, config: AgentConfig): Promise<void> {
	socket.send(
		JSON.stringify({
			type: 'hello',
			agentVersion: AGENT_VERSION,
			hostname: os.hostname(),
			repoPath: config.repoPath
		})
	);

	await sendPreflight(socket, config.repoPath);
}

async function handleServerFrame(opts: {
	socket: WebSocket;
	config: AgentConfig;
	configPath: string;
	state: AgentState;
	raw: RawData;
}): Promise<void> {
	let json: unknown;

	try {
		json = JSON.parse(opts.raw.toString());
	} catch {
		console.error('dropped unparseable frame from server');

		return;
	}

	const parsed = ServerMsgSchema.safeParse(json);

	if (!parsed.success) {
		console.error('dropped frame failing schema from server');

		return;
	}

	const msg = parsed.data;

	if (msg.type === 'ping') {
		opts.socket.send(JSON.stringify({ type: 'pong', id: msg.id, at: Date.now() }));

		return;
	}

	if (msg.type === 'refresh') {
		await sendPreflight(opts.socket, opts.config.repoPath);

		return;
	}

	if (msg.type === 'pause') {
		opts.state.paused = true;
		console.log('paused by bosun — holding the connection, taking no work');

		return;
	}

	if (msg.type === 'resume') {
		opts.state.paused = false;
		console.log('resumed by bosun');

		return;
	}

	await terminateSelf({ configPath: opts.configPath, reason: msg.reason });
}

async function connectOnce(opts: {
	config: AgentConfig;
	configPath: string;
	state: AgentState;
}): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const socket = new WebSocket(socketUrl(opts.config.serverUrl), {
			headers: { Authorization: `Bearer ${opts.config.machineKey}` }
		});
		let settled = false;

		const settle = (error?: Error) => {
			if (settled) {
				return;
			}

			settled = true;
			error ? reject(error) : resolve();
		};

		socket.on('open', () => {
			const paused = opts.state.paused ? ' (paused by bosun)' : '';

			console.log(`connected to ${opts.config.serverUrl}${paused}`);
			void announce(socket, opts.config);
		});

		socket.on('message', (raw: RawData) => {
			void handleServerFrame({
				socket,
				config: opts.config,
				configPath: opts.configPath,
				state: opts.state,
				raw
			});
		});

		socket.on('unexpected-response', (_req, res) => {
			settle(
				res.statusCode === 401
					? new RevokedError('this machine is no longer registered with bosun')
					: new Error(`server refused the connection (${res.statusCode})`)
			);
		});

		socket.on('error', (error) => {
			settle(error);
		});

		socket.on('close', () => {
			settle();
		});
	});
}

export async function run(opts: { config: AgentConfig; configPath: string }): Promise<never> {
	let attempt = 0;
	const state: AgentState = { paused: false };

	for (;;) {
		try {
			await connectOnce({ config: opts.config, configPath: opts.configPath, state });
			console.log('connection closed');
			attempt = 0;
		} catch (error) {
			if (error instanceof RevokedError) {
				await terminateSelf({ configPath: opts.configPath, reason: error.message });
			}

			console.error(error instanceof Error ? error.message : error);
		}

		const delay = backoffDelay(attempt);

		attempt = Math.min(attempt + 1, MAX_BACKOFF_STEPS);
		console.log(`reconnecting in ${Math.round(delay / 100) / 10}s`);
		await sleep(delay);
	}
}
