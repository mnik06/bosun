import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readConfig, type AgentConfig } from '../config/config';
import { getBosunApiService, type McpPreset } from '../services/bosun-api.service';
import { findBrowserExecutable, INSTALL_DEPS_COMMAND, launchBrowser } from '../services/browser.service';
import { getClaudeAuthService } from '../services/claude-auth.service';
import { getEnvService } from '../services/env.service';
import { getExecService } from '../services/exec.service';
import { getInputsKeyService } from '../services/inputs-key.service';
import { getMcpConfigService } from '../services/mcp-config.service';
import { browserCachePath } from '../services/preflight.service';
import { getPromptService } from '../services/prompt.service';
import { setClaudeToken } from './auth';
import { addMcpPreset } from './mcp';

type StepResult = 'done' | 'already' | 'incomplete';

function header(title: string): void {
	console.log(`\n── ${title}`);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// One prompt per question. Closing a prompt marks its input finished for good,
// and the steps in between — `auth set`, `mcp add` — open prompts of their own on
// the same terminal.
async function confirm(question: string): Promise<boolean> {
	const prompt = getPromptService({});

	try {
		return await prompt.confirm(question);
	} finally {
		prompt.close();
	}
}

// Run straight after install.sh, the calling shell has not picked up
// ~/.local/bin, where Claude Code installs itself, or the node bosun put under
// ~/.bosun/toolchains. Without both every step below would report a tool as
// missing that is sitting on disk.
function withLocalTools(): void {
	const home = os.homedir();
	const toolchains = path.join(home, '.bosun', 'toolchains');
	let nodes: string[] = [];

	try {
		nodes = fs
			.readdirSync(toolchains)
			.filter((entry) => entry.startsWith('node-'))
			.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
	} catch {
		nodes = [];
	}

	const current = (process.env.PATH ?? '').split(':').filter(Boolean);
	const extra = [
		...nodes.slice(0, 1).map((entry) => path.join(toolchains, entry, 'bin')),
		path.join(home, '.local', 'bin')
	].filter((dir) => fs.existsSync(dir) && !current.includes(dir));

	process.env.PATH = [...extra, ...current].join(':');
}

async function claudeStep(): Promise<StepResult> {
	header('1/4  Claude');

	const exec = getExecService();
	const claudeAuth = getClaudeAuthService({ exec, env: getEnvService({ baseEnv: process.env }) });
	const version = await exec.run('claude', ['--version']);

	if (!version.ok) {
		console.log(`✗ claude: ${version.reason}`);
		console.log('  Install it with `curl -fsSL https://claude.ai/install.sh | bash`, then run `bosun-agent setup` again.');

		return 'incomplete';
	}

	const status = await claudeAuth.readStatus();

	if (status.loggedIn) {
		const verified = await claudeAuth.verify();

		if (verified.ok) {
			console.log(`✓ ${version.stdout} — ${verified.detail}`);

			return 'already';
		}

		console.log(`✗ ${verified.detail}`);
	} else {
		console.log(`✗ ${status.detail}`);
	}

	for (;;) {
		try {
			await setClaudeToken();

			return 'done';
		} catch (error) {
			console.log(`\n✗ ${messageOf(error)}`);

			if (!(await confirm('Try again?'))) {
				return 'incomplete';
			}
		}
	}
}

// Optional by nature: a machine with no MCP server beyond bosun's defaults is a
// working machine, so declining every preset is not an unfinished step.
async function mcpStep(config: AgentConfig): Promise<StepResult> {
	header('2/4  MCP servers');

	const mcpConfig = getMcpConfigService({ env: getEnvService({ baseEnv: process.env }) });
	let presets: McpPreset[];

	try {
		presets = await getBosunApiService({ serverUrl: config.serverUrl }).listMcpPresets();
	} catch (error) {
		console.log(`✗ could not list the presets bosun offers: ${messageOf(error)}`);

		return 'incomplete';
	}

	const configured = new Set(mcpConfig.listConfigured());
	const available = presets.filter((preset) => !configured.has(preset.id));

	if (configured.size > 0) {
		console.log(`✓ configured: ${[...configured].join(', ')}`);
	}

	if (available.length === 0) {
		console.log('✓ nothing left to add');

		return 'already';
	}

	console.log('Tools a session can reach. Each asks for its credential here, in this terminal.');

	let added = 0;

	for (const preset of available) {
		if (!(await confirm(`Add ${preset.id} — ${preset.description}?`))) {
			continue;
		}

		try {
			await addMcpPreset({ config, id: preset.id });
			added += 1;
		} catch (error) {
			console.log(`✗ ${preset.id}: ${messageOf(error)}`);
		}
	}

	return added > 0 ? 'done' : 'already';
}

async function installChromium(): Promise<boolean> {
	if (!(await confirm('Install Chromium for this user now (npx -y playwright install chromium)?'))) {
		return false;
	}

	const installed = spawnSync('npx', ['-y', 'playwright', 'install', 'chromium'], { stdio: 'inherit' });

	if (installed.status !== 0) {
		console.log(`✗ the install did not finish${installed.error ? `: ${installed.error.message}` : ''}`);

		return false;
	}

	return true;
}

async function browserStep(): Promise<StepResult> {
	header('3/4  Browser');

	const exec = getExecService();
	const mcpConfig = getMcpConfigService({ env: getEnvService({ baseEnv: process.env }) });

	if (!mcpConfig.read().serverNames.includes('playwright')) {
		console.log('✓ playwright is switched off on this machine — no browser needed');

		return 'already';
	}

	const cachePath = browserCachePath({
		platform: process.platform,
		home: os.homedir(),
		configured: process.env.PLAYWRIGHT_BROWSERS_PATH
	});
	let launched = await launchBrowser({ exec, cachePath });

	if (launched.ok) {
		console.log(`✓ ${launched.detail}`);

		return 'already';
	}

	console.log(`✗ ${launched.detail}`);

	if (cachePath !== null && findBrowserExecutable(cachePath) === null) {
		if (!(await installChromium())) {
			return 'incomplete';
		}

		launched = await launchBrowser({ exec, cachePath });

		if (launched.ok) {
			console.log(`✓ ${launched.detail}`);

			return 'done';
		}

		console.log(`✗ ${launched.detail}`);
	}

	if (launched.missingLibrary !== null) {
		console.log('  Chromium links against system libraries, and installing those needs root:');
		console.log(`    ${INSTALL_DEPS_COMMAND}`);
		console.log('  Then run `bosun-agent setup` again.');
	}

	return 'incomplete';
}

function keyStep(): StepResult {
	header('4/4  Machine key');

	try {
		const key = getInputsKeyService({}).ensure();

		console.log(`✓ fingerprint ${key.fingerprint}`);
		console.log('  Values typed in the browser are encrypted to this key before they leave it.');
		console.log('  The machine\'s page in bosun shows a fingerprint too — they must be identical.');

		return 'done';
	} catch (error) {
		console.log(`✗ ${messageOf(error)}`);

		return 'incomplete';
	}
}

// Only what has to be typed on the box: an account credential stays in this
// terminal and never reaches bosun. Every step checks before it acts, so running
// this again after a failure picks up where it stopped.
export async function runSetup(opts: { configPath: string }): Promise<void> {
	const config = readConfig(opts.configPath) as AgentConfig & { appUrl?: string };

	withLocalTools();
	console.log(`Setting up ${config.machineId}. Steps already done are skipped, so this is safe to run again.`);

	const results: [string, StepResult][] = [];

	results.push(['Claude', await claudeStep()]);
	results.push(['MCP servers', await mcpStep(config)]);
	results.push(['Browser', await browserStep()]);
	results.push(['Machine key', keyStep()]);

	const incomplete = results.filter(([, result]) => result === 'incomplete').map(([name]) => name);

	header(incomplete.length === 0 ? 'Done' : `Not finished: ${incomplete.join(', ')}`);

	if (incomplete.length > 0) {
		console.log('Fix what is marked ✗ above, then run `bosun-agent setup` again.');
	}

	console.log('bosun picks up changes on this machine within a few seconds — nothing to refresh.');

	if (config.appUrl !== undefined) {
		console.log(`\nContinue in the browser: ${config.appUrl.replace(/\/$/, '')}/machines/${config.machineId}`);
	}
}
