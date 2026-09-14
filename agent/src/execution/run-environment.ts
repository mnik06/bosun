import { type ProjectConfig } from '../project-config';
import { type Services } from '../services/index';
import { withToolchainPath } from '../services/toolchain.service';

export type RunEnvironment = { ok: true; env: NodeJS.ProcessEnv } | { ok: false; detail: string };

// What setup steps, apps and sessions all run under: the credential environment,
// the toolchain the config names first on PATH, and — for anything a session can
// read — the machine's session secrets. One builder, so a step that installs with
// one node and a session that tests with another cannot happen.
export async function prepareRunEnvironment(opts: {
	services: Pick<Services, 'claudeAuth' | 'toolchain' | 'projectEnv'>;
	config: ProjectConfig | null;
	includeSecrets: boolean;
}): Promise<RunEnvironment> {
	let env = opts.services.claudeAuth.sessionEnv();
	const toolchain = opts.config?.toolchain;

	if (toolchain !== undefined) {
		const provisioned = await opts.services.toolchain.ensure({
			node: toolchain.node,
			...(toolchain.packageManager === undefined ? {} : { packageManager: toolchain.packageManager })
		});

		if (!provisioned.ok) {
			return { ok: false, detail: `could not provision the toolchain: ${provisioned.detail}` };
		}

		env = withToolchainPath(env, provisioned.binDirs);
	}

	return { ok: true, env: opts.includeSecrets ? { ...env, ...opts.services.projectEnv.secretValues() } : env };
}

// Laid over a session that must not publish anything: the empty helper clears
// every credential helper git would otherwise consult — the clone's own included —
// so a push has nothing to authenticate with.
export const NO_PUSH_GIT_ENV: NodeJS.ProcessEnv = {
	GIT_TERMINAL_PROMPT: '0',
	GIT_CONFIG_COUNT: '1',
	GIT_CONFIG_KEY_0: 'credential.helper',
	GIT_CONFIG_VALUE_0: ''
};
