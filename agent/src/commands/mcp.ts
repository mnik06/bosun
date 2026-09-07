import { type AgentConfig } from '../config/config';
import { getBosunApiService, type McpPreset } from '../services/bosun-api.service';
import { getEnvService } from '../services/env.service';
import { expandVariables, getMcpConfigService } from '../services/mcp-config.service';
import { getPromptService } from '../services/prompt.service';

function describeServer(server: unknown): string {
	const definition = server as { type?: string; url?: string; command?: string; args?: string[] };

	if (definition.type === 'stdio') {
		return `runs on this machine: ${[definition.command, ...(definition.args ?? [])].join(' ')}`;
	}

	return `http: ${definition.url ?? 'unknown endpoint'}`;
}

export async function addMcpPreset(opts: { config: AgentConfig; id: string }): Promise<void> {
	const api = getBosunApiService({ serverUrl: opts.config.serverUrl });
	const env = getEnvService({ baseEnv: process.env });
	const mcpConfig = getMcpConfigService({ env });
	const prompt = getPromptService({});
	const preset: McpPreset = await api.getMcpPreset(opts.id);

	try {
		await runAdd({ preset, mcpConfig, env, prompt });
	} finally {
		prompt.close();
	}
}

async function runAdd(deps: {
	preset: McpPreset;
	mcpConfig: ReturnType<typeof getMcpConfigService>;
	env: ReturnType<typeof getEnvService>;
	prompt: ReturnType<typeof getPromptService>;
}): Promise<void> {
	const { preset, mcpConfig, env, prompt } = deps;
	const secrets: { variable: string; value: string }[] = [];

	// Checked before anything is asked for. Two servers can share a variable, so
	// replacing one silently would break the other — and there is no point taking
	// a token that is going to be refused.
	for (const requirement of preset.requires) {
		if (env.has(requirement.env)) {
			throw new Error(
				`${requirement.env} is already set in ${env.envPath} — edit it there rather than adding a second one`
			);
		}
	}

	for (const requirement of preset.requires) {
		const value = await prompt.secret(requirement.label);

		if (!value) {
			throw new Error(`${requirement.env} is required — nothing was written`);
		}

		secrets.push({ variable: requirement.env, value });
	}

	// Shown before anything is written. A preset comes from bosun, but a stdio
	// server is a command that will run on this machine, and that is the user's
	// decision to make rather than ours to assume.
	console.log(`\n  ${preset.id} — ${preset.name}`);
	console.log(`  ${describeServer(preset.server)}`);

	for (const secret of secrets) {
		console.log(`  ${secret.variable} → ${env.envPath}`);
	}

	if (!(await prompt.confirm(`\nWrite this to ${mcpConfig.configPath}?`))) {
		console.log('nothing written');

		return;
	}

	for (const secret of secrets) {
		env.set(secret);
	}

	mcpConfig.upsert({ name: preset.id, server: preset.server });

	console.log(`\n✓ added "${preset.id}". Hit Refresh on this machine in bosun to pick it up.`);
}

export async function listMcpServers(opts: { config: AgentConfig }): Promise<void> {
	const env = getEnvService({ baseEnv: process.env });
	const mcpConfig = getMcpConfigService({ env });
	const configured = new Set(mcpConfig.listConfigured());
	const resolved = mcpConfig.read();

	if (resolved.serverNames.length === 0) {
		console.log(`no MCP servers configured (${mcpConfig.configPath})`);
	}

	for (const name of resolved.serverNames) {
		console.log(`  ${name}  ${configured.has(name) ? '(yours)' : '(bosun default)'}`);
	}

	if (resolved.unresolved.length > 0) {
		console.log(`\nunset in ${env.envPath}: ${resolved.unresolved.join(', ')}`);
	}

	if (resolved.error) {
		console.log(`\n${mcpConfig.configPath}: ${resolved.error}`);
	}

	const presets = await getBosunApiService({ serverUrl: opts.config.serverUrl }).listMcpPresets();
	const available = presets.filter((preset) => !configured.has(preset.id));

	if (available.length > 0) {
		console.log('\navailable presets:');

		for (const preset of available) {
			console.log(`  ${preset.id.padEnd(14)} ${preset.description}`);
		}

		console.log('\n  add one with: bosun-agent mcp add <id>');
	}
}

export function removeMcpServer(opts: { name: string }): void {
	const env = getEnvService({ baseEnv: process.env });
	const mcpConfig = getMcpConfigService({ env });

	if (!mcpConfig.remove(opts.name)) {
		throw new Error(`no server called "${opts.name}" in ${mcpConfig.configPath}`);
	}

	// The variable is left where it is: it may be shared, and deleting a line from
	// the file holding the Claude credential is not something a remove should do.
	console.log(`✓ removed "${opts.name}". Any token it used is still in ${env.envPath}.`);
	console.log('Hit Refresh on this machine in bosun to pick it up.');
}

export { expandVariables };
