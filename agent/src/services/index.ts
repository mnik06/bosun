import { getBosunApiService } from './bosun-api.service';
import { getClaudeAuthService } from './claude-auth.service';
import { getEnvService } from './env.service';
import { getExecService } from './exec.service';
import { withSerializedFetches } from './git-fetch-queue';
import { getCommitService } from '../execution/commit';
import { getInputsKeyService } from './inputs-key.service';
import { getMcpConfigService } from './mcp-config.service';
import { getMcpProbeService } from './mcp-probe.service';
import { getMemoryService } from './memory.service';
import { getPreflightService } from './preflight.service';
import { getProjectEnvService } from './project-env.service';
import { getRepoService } from './repo.service';
import { getSetupStepsService } from './setup-steps.service';
import { getSkillsService } from './skills.service';
import { getStackService } from './stack.service';
import { getToolchainService } from './toolchain.service';
import { getUpgradeService } from './upgrade.service';
import { getTeardownService } from './teardown.service';
import { getWorkspaceService } from './workspace.service';
import { getWorktreeService } from './worktree.service';
import { defaultConfigPath, type AgentConfig } from '../config/config';

export function getServices(opts: { config: AgentConfig; configPath: string; env: NodeJS.ProcessEnv }) {
	const exec = withSerializedFetches(getExecService());
	const env = getEnvService({ baseEnv: opts.env });
	const claudeAuth = getClaudeAuthService({ exec, env });
	const mcpConfig = getMcpConfigService({ env });
	const memory = getMemoryService({ exec, env: opts.env });
	const projectEnv = getProjectEnvService({});
	const workspace = getWorkspaceService({
		exec,
		configPath: opts.configPath,
		defaultConfigPath: defaultConfigPath()
	});
	// Read through the workspace on every call, so a repository attached while the
	// agent runs is the one every service works in from that moment.
	const repoPath = () => workspace.repoPath();
	const repo = getRepoService({ exec, repoPath });

	return {
		bosunApi: getBosunApiService({
			serverUrl: opts.config.serverUrl,
			machineKey: opts.config.machineKey
		}),
		claudeAuth,
		commit: getCommitService({ exec }),
		env,
		exec,
		inputsKey: getInputsKeyService({}),
		mcpConfig,
		mcpProbe: getMcpProbeService(),
		memory,
		preflight: getPreflightService({
			exec,
			claudeAuth,
			mcpConfig,
			memory,
			projectEnv,
			workspace,
			repoPath
		}),
		projectEnv,
		repo,
		setupSteps: getSetupStepsService({ exec }),
		skills: getSkillsService({ repoPath }),
		stack: getStackService({ memory }),
		teardown: getTeardownService({}),
		toolchain: getToolchainService({ exec }),
		upgrade: getUpgradeService({ exec }),
		workspace,
		worktree: getWorktreeService({ exec, repo, repoPath })
	};
}

export type Services = ReturnType<typeof getServices>;
