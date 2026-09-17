import { HttpError } from 'src/api/errors/HttpError';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type McpPresetService } from 'src/services/mcp-presets/mcp-preset.service';
import { type McpPreset } from 'src/types/McpPresetSchema';
import { compareVersions } from 'src/utils/general';

// Mirrors the MIN_REPOSITORY_AGENT_VERSION gate in attach-repository.ts: a
// preset that names a minimum version is refused outright rather than served
// and left for an old agent to mishandle. Presets without one (Atlassian today)
// skip the machine lookup entirely.
export async function getMcpPresetForAgent(opts: {
	machineRepo: MachineRepo;
	mcpPresets: McpPresetService;
	machineId: string;
	id: string;
}): Promise<McpPreset> {
	const preset = opts.mcpPresets.find(opts.id);

	if (!preset) {
		throw new HttpError(404, 'Unknown MCP preset');
	}

	if (!preset.minAgentVersion) {
		return preset;
	}

	const machine = await opts.machineRepo.getById(opts.machineId);
	const tooOld =
		machine?.agentVersion == null ||
		compareVersions(machine.agentVersion, preset.minAgentVersion) < 0;

	if (tooOld) {
		throw new HttpError(
			409,
			`This machine's agent (${machine?.agentVersion ?? 'unknown'}) is older than ${preset.minAgentVersion} and cannot use this preset — upgrade it with Refresh first`
		);
	}

	return preset;
}
