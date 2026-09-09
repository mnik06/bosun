import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { startPlan } from 'src/controllers/plans/start-plan';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { getIdService } from 'src/services/ids/id.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine, type MachineStatus, type PreflightCheck } from 'src/types/MachineSchema';

const OPEN = 1;

const GREEN: PreflightCheck[] = [{ name: 'claude', ok: true }];

function fakeSocket() {
	return { OPEN, readyState: OPEN, send: vi.fn() } as unknown as WebSocket & {
		send: ReturnType<typeof vi.fn>;
	};
}

function machine(overrides: Partial<Machine> & { status: MachineStatus }): Machine {
	return {
		id: 'm_1',
		userId: 'u_alice',
		name: 'vps-1',
		lastSeenAt: null,
		repoPath: '/srv/repo',
		agentVersion: '1.2.0',
		capabilities: GREEN,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	};
}

function build(found: Machine | null) {
	const create = vi.fn().mockResolvedValue({ id: 'p_1', userId: 'u_alice', machineId: 'm_1' });
	const append = vi.fn().mockResolvedValue({});
	const update = vi.fn().mockResolvedValue(null);

	return {
		create,
		append,
		update,
		run: async () =>
			startPlan({
				planRepo: { create, update } as unknown as PlanRepo,
				planMessageRepo: { append } as unknown as PlanMessageRepo,
				machineRepo: { getOwnedById: vi.fn().mockResolvedValue(found) } as unknown as MachineRepo,
				idService: getIdService(),
				socketRegistry,
				userId: 'u_alice',
				machineId: 'm_1',
				input: 'make the thing'
			})
	};
}

let socketRegistry: SocketRegistry;
let socket: ReturnType<typeof fakeSocket> | null = null;

beforeEach(() => {
	socketRegistry = getSocketRegistry();
	socket = null;
});

function connect() {
	socket = fakeSocket();
	socketRegistry.registerAgentSocket({ machineId: 'm_1', socket });
}

describe('startPlan refusals', () => {
	// Every refusal has to happen before the insert. A plan row created against a
	// machine that cannot host it sits in `planning` forever with nothing on the
	// other end to finish it.
	it.each([
		['offline', machine({ status: 'offline' }), 'this machine is offline'],
		['paused', machine({ status: 'paused' }), 'this machine is paused'],
		[
			'a red claude check',
			machine({ status: 'online', capabilities: [{ name: 'claude', ok: false }] }),
			'preflight is red: claude'
		],
		[
			'no preflight yet',
			machine({ status: 'online', capabilities: null }),
			'this machine has not reported preflight yet'
		]
	])('refuses %s and writes nothing', async (_case, found, message) => {
		connect();
		const { create, append, run } = build(found);

		await expect(run()).rejects.toThrow(new HttpError(409, message));
		expect(create).not.toHaveBeenCalled();
		expect(append).not.toHaveBeenCalled();
	});

	it('refuses a machine belonging to somebody else as a 404', async () => {
		const { create, run } = build(null);

		await expect(run()).rejects.toThrow(new HttpError(404, 'Machine not found'));
		expect(create).not.toHaveBeenCalled();
	});

	it('refuses an online machine whose agent socket is gone', async () => {
		const { create, run } = build(machine({ status: 'online' }));

		await expect(run()).rejects.toThrow(new HttpError(409, 'this machine is offline'));
		expect(create).not.toHaveBeenCalled();
	});

	it('starts the session and records the ticket when everything is green', async () => {
		connect();
		const { create, append, run } = build(machine({ status: 'online' }));

		await run();

		expect(create).toHaveBeenCalledOnce();
		expect(append).toHaveBeenCalledWith(
			expect.objectContaining({ role: 'user', content: { text: 'make the thing' } })
		);
		expect(socket?.send).toHaveBeenCalledWith(
			JSON.stringify({ type: 'plan.start', planId: 'p_1', input: 'make the thing', notes: null })
		);
	});
});
