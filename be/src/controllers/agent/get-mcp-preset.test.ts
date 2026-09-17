import { describe, expect, it, vi } from 'vitest';
import { getMcpPresetForAgent } from 'src/controllers/agent/get-mcp-preset';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type McpPresetService } from 'src/services/mcp-presets/mcp-preset.service';
import { type Machine } from 'src/types/MachineSchema';
import { type McpPreset } from 'src/types/McpPresetSchema';

function ungatedPreset(): McpPreset {
	return {
		id: 'atlassian',
		name: 'Atlassian',
		description: 'Read Jira issues and Confluence pages while planning.',
		requires: [],
		server: { type: 'http', url: 'https://mcp.atlassian.com/v2/mcp' }
	};
}

function gatedPreset(): McpPreset {
	return { ...ungatedPreset(), id: 'azure-devops', minAgentVersion: '4.0.2' };
}

function machine(agentVersion: string | null): Machine {
	return {
		id: 'm_1',
		projectId: 'u_alice',
		name: 'box',
		status: 'online',
		lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
		repoPath: null,
		agentVersion,
		capabilities: null,
		projectProfile: null,
		envSets: [],
		repositoryId: null,
		publicKey: null,
		policy: null,
		sessionSecrets: [],
		verifyLanes: null,
		buildCap: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z')
	} as unknown as Machine;
}

function build(opts: { preset: McpPreset | null; agentVersion: string | null | undefined }) {
	const find = vi.fn().mockReturnValue(opts.preset);
	const getById = vi.fn().mockResolvedValue(opts.agentVersion === undefined ? null : machine(opts.agentVersion));

	return {
		run: () =>
			getMcpPresetForAgent({
				machineRepo: { getById } as unknown as MachineRepo,
				mcpPresets: { find } as unknown as McpPresetService,
				machineId: 'm_1',
				id: opts.preset?.id ?? 'azure-devops'
			}),
		getById
	};
}

describe('getMcpPresetForAgent', () => {
	it('404s on an unknown preset id', async () => {
		const { run } = build({ preset: null, agentVersion: '4.0.2' });

		await expect(run()).rejects.toMatchObject({ statusCode: 404 });
	});

	it('serves a preset with no minAgentVersion without looking up the machine', async () => {
		const { run, getById } = build({ preset: ungatedPreset(), agentVersion: '0.0.1' });

		await expect(run()).resolves.toEqual(ungatedPreset());
		expect(getById).not.toHaveBeenCalled();
	});

	it('serves a gated preset once the machine is at least the minimum version', async () => {
		const { run } = build({ preset: gatedPreset(), agentVersion: '4.0.2' });

		await expect(run()).resolves.toEqual(gatedPreset());
	});

	it('serves a gated preset to a machine ahead of the minimum version', async () => {
		const { run } = build({ preset: gatedPreset(), agentVersion: '4.1.0' });

		await expect(run()).resolves.toEqual(gatedPreset());
	});

	it('refuses a gated preset to a machine behind the minimum version', async () => {
		const { run } = build({ preset: gatedPreset(), agentVersion: '4.0.1' });

		await expect(run()).rejects.toMatchObject({
			statusCode: 409,
			message: expect.stringContaining('agent (4.0.1) is older than 4.0.2')
		});
	});

	it('refuses a gated preset to a machine that has never reported a version', async () => {
		const { run } = build({ preset: gatedPreset(), agentVersion: null });

		await expect(run()).rejects.toMatchObject({
			statusCode: 409,
			message: expect.stringContaining('agent (unknown) is older than 4.0.2')
		});
	});

	it('refuses a gated preset when the machine itself is unknown', async () => {
		const { run } = build({ preset: gatedPreset(), agentVersion: undefined });

		await expect(run()).rejects.toMatchObject({ statusCode: 409 });
	});
});
