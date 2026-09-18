import { type WebSocket } from '@fastify/websocket';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { dispatchQuickFix } from 'src/controllers/quick-fixes/dispatch-quick-fix';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type QuickFixRepo } from 'src/repos/quick-fixes/quick-fix.repo';
import { getIdService } from 'src/services/ids/id.service';
import { getSocketRegistry, type SocketRegistry } from 'src/services/sockets/registry.service';
import { type MachineMemory } from 'src/types/machine-memory';
import { type Machine, type MachineStatus, type PreflightCheck } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

const OPEN = 1;
const GREEN: PreflightCheck[] = [{ name: 'claude', ok: true }];

function fakeSocket() {
	return { OPEN, readyState: OPEN, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

function machine(overrides: Partial<Machine> & { status: MachineStatus }): Machine {
	return {
		id: 'm_1',
		projectId: 'u_alice',
		name: 'vps-1',
		lastSeenAt: null,
		repoPath: '/srv/repo',
		agentVersion: '1.2.0',
		capabilities: GREEN,
		repositoryId: 'repo_1',
		clonedRepositoryId: 'repo_1',
		verifyLanes: 1,
		buildCap: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	};
}

const repository = { id: 'repo_1', projectId: 'u_alice', defaultBranch: 'main' } as unknown as Repository;

function noBuildLoad(): Pick<BuildRepo, 'listForMachine'> {
	return { listForMachine: vi.fn().mockResolvedValue([]) };
}

function memory(totalGib: number): MachineMemory {
	return { totalBytes: totalGib * 1024 ** 3, availableBytes: totalGib * 1024 ** 3, swapTotalBytes: 0, sessionLimits: true };
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

function build(opts: {
	found: Machine | null;
	repositoryFound?: Repository | null;
	buildRepo?: Pick<BuildRepo, 'listForMachine'>;
	memoryReported?: MachineMemory | null;
}) {
	const create = vi.fn().mockImplementation((row: Record<string, unknown>) =>
		Promise.resolve({ ...row, status: 'running', prUrl: null, error: null, createdAt: new Date(), finishedAt: null })
	);
	const settle = vi.fn().mockResolvedValue(null);
	const buildRepo = opts.buildRepo ?? noBuildLoad();

	return {
		create,
		settle,
		run: async () =>
			dispatchQuickFix(
				{
					machineRepo: { getOwnedById: vi.fn().mockResolvedValue(opts.found) } as unknown as MachineRepo,
					repositoryRepo: { getById: vi.fn().mockResolvedValue(opts.repositoryFound ?? repository) } as unknown as RepositoryRepo,
					buildRepo: buildRepo as unknown as BuildRepo,
					onboardingRunRepo: { listActiveForMachine: vi.fn().mockResolvedValue([]) } as unknown as OnboardingRunRepo,
					quickFixRepo: { create, settle, listActiveForMachine: vi.fn().mockResolvedValue([]) } as unknown as QuickFixRepo,
					machineMemory: { get: vi.fn().mockReturnValue(opts.memoryReported ?? null) },
					idService: getIdService(),
					socketRegistry
				} as unknown as LineDeps,
				{
					projectId: 'u_alice',
					createdByUserId: 'u_bob',
					machineId: 'm_1',
					description: 'fix the thing'
				}
			)
	};
}

describe('dispatchQuickFix refusals', () => {
	// Every refusal has to happen before the insert, on the same terms as
	// `startPlan`: a row created against a machine that cannot host it sits
	// `running` forever with nothing on the other end to settle it.
	it('refuses a machine belonging to somebody else as a 404', async () => {
		const { create, run } = build({ found: null });

		await expect(run()).rejects.toThrow(new HttpError(404, 'Machine not found'));
		expect(create).not.toHaveBeenCalled();
	});

	it('refuses an offline machine', async () => {
		const { create, run } = build({ found: machine({ status: 'offline' }) });

		await expect(run()).rejects.toThrow(new HttpError(409, 'this machine is offline'));
		expect(create).not.toHaveBeenCalled();
	});

	// `requireHost`'s own repository check (`awaitingRepository`) only refuses when
	// both `repositoryId` and `repoPath` are null — a plan can run off a bare
	// checkout. A quick fix cannot: it ends in a pull request, which needs a
	// GitHub-attached repository. `repoPath` stays set here so the only thing
	// standing between this machine and `requireHost`'s looser check is the
	// explicit one `dispatchQuickFix` adds itself.
	it('refuses a machine with no repository attached, even with a bare checkout', async () => {
		connect();
		const { create, run } = build({ found: machine({ status: 'online', repositoryId: null }) });

		await expect(run()).rejects.toThrow(new HttpError(409, 'this machine has no repository attached'));
		expect(create).not.toHaveBeenCalled();
	});

	// `repositoryId` is written when the attach is asked for; the agent has no tree
	// until the clone lands, and would fail the session with "no repository attached".
	it('refuses a machine whose repository is still cloning', async () => {
		connect();
		const { create, run } = build({ found: machine({ status: 'online', clonedRepositoryId: null }) });

		await expect(run()).rejects.toThrow(new HttpError(409, 'this machine is still cloning its repository'));
		expect(create).not.toHaveBeenCalled();
	});

	it('refuses when the machine is at capacity', async () => {
		connect();
		// 8 GiB less the 1.5 GiB reserve is 6.5 GiB usable: two build-sized slots
		// already held (6 GiB) leave no room for a third, build-sized quick fix.
		const buildRepo: Pick<BuildRepo, 'listForMachine'> = {
			listForMachine: vi.fn().mockImplementation((opts: { statuses: string[] }) =>
				Promise.resolve(opts.statuses.includes('building') ? [{}, {}] : [])
			)
		};
		const { create, run } = build({
			found: machine({ status: 'online' }),
			buildRepo,
			memoryReported: memory(8)
		});

		await expect(run()).rejects.toThrow(
			new HttpError(409, 'this machine is at capacity — let a build or another quick fix finish first')
		);
		expect(create).not.toHaveBeenCalled();
	});
});

describe('dispatchQuickFix success', () => {
	it('creates the row and dispatches quickfix.start with the admitted limit', async () => {
		connect();
		const { create, run } = build({ found: machine({ status: 'online' }), memoryReported: memory(16) });

		const quickFix = await run();

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'u_alice',
				machineId: 'm_1',
				repositoryId: 'repo_1',
				baseBranch: 'main',
				description: 'fix the thing',
				createdByUserId: 'u_bob',
				branch: expect.stringMatching(/^bosun\/quickfix\/.+-fix-the-thing$/)
			})
		);
		const id = create.mock.calls[0][0].id as string;

		expect(socket?.send).toHaveBeenCalledWith(
			JSON.stringify({
				type: 'quickfix.start',
				quickFixId: id,
				branch: `bosun/quickfix/${id}-fix-the-thing`,
				baseRef: 'main',
				description: 'fix the thing',
				memoryMaxBytes: 3 * 1024 ** 3
			})
		);
		expect(quickFix).toMatchObject({ id, branch: `bosun/quickfix/${id}-fix-the-thing`, status: 'running' });
	});

	it('settles the row as failed when the socket send races the machine going offline', async () => {
		// `requireHost` only checks that a socket is registered, not that it is
		// still open — `sendToAgent` is the one that checks `readyState`. A socket
		// that dropped between those two reads is what this reproduces: present in
		// the registry, but no longer `OPEN`.
		socket = fakeSocket();
		socket.readyState = 3;
		socketRegistry.registerAgentSocket({ machineId: 'm_1', socket });
		const { create, settle, run } = build({ found: machine({ status: 'online' }), memoryReported: memory(16) });

		await run();

		expect(create).toHaveBeenCalledOnce();
		const id = create.mock.calls[0][0].id as string;

		expect(settle).toHaveBeenCalledWith({
			id,
			status: 'failed',
			error: 'the machine went offline before the session started'
		});
	});
});
