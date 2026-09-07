import { getBosunApiService } from './bosun-api.service';
import { getClaudeAuthService } from './claude-auth.service';
import { getEnvService } from './env.service';
import { getExecService } from './exec.service';
import { getCommitService } from '../execution/commit';
import { getPublishService } from '../execution/publish';
import { getMcpConfigService } from './mcp-config.service';
import { getMcpProbeService } from './mcp-probe.service';
import { getPreflightService } from './preflight.service';
import { getSkillsService } from './skills.service';
import { getUpgradeService } from './upgrade.service';
import { getTeardownService } from './teardown.service';
import { getWorktreeService } from './worktree.service';
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
		commit: getCommitService({ exec }),
		env,
		exec,
		mcpConfig,
		mcpProbe: getMcpProbeService(),
		publish: getPublishService({ exec }),
		preflight: getPreflightService({
			exec,
			claudeAuth,
			mcpConfig,
			skills,
			repoPath: opts.config.repoPath
		}),
		skills,
		teardown: getTeardownService({}),
		upgrade: getUpgradeService({ exec }),
		worktree: getWorktreeService({ exec, repoPath: opts.config.repoPath })
	};
}

export type Services = ReturnType<typeof getServices>;
