import { AgentConfigSchema, writeConfig, type AgentConfig } from '../config/config';
import { getBosunApiService } from '../services/bosun-api.service';

export async function enroll(opts: {
	serverUrl: string;
	token: string;
	repoPath: string;
	configPath: string;
}): Promise<AgentConfig> {
	const enrolled = await getBosunApiService({ serverUrl: opts.serverUrl }).enroll({
		token: opts.token,
		repoPath: opts.repoPath
	});
	const config = AgentConfigSchema.parse({
		serverUrl: enrolled.serverUrl,
		machineId: enrolled.machineId,
		machineKey: enrolled.machineKey,
		repoPath: opts.repoPath
	});

	writeConfig({ configPath: opts.configPath, config });

	return config;
}
