import { getAgentReleaseService } from 'src/services/agent-release/agent-release.service';
import { getSupabaseAdmin } from 'src/services/auth/supabase-admin.service';
import { getSupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { getGithubAppService } from 'src/services/github/github-app.service';
import { getIdService } from 'src/services/ids/id.service';
import { getInstallerService } from 'src/services/installer/installer.service';
import { getKeyService } from 'src/services/keys/key.service';
import { getLineLockService } from 'src/services/line/line-lock.service';
import { getMcpPresetService } from 'src/services/mcp-presets/mcp-preset.service';
import { getWebPushService } from 'src/services/notifications/web-push.service';
import { getPlanTextService } from 'src/services/plans/plan-text.service';
import { getRunActivityService } from 'src/services/runs/run-activity.service';
import { getDisconnectGraceService } from 'src/services/sockets/disconnect-grace.service';
import { getMachineMemoryService } from 'src/services/sockets/machine-memory.service';
import { getPendingEnvRequestsService } from 'src/services/sockets/pending-env-requests.service';
import { getPendingPingsService } from 'src/services/sockets/pending-pings.service';
import { getPendingUpgradesService } from 'src/services/sockets/pending-upgrades.service';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { getTicketService } from 'src/services/tickets/ticket.service';
import { type Env } from 'src/types/EnvSchema';

export function getServices(opts: { env: Env }) {
	const keyService = getKeyService();

	return {
		agentRelease: getAgentReleaseService({
			pinnedVersion: opts.env.AGENT_EXPECTED_VERSION,
			latestReleaseUrl: opts.env.AGENT_LATEST_RELEASE_URL,
			downloadBaseUrl: opts.env.AGENT_DOWNLOAD_BASE_URL
		}),
		disconnectGrace: getDisconnectGraceService(),
		githubApp: getGithubAppService({
			appId: opts.env.GITHUB_APP_ID,
			slug: opts.env.GITHUB_APP_SLUG,
			clientId: opts.env.GITHUB_APP_CLIENT_ID,
			clientSecret: opts.env.GITHUB_APP_CLIENT_SECRET,
			privateKey: opts.env.GITHUB_APP_PRIVATE_KEY
		}),
		idService: getIdService(),
		installerService: getInstallerService(),
		keyService,
		lineLock: getLineLockService(),
		machineMemory: getMachineMemoryService(),
		mcpPresets: getMcpPresetService(),
		pendingEnvRequests: getPendingEnvRequestsService(),
		pendingPings: getPendingPingsService(),
		pendingUpgrades: getPendingUpgradesService(),
		planTextService: getPlanTextService(),
		runActivity: getRunActivityService(),
		socketRegistry: getSocketRegistry(),
		supabaseAdmin: getSupabaseAdmin({
			url: opts.env.SUPABASE_URL,
			secretKey: opts.env.SUPABASE_SECRET_KEY
		}),
		supabaseAuth: getSupabaseAuth({
			url: opts.env.SUPABASE_URL,
			publishableKey: opts.env.SUPABASE_PUBLISHABLE_KEY
		}),
		ticketService: getTicketService({ keyService }),
		webPush: getWebPushService({
			publicKey: opts.env.VAPID_PUBLIC_KEY,
			privateKey: opts.env.VAPID_PRIVATE_KEY,
			subject: opts.env.VAPID_SUBJECT
		})
	};
}

export type Services = ReturnType<typeof getServices>;
