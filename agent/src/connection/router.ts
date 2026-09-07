import WebSocket from 'ws';
import { type PlanningSessions } from '../planning/session';
import { ServerMsgSchema, type ServerMsg } from '../protocol';
import { type Services } from '../services/index';

export interface AgentState {
	paused: boolean;
}

export function parseServerFrame(raw: string): ServerMsg | null {
	let json: unknown;

	try {
		json = JSON.parse(raw);
	} catch {
		console.error('dropped unparseable frame from server');

		return null;
	}

	const parsed = ServerMsgSchema.safeParse(json);

	if (!parsed.success) {
		console.error('dropped frame failing schema from server');

		return null;
	}

	return parsed.data;
}

export interface RouterDeps {
	socket: WebSocket;
	services: Services;
	configPath: string;
	state: AgentState;
	sessions: PlanningSessions;
	announce: () => Promise<void>;
}

// A switch rather than a chain with a fallthrough: the chain's last branch was
// `shutdown`, so every frame type added to the union terminated the agent until
// somebody remembered to add a case for it.
export async function routeServerFrame(deps: RouterDeps, msg: ServerMsg): Promise<void> {
	switch (msg.type) {
		case 'ping':
			deps.socket.send(JSON.stringify({ type: 'pong', id: msg.id, at: Date.now() }));

			return;

		case 'refresh':
			await deps.announce();

			return;

		case 'pause':
			deps.state.paused = true;
			console.log('paused by bosun — holding the connection, taking no work');

			return;

		case 'resume':
			deps.state.paused = false;
			console.log('resumed by bosun');

			return;

		case 'plan.start':
			if (deps.state.paused) {
				deps.socket.send(
					JSON.stringify({
						type: 'plan.error',
						planId: msg.planId,
						message: 'this machine is paused'
					})
				);

				return;
			}

			await deps.sessions.start({ planId: msg.planId, input: msg.input });

			return;

		case 'plan.answer':
			deps.sessions.answer(msg);

			return;

		case 'plan.cancel':
			deps.sessions.cancel(msg.planId);

			return;

		case 'shutdown':
			deps.sessions.cancelAll();
			await deps.services.systemd.terminateSelf({
				configPath: deps.configPath,
				reason: msg.reason
			});
	}
}
