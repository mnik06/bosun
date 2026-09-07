import { type AgentConfig } from '../config/config';
import { getBosunApiService, type McpPreset } from '../services/bosun-api.service';
import { getEnvService } from '../services/env.service';
import { expandVariables, getMcpConfigService } from '../services/mcp-config.service';
import { getMcpProbeService } from '../services/mcp-probe.service';
import { getPromptService } from '../services/prompt.service';

// base64(user:secret) is the one header shape `${VAR}` substitution cannot
// express, so the agent composes it from two prompted values and stores only the
// result. The raw token is never written anywhere.
export function encodeBasicAuth(opts: { user: string; secret: string }): string {
	return Buffer.from(`${opts.user}:${opts.secret}`).toString('base64');
}

// Nothing is produced when the stored credential is being kept. Composing one
// from an empty answer set would write base64(":") over a working token, which is
// a silent credential loss rather than a visible failure.
export function buildSecrets(opts: {
	preset: { requires: { env: string }[]; basicAuth?: { user: string; secret: string; into: string } };
	answers: Map<string, string>;
	replace: boolean;
}): { variable: string; value: string }[] {
	if (!opts.replace) {
		return [];
	}

	const { basicAuth } = opts.preset;

	if (basicAuth) {
		// Only the encoded header value is stored. Keeping the raw pair as well
		// would mean two places to rotate and one of them silently stale.
		return [
			{
				variable: basicAuth.into,
				value: encodeBasicAuth({
					user: opts.answers.get(basicAuth.user) ?? '',
					secret: opts.answers.get(basicAuth.secret) ?? ''
				})
			}
		];
	}

	return [...opts.answers].map(([variable, value]) => ({ variable, value }));
}

// The variables this preset owns. With `basicAuth` the raw answers are combined
// and only the encoded header is stored, so that is the single variable it writes.
export function credentialVariables(preset: {
	requires: { env: string }[];
	basicAuth?: { into: string };
}): string[] {
	return preset.basicAuth ? [preset.basicAuth.into] : preset.requires.map((entry) => entry.env);
}

export interface CredentialPlan {
	writes: string[];
	collision: string[];
	mustPrompt: boolean;
}

// Whether a variable that is already set belongs to this server or to a different
// one is the only thing separating a token rotation from silently breaking
// somebody else's integration, and the server being configured already is what
// tells them apart.
export function planCredentials(opts: {
	writes: string[];
	installed: boolean;
	isSet: (variable: string) => boolean;
}): CredentialPlan {
	const taken = opts.writes.filter(opts.isSet);

	return {
		writes: opts.writes,
		collision: opts.installed ? [] : taken,
		// Nothing stored yet means there is nothing to keep, so it is asked for
		// outright rather than offering a choice with one option.
		mustPrompt: taken.length < opts.writes.length
	};
}

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
	const installed = mcpConfig.listConfigured().includes(preset.id);
	const plan = planCredentials({
		writes: credentialVariables(preset),
		installed,
		isSet: (variable) => env.has(variable)
	});

	// A variable owned by a server that is not this one must not be overwritten:
	// two presets can want the same name, and clobbering it silently breaks the
	// other. Re-adding a server that is already here is the opposite case — that
	// is a deliberate update, and refusing it is what made rotating a token
	// require editing the file by hand.
	if (plan.collision.length > 0) {
		throw new Error(
			`${plan.collision.join(', ')} is already set in ${env.envPath} by another server — remove that server first, or edit the file by hand`
		);
	}

	const replace = plan.mustPrompt || (await prompt.confirm('Replace the stored credential?'));
	const answers = new Map<string, string>();

	for (const requirement of replace ? preset.requires : []) {
		const value =
			requirement.secret === false
				? await prompt.ask(`${requirement.label}: `)
				: await prompt.secret(requirement.label);

		if (!value) {
			throw new Error(`${requirement.env} is required — nothing was written`);
		}

		answers.set(requirement.env, value);
	}

	secrets.push(...buildSecrets({ preset, answers, replace }));

	// Shown before anything is written. A preset comes from bosun, but a stdio
	// server is a command that will run on this machine, and that is the user's
	// decision to make rather than ours to assume.
	console.log(`\n  ${preset.id} — ${preset.name}`);
	console.log(`  ${describeServer(preset.server)}`);

	for (const secret of secrets) {
		console.log(`  ${secret.variable} → ${env.envPath}`);
	}

	if (!replace && plan.writes.length > 0) {
		console.log(`  keeping the credential already in ${env.envPath}`);
	}

	const verb = installed ? 'Update' : 'Write';

	if (!(await prompt.confirm(`\n${verb} this in ${mcpConfig.configPath}?`))) {
		console.log('nothing written');

		return;
	}

	for (const secret of secrets) {
		env.set(secret);
	}

	mcpConfig.upsert({ name: preset.id, server: preset.server });

	console.log(
		`\n✓ ${installed ? 'updated' : 'added'} "${preset.id}". Hit Refresh on this machine in bosun to pick it up.`
	);
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

export async function checkMcpServers(): Promise<void> {
	const env = getEnvService({ baseEnv: process.env });
	const mcpConfig = getMcpConfigService({ env });
	const probe = getMcpProbeService();
	const resolved = mcpConfig.read();

	if (resolved.error) {
		console.log(`${mcpConfig.configPath}: ${resolved.error}`);
	}

	if (resolved.unresolved.length > 0) {
		console.log(`unset in ${env.envPath}: ${resolved.unresolved.join(', ')}\n`);
	}

	if (resolved.serverNames.length === 0) {
		console.log('no MCP servers configured');

		return;
	}

	let failed = 0;

	// Sequential on purpose: a stdio server may be downloading itself through npx,
	// and racing several of those makes every one of them look like a timeout.
	for (const name of resolved.serverNames) {
		const result = await probe.probe(resolved.servers[name]);

		failed += result.ok ? 0 : 1;
		console.log(`  ${result.ok ? '✓' : '✗'} ${name.padEnd(14)} ${result.detail}`);
	}

	if (failed > 0) {
		console.log(`\n${failed} server(s) unreachable. A session gets only the servers that answer.`);
	}
}
