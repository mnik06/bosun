import { type WebSocket } from '@fastify/websocket';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingMachine } from 'src/controllers/machines/ping-machine';
import {
	registerAgentSocket,
	unregisterAgentSocket
} from 'src/services/sockets/registry.service';
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

let connected: ReturnType<typeof fakeSocket> | null = null;

function connect() {
	connected = fakeSocket();
	registerAgentSocket({ machineId: 'm_1', socket: connected });

	return connected;
}

afterEach(() => {
	if (connected) {
		unregisterAgentSocket({ machineId: 'm_1', socket: connected });
		connected = null;
	}
});

describe('pingMachine', () => {
	it('sends a ping frame to a connected machine', () => {
		const socket = connect();
		const { commandId } = pingMachine({ machine: machine('online') });

		expect(commandId).toMatch(/^cmd_/);
		expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', id: commandId }));
	});

	// Pause is only worth anything if every dispatch path consults it, and the
	// order matters: a paused machine is usually still connected, so reporting
	// "machine offline" would send an operator looking at the wrong thing.
	it('refuses a paused machine before it looks at reachability', () => {
		const socket = connect();

		expect(() => pingMachine({ machine: machine('paused') })).toThrowError('machine paused');
		expect(socket.send).not.toHaveBeenCalled();
	});

	it('refuses a machine with no socket', () => {
		expect(() => pingMachine({ machine: machine('online') })).toThrowError('machine offline');
	});
});
