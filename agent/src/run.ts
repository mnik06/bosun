import os from 'os';
import WebSocket, { type RawData } from 'ws';
import { type AgentConfig } from './config';
import { collectPreflight } from './preflight';
import { ServerMsgSchema } from './protocol';
import { AGENT_VERSION } from './version';

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const MAX_BACKOFF_STEPS = 5;

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

async function announce(socket: WebSocket, config: AgentConfig): Promise<void> {
	socket.send(
		JSON.stringify({
			type: 'hello',
			agentVersion: AGENT_VERSION,
			hostname: os.hostname(),
			repoPath: config.repoPath
		})
	);

	const checks = await collectPreflight(config.repoPath);

	if (socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify({ type: 'preflight', checks }));
	}
}

function handleServerFrame(socket: WebSocket, raw: RawData): void {
	let json: unknown;

	try {
		json = JSON.parse(raw.toString());
	} catch {
		console.error('dropped unparseable frame from server');

		return;
	}

	const parsed = ServerMsgSchema.safeParse(json);

	if (!parsed.success) {
		console.error('dropped frame failing schema from server');

		return;
	}

	socket.send(JSON.stringify({ type: 'pong', id: parsed.data.id, at: Date.now() }));
}

async function connectOnce(config: AgentConfig): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const socket = new WebSocket(socketUrl(config.serverUrl), {
			headers: { Authorization: `Bearer ${config.machineKey}` }
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
			console.log(`connected to ${config.serverUrl}`);
			void announce(socket, config);
		});

		socket.on('message', (raw: RawData) => {
			handleServerFrame(socket, raw);
		});

		socket.on('unexpected-response', (_req, res) => {
			settle(new Error(`server refused the connection (${res.statusCode})`));
		});

		socket.on('error', (error) => {
			settle(error);
		});

		socket.on('close', () => {
			settle();
		});
	});
}

export async function run(config: AgentConfig): Promise<never> {
	let attempt = 0;

	for (;;) {
		try {
			await connectOnce(config);
			console.log('connection closed');
			attempt = 0;
		} catch (error) {
			console.error(error instanceof Error ? error.message : error);
		}

		const delay = backoffDelay(attempt);

		attempt = Math.min(attempt + 1, MAX_BACKOFF_STEPS);
		console.log(`reconnecting in ${Math.round(delay / 100) / 10}s`);
		await sleep(delay);
	}
}
