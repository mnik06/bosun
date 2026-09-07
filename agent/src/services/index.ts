import { getBosunApiService } from './bosun-api.service';
import { getClaudeAuthService } from './claude-auth.service';
import { getEnvService } from './env.service';
import { getExecService } from './exec.service';
import { getMcpConfigService } from './mcp-config.service';
import { getPreflightService } from './preflight.service';
import { getSkillsService } from './skills.service';
import { getUpgradeService } from './upgrade.service';
import { getSystemdService } from './systemd.service';
import { type AgentConfig } from '../config/config';

export function getServices(opts: { config: AgentConfig; env: NodeJS.ProcessEnv }) {
	const exec = getExecService();
	const env = getEnvService({ baseEnv: opts.env });
	const claudeAuth = getClaudeAuthService({ exec, env });
	const mcpConfig = getMcpConfigService({ env });
	const skills = getSkillsService({ repoPath: opts.config.repoPath });

	return {
		bosunApi: getBosunApiService({
			serverUrl: opts.config.serverUrl,
			machineKey: opts.config.machineKey
		}),
		claudeAuth,
		env,
		exec,
		mcpConfig,
		preflight: getPreflightService({ exec, claudeAuth, mcpConfig, skills }),
		skills,
		systemd: getSystemdService(),
		upgrade: getUpgradeService({ exec })
	};
}

export type Services = ReturnType<typeof getServices>;
