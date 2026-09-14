import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';

export const AgentConfigSchema = z.object({
	serverUrl: z.url(),
	machineId: z.string(),
	machineKey: z.string(),
	// Where the web app is, so `bosun-agent setup` can say where to go next.
	appUrl: z.url().optional(),
	// A machine enrolled onto a checkout the operator chose, before plan 008.
	repoPath: z.string().optional(),
	// The clone the agent owns, written when bosun attaches a repository. It
	// outranks `repoPath`: a machine given a repository works on that repository.
	repository: z.object({ id: z.string(), slug: z.string(), path: z.string() }).optional()
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function defaultConfigPath(): string {
	return path.join(os.homedir(), '.bosun', 'config.json');
}

export function writeConfig(opts: { configPath: string; config: AgentConfig }): void {
	fs.mkdirSync(path.dirname(opts.configPath), { recursive: true, mode: 0o700 });

	// Written beside the target and renamed over it: the file holds the machine key,
	// and a crash mid-write would otherwise leave a machine that can never reconnect.
	const temp = `${opts.configPath}.${process.pid}.tmp`;

	fs.writeFileSync(temp, `${JSON.stringify(opts.config, null, 2)}\n`, { mode: 0o600 });
	// writeFileSync only applies mode when it creates the file, so a leftover temp
	// file would silently keep whatever mode it had.
	fs.chmodSync(temp, 0o600);
	fs.renameSync(temp, opts.configPath);
}

export function readConfig(configPath: string): AgentConfig {
	if (!fs.existsSync(configPath)) {
		throw new Error(`No config at ${configPath} — run \`bosun-agent enroll\` first`);
	}

	return AgentConfigSchema.parse(JSON.parse(fs.readFileSync(configPath, 'utf8')));
}

export function workingRepoPath(config: AgentConfig): string | null {
	return config.repository?.path ?? config.repoPath ?? null;
}
