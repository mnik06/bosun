import { type WebSocket } from '@fastify/websocket';
import { describe, expect, it, vi } from 'vitest';
import { attachRefusal } from 'src/controllers/machines/shared/attach-refusal';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

function fakeSocket() {
	return { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
}

function machine(overrides: Partial<Machine> = {}): Machine {
	return {
		id: 'm_1',
		projectId: 'proj_1',
		name: 'box',
		status: 'online',
		lastSeenAt: null,
		repoPath: null,
		agentVersion: '4.0.2',
		projectProfile: null,
		capabilities: null,
		envSets: null,
		repositoryId: null,
		publicKey: null,
		policy: { applyMigrations: false, confirmed: false },
		sessionSecrets: null,
		verifyLanes: 1,
		buildCap: null,
		createdAt: new Date(),
		...overrides
	};
}

function build() {
	const socketRegistry = getSocketRegistry();

	socketRegistry.registerAgentSocket({ machineId: 'm_1', socket: fakeSocket() });

	const buildRepo = { listForMachine: vi.fn().mockResolvedValue([]) } as unknown as BuildRepo;

	return { socketRegistry, buildRepo };
}

describe('attachRefusal', () => {
	// AC-35: a machine's agent can be new enough to clone GitHub (>= 3.0.0) but
	// still too old to answer Azure's credential requests (>= 4.0.2) — the two
	// floors are checked independently, keyed on the provider being attached.
	it('refuses an Azure attach from an agent between the two version floors, with an upgrade message', async () => {
		const { socketRegistry, buildRepo } = build();

		const refused = await attachRefusal({
			buildRepo,
			socketRegistry,
			machine: machine({ agentVersion: '3.5.0' }),
			projectId: 'proj_1',
			provider: 'azure_devops'
		});

		expect(refused).toMatch(/older than 4\.0\.2/);
		expect(refused).toMatch(/Azure DevOps/);
	});

	it('allows that same agent version to attach a GitHub repository', async () => {
		const { socketRegistry, buildRepo } = build();

		const refused = await attachRefusal({
			buildRepo,
			socketRegistry,
			machine: machine({ agentVersion: '3.5.0' }),
			projectId: 'proj_1',
			provider: 'github'
		});

		expect(refused).toBeNull();
	});

	it('allows an Azure attach once the agent meets the Azure floor', async () => {
		const { socketRegistry, buildRepo } = build();

		const refused = await attachRefusal({
			buildRepo,
			socketRegistry,
			machine: machine({ agentVersion: '4.0.2' }),
			projectId: 'proj_1',
			provider: 'azure_devops'
		});

		expect(refused).toBeNull();
	});
});
