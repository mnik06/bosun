import { type WebSocket } from '@fastify/websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addUiSocket, broadcastToUi, removeUiSocket } from 'src/services/sockets/registry.service';
import { type UiMsg } from 'src/types/protocol';

const OPEN = 1;
const CLOSED = 3;

function fakeSocket(readyState = OPEN) {
	return { OPEN, readyState, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

const message: UiMsg = { type: 'machine.pong', machineId: 'm_1', id: 'cmd_1', rttMs: 12 };

let alice: ReturnType<typeof fakeSocket>;
let bob: ReturnType<typeof fakeSocket>;

beforeEach(() => {
	alice = fakeSocket();
	bob = fakeSocket();
	addUiSocket({ userId: 'u_alice', socket: alice });
	addUiSocket({ userId: 'u_bob', socket: bob });
});

afterEach(() => {
	removeUiSocket({ userId: 'u_alice', socket: alice });
	removeUiSocket({ userId: 'u_bob', socket: bob });
});

describe('browser fan-out', () => {
	// The whole point of the per-user map: a frame carries a full machine row, so
	// reaching the wrong socket is a data leak, not a cosmetic bug.
	it('delivers only to the sockets of the named account', () => {
		broadcastToUi({ userId: 'u_alice', message });

		expect(alice.send).toHaveBeenCalledWith(JSON.stringify(message));
		expect(bob.send).not.toHaveBeenCalled();
	});

	it('delivers to every socket the account has open', () => {
		const secondTab = fakeSocket();

		addUiSocket({ userId: 'u_alice', socket: secondTab });
		broadcastToUi({ userId: 'u_alice', message });

		expect(alice.send).toHaveBeenCalledOnce();
		expect(secondTab.send).toHaveBeenCalledOnce();

		removeUiSocket({ userId: 'u_alice', socket: secondTab });
	});

	it('does nothing for an account with no sockets', () => {
		expect(() => broadcastToUi({ userId: 'u_nobody', message })).not.toThrow();
		expect(alice.send).not.toHaveBeenCalled();
		expect(bob.send).not.toHaveBeenCalled();
	});

	it('skips a socket that is no longer open', () => {
		const closed = fakeSocket(CLOSED);

		addUiSocket({ userId: 'u_alice', socket: closed });
		broadcastToUi({ userId: 'u_alice', message });

		expect(closed.send).not.toHaveBeenCalled();
		expect(alice.send).toHaveBeenCalledOnce();

		removeUiSocket({ userId: 'u_alice', socket: closed });
	});

	it('stops delivering to a removed socket', () => {
		removeUiSocket({ userId: 'u_alice', socket: alice });
		broadcastToUi({ userId: 'u_alice', message });

		expect(alice.send).not.toHaveBeenCalled();
	});

	it('leaves the other account untouched when one removes its last socket', () => {
		removeUiSocket({ userId: 'u_alice', socket: alice });
		broadcastToUi({ userId: 'u_bob', message });

		expect(bob.send).toHaveBeenCalledOnce();
	});
});
