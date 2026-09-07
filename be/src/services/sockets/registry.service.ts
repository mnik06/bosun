import { type WebSocket } from '@fastify/websocket';
import { type ServerMsg, type UiMsg } from 'src/types/protocol';

export function getSocketRegistry() {
	const agentSockets = new Map<string, WebSocket>();

	// Keyed by owner rather than one flat set: filtering at the point of send is a
	// check that can be forgotten, and forgetting it puts one account's machines on
	// another account's screen.
	const uiSockets = new Map<string, Set<WebSocket>>();

	// Plan frames are high-volume and belong to one open chat, so they go to the
	// sockets watching that plan rather than to every tab the owner has open.
	// The reverse index exists so closing a socket costs one lookup instead of a
	// scan of every plan anyone is watching.
	const planSubscribers = new Map<string, Set<WebSocket>>();
	const socketPlans = new Map<WebSocket, Set<string>>();

	function dropPlanSubscriber(opts: { planId: string; socket: WebSocket }): void {
		const subscribers = planSubscribers.get(opts.planId);

		if (!subscribers) {
			return;
		}

		subscribers.delete(opts.socket);

		if (subscribers.size === 0) {
			planSubscribers.delete(opts.planId);
		}
	}

	function broadcast(opts: { sockets: Set<WebSocket> | undefined; message: UiMsg }): void {
		if (!opts.sockets) {
			return;
		}

		const payload = JSON.stringify(opts.message);

		for (const socket of opts.sockets) {
			if (socket.readyState === socket.OPEN) {
				socket.send(payload);
			}
		}
	}

	return {
		registerAgentSocket(opts: { machineId: string; socket: WebSocket }): void {
			const existing = agentSockets.get(opts.machineId);

			// A reconnect while the previous socket is still held would leave the machine
			// online forever and send every command into a pipe nobody is reading.
			if (existing && existing !== opts.socket) {
				existing.terminate();
			}

			agentSockets.set(opts.machineId, opts.socket);
		},

		unregisterAgentSocket(opts: { machineId: string; socket: WebSocket }): boolean {
			// A newer connection may already hold the slot: its close event arrives after
			// the replacement was registered, and must not evict the live socket.
			if (agentSockets.get(opts.machineId) !== opts.socket) {
				return false;
			}

			agentSockets.delete(opts.machineId);

			return true;
		},

		getAgentSocket(machineId: string): WebSocket | null {
			return agentSockets.get(machineId) ?? null;
		},

		// Returns false when the machine is not reachable, so every caller has to decide
		// what an undelivered command means instead of firing into a closed socket.
		sendToAgent(opts: { machineId: string; message: ServerMsg }): boolean {
			const socket = agentSockets.get(opts.machineId);

			if (!socket || socket.readyState !== socket.OPEN) {
				return false;
			}

			socket.send(JSON.stringify(opts.message));

			return true;
		},

		addUiSocket(opts: { userId: string; socket: WebSocket }): void {
			const sockets = uiSockets.get(opts.userId) ?? new Set<WebSocket>();

			sockets.add(opts.socket);
			uiSockets.set(opts.userId, sockets);
		},

		subscribeUiToPlan(opts: { planId: string; socket: WebSocket }): void {
			const subscribers = planSubscribers.get(opts.planId) ?? new Set<WebSocket>();

			subscribers.add(opts.socket);
			planSubscribers.set(opts.planId, subscribers);

			const plans = socketPlans.get(opts.socket) ?? new Set<string>();

			plans.add(opts.planId);
			socketPlans.set(opts.socket, plans);
		},

		unsubscribeUiFromPlan(opts: { planId: string; socket: WebSocket }): void {
			dropPlanSubscriber(opts);

			const plans = socketPlans.get(opts.socket);

			if (!plans) {
				return;
			}

			plans.delete(opts.planId);

			if (plans.size === 0) {
				socketPlans.delete(opts.socket);
			}
		},

		removeUiSocket(opts: { userId: string; socket: WebSocket }): void {
			for (const planId of socketPlans.get(opts.socket) ?? []) {
				dropPlanSubscriber({ planId, socket: opts.socket });
			}

			socketPlans.delete(opts.socket);

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
		},

		broadcastToPlan(opts: { planId: string; message: UiMsg }): void {
			broadcast({ sockets: planSubscribers.get(opts.planId), message: opts.message });
		},

		broadcastToUi(opts: { userId: string; message: UiMsg }): void {
			broadcast({ sockets: uiSockets.get(opts.userId), message: opts.message });
		}
	};
}

export type SocketRegistry = ReturnType<typeof getSocketRegistry>;
