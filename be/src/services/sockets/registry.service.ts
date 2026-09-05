import { type WebSocket } from '@fastify/websocket';
import { type UiMsg } from 'src/types/protocol';

const agentSockets = new Map<string, WebSocket>();
const uiSockets = new Set<WebSocket>();

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

export function addUiSocket(socket: WebSocket): void {
	uiSockets.add(socket);
}

export function removeUiSocket(socket: WebSocket): void {
	uiSockets.delete(socket);
}

export function broadcastToUi(message: UiMsg): void {
	const payload = JSON.stringify(message);

	for (const socket of uiSockets) {
		if (socket.readyState === socket.OPEN) {
			socket.send(payload);
		}
	}
}
