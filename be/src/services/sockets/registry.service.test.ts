import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type UiMsg } from 'src/types/protocol';

const OPEN = 1;
const CLOSED = 3;

function fakeSocket(readyState = OPEN) {
	return { OPEN, readyState, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

const message: UiMsg = { type: 'machine.pong', machineId: 'm_1', id: 'cmd_1', rttMs: 12 };

let registry: SocketRegistry;
let alice: ReturnType<typeof fakeSocket>;
let bob: ReturnType<typeof fakeSocket>;

beforeEach(() => {
	registry = getSocketRegistry();
	alice = fakeSocket();
	bob = fakeSocket();
	registry.addUiSocket({ userId: 'u_alice', socket: alice });
	registry.addUiSocket({ userId: 'u_bob', socket: bob });
});

describe('browser fan-out', () => {
	// The whole point of the per-user map: a frame carries a full machine row, so
	// reaching the wrong socket is a data leak, not a cosmetic bug.
	it('delivers only to the sockets of the named account', () => {
		registry.broadcastToUi({ userId: 'u_alice', message });

		expect(alice.send).toHaveBeenCalledWith(JSON.stringify(message));
		expect(bob.send).not.toHaveBeenCalled();
	});

	it('delivers to every socket the account has open', () => {
		const secondTab = fakeSocket();

		registry.addUiSocket({ userId: 'u_alice', socket: secondTab });
		registry.broadcastToUi({ userId: 'u_alice', message });

		expect(alice.send).toHaveBeenCalledOnce();
		expect(secondTab.send).toHaveBeenCalledOnce();
	});

	it('does nothing for an account with no sockets', () => {
		expect(() => registry.broadcastToUi({ userId: 'u_nobody', message })).not.toThrow();
		expect(alice.send).not.toHaveBeenCalled();
		expect(bob.send).not.toHaveBeenCalled();
	});

	it('skips a socket that is no longer open', () => {
		const closed = fakeSocket(CLOSED);

		registry.addUiSocket({ userId: 'u_alice', socket: closed });
		registry.broadcastToUi({ userId: 'u_alice', message });

		expect(closed.send).not.toHaveBeenCalled();
		expect(alice.send).toHaveBeenCalledOnce();
	});

	it('stops delivering to a removed socket', () => {
		registry.removeUiSocket({ userId: 'u_alice', socket: alice });
		registry.broadcastToUi({ userId: 'u_alice', message });

		expect(alice.send).not.toHaveBeenCalled();
	});

	it('leaves the other account untouched when one removes its last socket', () => {
		registry.removeUiSocket({ userId: 'u_alice', socket: alice });
		registry.broadcastToUi({ userId: 'u_bob', message });

		expect(bob.send).toHaveBeenCalledOnce();
	});
});

const planMessage: UiMsg = { type: 'plan.activity', planId: 'p_1', label: 'Reading 3 files' };

describe('per-plan fan-out', () => {
	// Plan frames carry a transcript, so reaching a socket that is not watching
	// that plan is the same class of leak as reaching the wrong account.
	it('delivers only to the sockets subscribed to that plan', () => {
		registry.subscribeUiToPlan({ planId: 'p_1', socket: alice });
		registry.broadcastToPlan({ planId: 'p_1', message: planMessage });

		expect(alice.send).toHaveBeenCalledWith(JSON.stringify(planMessage));
		expect(bob.send).not.toHaveBeenCalled();
	});

	it('stops delivering once the socket unsubscribes', () => {
		registry.subscribeUiToPlan({ planId: 'p_1', socket: alice });
		registry.unsubscribeUiFromPlan({ planId: 'p_1', socket: alice });
		registry.broadcastToPlan({ planId: 'p_1', message: planMessage });

		expect(alice.send).not.toHaveBeenCalled();
	});

	// Closing a tab has to drop its subscriptions too, or the registry keeps a
	// growing set of dead sockets that every later broadcast walks.
	it('drops every subscription a socket held when it is removed', () => {
		registry.subscribeUiToPlan({ planId: 'p_1', socket: alice });
		registry.subscribeUiToPlan({ planId: 'p_2', socket: alice });
		registry.removeUiSocket({ userId: 'u_alice', socket: alice });

		registry.broadcastToPlan({ planId: 'p_1', message: planMessage });
		registry.broadcastToPlan({ planId: 'p_2', message: planMessage });

		expect(alice.send).not.toHaveBeenCalled();
	});
});
