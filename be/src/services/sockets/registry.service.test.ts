import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type UiMsg } from 'src/types/protocol';

const OPEN = 1;
const CLOSED = 3;

function fakeSocket(readyState = OPEN) {
	return { OPEN, readyState, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket & {
		send: ReturnType<typeof vi.fn>;
		terminate: ReturnType<typeof vi.fn>;
	};
}

const message: UiMsg = { type: 'machine.pong', machineId: 'm_1', id: 'cmd_1', rttMs: 12 };

let registry: SocketRegistry;
let alice: ReturnType<typeof fakeSocket>;
let bob: ReturnType<typeof fakeSocket>;
let outsider: ReturnType<typeof fakeSocket>;

// Alice and bob are two members of one project; the outsider is in another. The
// pair is what the project key exists to serve, and the outsider is what it
// exists to exclude.
beforeEach(() => {
	registry = getSocketRegistry();
	alice = fakeSocket();
	bob = fakeSocket();
	outsider = fakeSocket();
	registry.addUiSocket({ projectId: 'prj_1', userId: 'u_alice', socket: alice });
	registry.addUiSocket({ projectId: 'prj_1', userId: 'u_bob', socket: bob });
	registry.addUiSocket({ projectId: 'prj_2', userId: 'u_outsider', socket: outsider });
});

describe('browser fan-out', () => {
	// The whole point of the per-project map: a frame carries a full machine row, so
	// reaching a socket outside the project is a data leak, not a cosmetic bug.
	it('delivers to every member of the named project and to nobody else', () => {
		registry.broadcastToUi({ projectId: 'prj_1', message });

		expect(alice.send).toHaveBeenCalledWith(JSON.stringify(message));
		expect(bob.send).toHaveBeenCalledWith(JSON.stringify(message));
		expect(outsider.send).not.toHaveBeenCalled();
	});

	it('delivers to every socket a member has open', () => {
		const secondTab = fakeSocket();

		registry.addUiSocket({ projectId: 'prj_1', userId: 'u_alice', socket: secondTab });
		registry.broadcastToUi({ projectId: 'prj_1', message });

		expect(alice.send).toHaveBeenCalledOnce();
		expect(secondTab.send).toHaveBeenCalledOnce();
	});

	it('does nothing for a project with no sockets', () => {
		expect(() => registry.broadcastToUi({ projectId: 'prj_nobody', message })).not.toThrow();
		expect(alice.send).not.toHaveBeenCalled();
		expect(outsider.send).not.toHaveBeenCalled();
	});

	it('skips a socket that is no longer open', () => {
		const closed = fakeSocket(CLOSED);

		registry.addUiSocket({ projectId: 'prj_1', userId: 'u_alice', socket: closed });
		registry.broadcastToUi({ projectId: 'prj_1', message });

		expect(closed.send).not.toHaveBeenCalled();
		expect(alice.send).toHaveBeenCalledOnce();
	});

	it('stops delivering to a removed socket', () => {
		registry.removeUiSocket({ projectId: 'prj_1', socket: alice });
		registry.broadcastToUi({ projectId: 'prj_1', message });

		expect(alice.send).not.toHaveBeenCalled();
	});

	it('leaves the other project untouched when one drops its last socket', () => {
		registry.removeUiSocket({ projectId: 'prj_1', socket: alice });
		registry.removeUiSocket({ projectId: 'prj_1', socket: bob });
		registry.broadcastToUi({ projectId: 'prj_2', message });

		expect(outsider.send).toHaveBeenCalledOnce();
	});
});

// A socket outlives the membership that authorized it and nothing rechecks
// authorization per frame, so this hang-up is the only thing standing between a
// removed member and the project's traffic.
describe('hanging up on a removed member', () => {
	it('terminates that member\'s sockets and leaves the rest of the project alone', () => {
		const secondTab = fakeSocket();

		registry.addUiSocket({ projectId: 'prj_1', userId: 'u_alice', socket: secondTab });
		registry.closeUiSocketsForMember({ projectId: 'prj_1', userId: 'u_alice' });

		expect(alice.terminate).toHaveBeenCalledOnce();
		expect(secondTab.terminate).toHaveBeenCalledOnce();
		expect(bob.terminate).not.toHaveBeenCalled();
	});

	it('leaves a socket the same person holds on another project connected', () => {
		const elsewhere = fakeSocket();

		registry.addUiSocket({ projectId: 'prj_2', userId: 'u_alice', socket: elsewhere });
		registry.closeUiSocketsForMember({ projectId: 'prj_1', userId: 'u_alice' });

		expect(alice.terminate).toHaveBeenCalledOnce();
		expect(elsewhere.terminate).not.toHaveBeenCalled();
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
		registry.removeUiSocket({ projectId: 'prj_1', socket: alice });

		registry.broadcastToPlan({ planId: 'p_1', message: planMessage });
		registry.broadcastToPlan({ planId: 'p_2', message: planMessage });

		expect(alice.send).not.toHaveBeenCalled();
	});
});
