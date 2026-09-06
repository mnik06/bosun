import { type WebSocket } from '@fastify/websocket';
import { type ServerMsg, type UiMsg } from 'src/types/protocol';

const agentSockets = new Map<string, WebSocket>();

// Keyed by owner rather than one flat set: filtering at the point of send is a
// check that can be forgotten, and forgetting it puts one account's machines on
// another account's screen.
const uiSockets = new Map<string, Set<WebSocket>>();

export function registerAgentSocket(opts: { machineId: string; socket: WebSocket }): void {
	const existing = agentSockets.get(opts.machineId);

	// A reconnect while the previous socket is still held would leave the machine
	// online forever and send every command into a pipe nobody is reading.
	if (existing && existing !== opts.socket) {
		existing.terminate();
	}

	agentSockets.set(opts.machineId, opts.socket);
}

export function unregisterAgentSocket(opts: { machineId: string; socket: WebSocket }): boolean {
	// A newer connection may already hold the slot: its close event arrives after
	// the replacement was registered, and must not evict the live socket.
	if (agentSockets.get(opts.machineId) !== opts.socket) {
		return false;
	}

	agentSockets.delete(opts.machineId);

	return true;
}

export function getAgentSocket(machineId: string): WebSocket | null {
	return agentSockets.get(machineId) ?? null;
}

// Returns false when the machine is not reachable, so every caller has to decide
// what an undelivered command means instead of firing into a closed socket.
export function sendToAgent(opts: { machineId: string; message: ServerMsg }): boolean {
	const socket = agentSockets.get(opts.machineId);

	if (!socket || socket.readyState !== socket.OPEN) {
		return false;
	}

	socket.send(JSON.stringify(opts.message));

	return true;
}

export function addUiSocket(opts: { userId: string; socket: WebSocket }): void {
	const sockets = uiSockets.get(opts.userId) ?? new Set<WebSocket>();

	sockets.add(opts.socket);
	uiSockets.set(opts.userId, sockets);
}

export function removeUiSocket(opts: { userId: string; socket: WebSocket }): void {
	const sockets = uiSockets.get(opts.userId);

	if (!sockets) {
		return;
	}

	sockets.delete(opts.socket);

	// Without this the map keeps one empty Set per account that has ever opened a
	// tab, which never shrinks for the life of the process.
	if (sockets.size === 0) {
		uiSockets.delete(opts.userId);
	}
}

export function broadcastToUi(opts: { userId: string; message: UiMsg }): void {
	const sockets = uiSockets.get(opts.userId);

	if (!sockets) {
		return;
	}

	const payload = JSON.stringify(opts.message);

	for (const socket of sockets) {
		if (socket.readyState === socket.OPEN) {
			socket.send(payload);
		}
	}
}
