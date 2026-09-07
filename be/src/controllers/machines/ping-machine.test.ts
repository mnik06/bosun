import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pingMachine } from 'src/controllers/machines/ping-machine';
import { getIdService } from 'src/services/ids/id.service';
import { getPendingPingsService } from 'src/services/sockets/pending-pings.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine, type MachineStatus } from 'src/types/MachineSchema';

const OPEN = 1;

function fakeSocket() {
	return { OPEN, readyState: OPEN, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as unknown as
		WebSocket & { send: ReturnType<typeof vi.fn> };
}

function machine(status: MachineStatus): Machine {
	return {
		id: 'm_1',
		userId: 'u_alice',
		name: 'vps-1',
		status,
		lastSeenAt: null,
		repoPath: null,
		agentVersion: null,
		capabilities: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z')
	};
}

let socketRegistry: SocketRegistry;

beforeEach(() => {
	socketRegistry = getSocketRegistry();
});

function connect() {
	const socket = fakeSocket();

	socketRegistry.registerAgentSocket({ machineId: 'm_1', socket });

	return socket;
}

function ping(status: MachineStatus) {
	return pingMachine({
		idService: getIdService(),
		pendingPings: getPendingPingsService(),
		socketRegistry,
		machine: machine(status)
	});
}

describe('pingMachine', () => {
	it('sends a ping frame to a connected machine', () => {
		const socket = connect();
		const { commandId } = ping('online');

		expect(commandId).toMatch(/^cmd_/);
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', id: commandId }));
	});

	// Pause is only worth anything if every dispatch path consults it, and the
	// order matters: a paused machine is usually still connected, so reporting
	// "machine offline" would send an operator looking at the wrong thing.
	it('refuses a paused machine before it looks at reachability', () => {
		const socket = connect();

		expect(() => ping('paused')).toThrowError('machine paused');
		expect(socket.send).not.toHaveBeenCalled();
	});

	it('refuses a machine with no socket', () => {
		expect(() => ping('online')).toThrowError('machine offline');
	});
});
