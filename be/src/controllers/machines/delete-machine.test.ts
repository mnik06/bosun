import { type WebSocket } from '@fastify/websocket';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteMachine } from 'src/controllers/machines/delete-machine';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import {
	addUiSocket,
	registerAgentSocket,
	removeUiSocket,
	sendToAgent,
	unregisterAgentSocket
} from 'src/services/sockets/registry.service';

const OPEN = 1;

function fakeSocket() {
	return { OPEN, readyState: OPEN, send: vi.fn(), close: vi.fn(), terminate: vi.fn() } as unknown as
		WebSocket & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}

function build(deleted: boolean) {
	const agent = fakeSocket();
	const browser = fakeSocket();
	const deleteOwned = vi.fn().mockResolvedValue(deleted);

	registerAgentSocket({ machineId: 'm_1', socket: agent });
	addUiSocket({ userId: 'u_alice', socket: browser });

	return {
		agent,
		browser,
		deleteOwned,
		run: async () =>
			deleteMachine({
				machineRepo: { deleteOwned } as unknown as MachineRepo,
				id: 'm_1',
				userId: 'u_alice'
			})
	};
}

let cleanup: (() => void) | null = null;

afterEach(() => {
	cleanup?.();
	cleanup = null;
});

describe('deleteMachine', () => {
	it('shuts the agent down, drops its socket and tells the browser', async () => {
		const { agent, browser, run } = build(true);

		cleanup = () => {
			unregisterAgentSocket({ machineId: 'm_1', socket: agent });
			removeUiSocket({ userId: 'u_alice', socket: browser });
		};

		await run();

		expect(agent.send).toHaveBeenCalledWith(
			JSON.stringify({ type: 'shutdown', reason: 'this machine was deleted in bosun' })
		);
		expect(agent.close).toHaveBeenCalledOnce();
		expect(browser.send).toHaveBeenCalledWith(
			JSON.stringify({ type: 'machine.deleted', machineId: 'm_1' })
		);
	});

	// AC-6: the registry entry has to go with the row. A ping arriving after the
	// delete must not find a socket for a machine that no longer exists.
	it('leaves nothing in the registry to send to afterwards', async () => {
		const { agent, browser, run } = build(true);

		cleanup = () => {
			unregisterAgentSocket({ machineId: 'm_1', socket: agent });
			removeUiSocket({ userId: 'u_alice', socket: browser });
		};

		await run();

		expect(sendToAgent({ machineId: 'm_1', message: { type: 'ping', id: 'cmd_x' } })).toBe(false);
	});

	// The scoped delete is the authorization check, so it has to run first: a
	// caller who does not own this machine must not be able to shut its agent
	// down and merely be told 404.
	it('sends nothing to the agent when the machine is not the caller\'s', async () => {
		const { agent, browser, run } = build(false);

		cleanup = () => {
			unregisterAgentSocket({ machineId: 'm_1', socket: agent });
			removeUiSocket({ userId: 'u_alice', socket: browser });
		};

		await expect(run()).rejects.toMatchObject({ statusCode: 404 });
		expect(agent.send).not.toHaveBeenCalled();
		expect(agent.close).not.toHaveBeenCalled();
		expect(browser.send).not.toHaveBeenCalled();
	});
});
