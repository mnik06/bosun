import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';

export const AgentConfigSchema = z.object({
	serverUrl: z.url(),
	machineId: z.string(),
	machineKey: z.string(),
	repoPath: z.string()
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function defaultConfigPath(): string {
	return path.join(os.homedir(), '.bosun', 'config.json');
}

export function writeConfig(opts: { configPath: string; config: AgentConfig }): void {
	fs.mkdirSync(path.dirname(opts.configPath), { recursive: true, mode: 0o700 });
	fs.writeFileSync(opts.configPath, `${JSON.stringify(opts.config, null, 2)}\n`, { mode: 0o600 });
	// writeFileSync only applies mode when it creates the file, so an existing
	// config re-enrolled over would silently keep whatever mode it had.
	fs.chmodSync(opts.configPath, 0o600);
}

export function readConfig(configPath: string): AgentConfig {
	if (!fs.existsSync(configPath)) {
		throw new Error(`No config at ${configPath} — run \`bosun-agent enroll\` first`);
	}

	return AgentConfigSchema.parse(JSON.parse(fs.readFileSync(configPath, 'utf8')));
}
