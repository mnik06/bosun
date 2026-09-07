import { getBosunApiService } from './bosun-api.service';
import { getClaudeAuthService } from './claude-auth.service';
import { getExecService } from './exec.service';
import { getPreflightService } from './preflight.service';
import { getSystemdService } from './systemd.service';
import { type AgentConfig } from '../config/config';

export function getServices(opts: { config: AgentConfig; env: NodeJS.ProcessEnv }) {
	const exec = getExecService();
	const claudeAuth = getClaudeAuthService({ exec, env: opts.env });

	return {
		bosunApi: getBosunApiService({
			serverUrl: opts.config.serverUrl,
			machineKey: opts.config.machineKey
		}),
		claudeAuth,
		exec,
		preflight: getPreflightService({ exec, claudeAuth }),
		systemd: getSystemdService()
	};
}

export type Services = ReturnType<typeof getServices>;
