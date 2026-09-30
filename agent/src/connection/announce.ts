import os from 'os';
import WebSocket from 'ws';
import { type Services } from '../services/index';
import { AGENT_VERSION } from '../version';
import { type FrameSink } from './frame-sink';
import { type RouterDeps } from './router';

export type AnnounceDeps = Pick<
	RouterDeps,
	'socket' | 'services' | 'sessions' | 'executions' | 'integrations' | 'onboarding' | 'bugfix' | 'quickFixes'
> & { sink: FrameSink };

// Sealed browser input is only possible once there is a key to seal to. A key file
// that cannot be read leaves the key out, which the backend reads as a machine that
// cannot take browser input — the honest answer — rather than failing the announce.
function publicKeyOf(services: Services): string | undefined {
	try {
		return services.inputsKey.ensure().publicKey;
	} catch (error) {
		console.error(`inputs key: ${error instanceof Error ? error.message : 'unreadable'}`);

		return undefined;
	}
}

// A config this agent no longer owns is logged and left out of `hello`, not thrown:
// the announce is what keeps the machine visible, and its preflight carries the
// reason to the browser.
function announcedRepoPath(services: Services): string | undefined {
	try {
		return services.workspace.repoPath() ?? undefined;
	} catch (error) {
		console.error(`config: ${error instanceof Error ? error.message : 'unreadable'}`);

		return undefined;
	}
}

// What `refresh` runs is deliberately the same thing `open` runs. Everything the
// agent reports is read from disk at this moment — the env file, the MCP config,
// the skills directories — so a token pasted in after the agent started, or a
// server added since, takes effect without a restart.
export function createAnnouncer(deps: AnnounceDeps) {
	return async function announce(reason: 'connect' | 'refresh' | 'change'): Promise<void> {
		if (deps.socket.readyState !== WebSocket.OPEN) {
			return;
		}

		// `markOnline` leaves a paused row paused, so re-announcing cannot silently
		// un-pause a machine.
		deps.socket.send(
			JSON.stringify({
				type: 'hello',
				agentVersion: AGENT_VERSION,
				hostname: os.hostname(),
				repoPath: announcedRepoPath(deps.services),
				reason,
				// Every run whose outcome this agent is still going to report: the ones
				// it is building, and the ones that settled while the connection was
				// down and are parked in the sink. A reconnect is otherwise
				// indistinguishable from an agent that came back with nothing, and the
				// backend settles every run it cannot account for — which would reset
				// the very sessions this connection was opened to keep reporting on.
				runIds: [...new Set([...deps.executions.held(), ...deps.sink.pendingRunIds()])],
				// The grills this agent is still holding, for the same reason: a
				// planning session outlives the socket it was started on, and a backend
				// that failed every `planning` plan on a reconnect would kill the grill
				// the person is in the middle of answering.
				planIds: [...new Set([...deps.sessions.held(), ...deps.sink.pendingPlanIds()])],
				onboardingRunIds: [
					...new Set([...deps.onboarding.held(), ...deps.sink.pendingOnboardingRunIds()])
				],
				integrationIds: [
					...new Set([...deps.integrations.held(), ...deps.sink.pendingIntegrationIds()])
				],
				bugfixSessionIds: [
					...new Set([...deps.bugfix.held(), ...deps.sink.pendingBugfixSessionIds()])
				],
				quickFixIds: [
					...new Set([...deps.quickFixes.held(), ...deps.sink.pendingQuickFixIds()])
				],
				uptimeMs: Math.round(process.uptime() * 1000),
				// What the scheduler budgets this machine's bullets against, and how the
				// agent process before this one ended. Together they are how a bullet
				// stranded by the kernel killing the agent reads as out of memory rather
				// than as a restart nobody can explain.
				memory: deps.services.memory.report(),
				previousExit: deps.services.memory.previousExit() ?? undefined,
				// Key names per path, so the browser can show what this machine holds
				// without a value ever leaving it. Read from disk like everything above:
				// a store restored or emptied by hand is otherwise invisible.
				envSets: deps.services.projectEnv.summary(),
				sessionSecrets: deps.services.projectEnv.secretNames(),
				publicKey: publicKeyOf(deps.services),
				repositoryId: deps.services.workspace.repositoryId()
			})
		);

		const checks = await deps.services.preflight.collect();

		// Also logged, not only sent: preflight results otherwise exist solely in the
		// browser, and the person debugging a red check is usually on the box reading
		// journalctl.
		for (const check of checks.filter((entry) => !entry.ok)) {
			console.error(`preflight ${check.name}: ${check.detail ?? 'failed'}`);
		}

		if (deps.socket.readyState === WebSocket.OPEN) {
			deps.socket.send(JSON.stringify({ type: 'preflight', checks }));
		}
	};
}
