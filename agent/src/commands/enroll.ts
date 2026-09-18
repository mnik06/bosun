import fs from 'fs';
import { AgentConfigSchema, readConfig, writeConfig, type AgentConfig } from '../config/config';
import { getBosunApiService } from '../services/bosun-api.service';

// Which machine an existing config belongs to, for the refusal to name. A file
// that does not parse still holds whatever a person put there, so it is refused
// all the same.
function existingMachine(configPath: string): string {
	try {
		return `machine ${readConfig(configPath).machineId}`;
	} catch {
		return 'an agent config that does not parse';
	}
}

// `repoPath` is only for enrolling onto a checkout that already exists. A machine
// enrolled without one works on the repository bosun attaches, in a clone of its
// own, so where the installer happened to run changes nothing.
//
// An existing config is refused unless `force` says to replace it. The running
// agent re-reads that file on every call, so replacing it moves a live machine
// onto another machine's identity: its repository, its git credential and its
// server all change under sessions that are still running.
export async function enroll(opts: {
	serverUrl: string;
	token: string;
	repoPath: string | null;
	configPath: string;
	force?: boolean;
}): Promise<AgentConfig> {
	// Before the token is spent: a refused enroll leaves the code usable elsewhere.
	if (!opts.force && fs.existsSync(opts.configPath)) {
		throw new Error(
			`${opts.configPath} already holds ${existingMachine(opts.configPath)}. Enrolling would replace it, and an agent running on it would lose its repository and credentials. Enroll another machine with --config <another path>, or pass --force to replace this one.`
		);
	}

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
