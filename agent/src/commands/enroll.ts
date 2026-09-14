import { AgentConfigSchema, writeConfig, type AgentConfig } from '../config/config';
import { getBosunApiService } from '../services/bosun-api.service';

// `repoPath` is only for enrolling onto a checkout that already exists. A machine
// enrolled without one works on the repository bosun attaches, in a clone of its
// own, so where the installer happened to run changes nothing.
export async function enroll(opts: {
	serverUrl: string;
	token: string;
	repoPath: string | null;
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
		appUrl: enrolled.appUrl,
		...(opts.repoPath === null ? {} : { repoPath: opts.repoPath })
	});

	writeConfig({ configPath: opts.configPath, config });

	return config;
}
