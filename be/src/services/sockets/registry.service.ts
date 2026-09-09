import { type WebSocket } from '@fastify/websocket';
import { type ServerMsg, type UiMsg } from 'src/types/protocol';

export function getSocketRegistry() {
	const agentSockets = new Map<string, WebSocket>();

	// Keyed by project rather than one flat set: filtering at the point of send is
	// a check that can be forgotten, and forgetting it puts one tenant's machines
	// on another tenant's screen. Every member of a project shares a key, which is
	// the whole point — they are looking at the same machines.
	const uiSockets = new Map<string, Set<WebSocket>>();

	// Plan frames are high-volume and belong to one open chat, so they go to the
	// sockets watching that plan rather than to every tab the owner has open.
	// The reverse index exists so closing a socket costs one lookup instead of a
	// scan of every plan anyone is watching.
	const planSubscribers = new Map<string, Set<WebSocket>>();
	const socketPlans = new Map<WebSocket, Set<string>>();

	// Which person is behind each browser socket. Only ever read to hang up on a
	// member who has been removed — fan-out is by project, never by person.
	const socketOwners = new Map<WebSocket, string>();

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

		addUiSocket(opts: { projectId: string; userId: string; socket: WebSocket }): void {
			const sockets = uiSockets.get(opts.projectId) ?? new Set<WebSocket>();

			sockets.add(opts.socket);
			uiSockets.set(opts.projectId, sockets);
			socketOwners.set(opts.socket, opts.userId);
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

		removeUiSocket(opts: { projectId: string; socket: WebSocket }): void {
			for (const planId of socketPlans.get(opts.socket) ?? []) {
				dropPlanSubscriber({ planId, socket: opts.socket });
			}

			socketPlans.delete(opts.socket);
			socketOwners.delete(opts.socket);

			const sockets = uiSockets.get(opts.projectId);

			if (!sockets) {
				return;
			}

			sockets.delete(opts.socket);

			// Without this the map keeps one empty Set per project that has ever had a
			// tab open, which never shrinks for the life of the process.
			if (sockets.size === 0) {
				uiSockets.delete(opts.projectId);
			}
		},

		broadcastToPlan(opts: { planId: string; message: UiMsg }): void {
			broadcast({ sockets: planSubscribers.get(opts.planId), message: opts.message });
		},

		broadcastToUi(opts: { projectId: string; message: UiMsg }): void {
			broadcast({ sockets: uiSockets.get(opts.projectId), message: opts.message });
		},

		// A socket outlives the membership that authorized it, and there is no
		// per-frame recheck. Without this an ex-member keeps receiving the project's
		// frames until they happen to close the tab.
		closeUiSocketsForMember(opts: { projectId: string; userId: string }): void {
			for (const socket of uiSockets.get(opts.projectId) ?? []) {
				if (socketOwners.get(socket) === opts.userId) {
					socket.terminate();
				}
			}
		}
	};
}

export type SocketRegistry = ReturnType<typeof getSocketRegistry>;
