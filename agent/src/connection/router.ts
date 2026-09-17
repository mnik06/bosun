import WebSocket from 'ws';
import { type AskSessions } from '../ask/session';
import { type BugfixSessions } from '../bugfix/session';
import { type ExecutionSessions } from '../execution/session';
import { type IntegrationSessions } from '../integration/session';
import { type OnboardingSessions } from '../onboarding/session';
import { type PlanningSessions } from '../planning/session';
import { type SummarySessions } from '../summary/session';
import {
	ServerMsgSchema,
	type AgentMsg,
	type EnvVarInput,
	type SealedEnvVarInput,
	type ServerMsg
} from '../protocol';
import { type Services } from '../services/index';
import { ensureWorktree } from './worktree-ensure';

export interface AgentState {
	paused: boolean;
}

export function parseServerFrame(raw: string): ServerMsg | null {
	let json: unknown;

	try {
		json = JSON.parse(raw);
	} catch {
		console.error('dropped unparseable frame from server');

		return null;
	}

	const parsed = ServerMsgSchema.safeParse(json);

	if (!parsed.success) {
		console.error('dropped frame failing schema from server');

		return null;
	}

	return parsed.data;
}

export interface RouterDeps {
	socket: WebSocket;
	services: Services;
	configPath: string;
	state: AgentState;
	sessions: PlanningSessions;
	executions: ExecutionSessions;
	integrations: IntegrationSessions;
	onboarding: OnboardingSessions;
	summaries: SummarySessions;
	asks: AskSessions;
	bugfix: BugfixSessions;
	// Where outcomes that outlive this connection go: a worktree readied while the
	// socket was replaced still has to reach the backend.
	sink: (message: AgentMsg) => void;
	announce: (reason: 'connect' | 'refresh' | 'change') => Promise<void>;
	onUpgrade: (opts: { version: string; downloadBaseUrl: string; force: boolean }) => Promise<void>;
}

// Opened here, at the last moment before the store: the value exists in plaintext
// only on this machine and only for as long as it takes to write it.
function openVars(services: Services, vars: SealedEnvVarInput[]): EnvVarInput[] {
	return vars.map((entry) => ({
		key: entry.key,
		value: entry.value === null ? null : services.inputsKey.open(entry.value)
	}));
}

// Answered straight back on this socket, like `pong`: each is a reply to a request
// somebody is waiting on. Accepted while paused — storing a set is not work — and
// nothing is written into a worktree here; every bullet does that.
function changeEnv(deps: RouterDeps, msg: Extract<ServerMsg, { type: 'env.set' | 'env.delete' | 'secrets.set' }>): void {
	let reply: AgentMsg;
	const scope = msg.type === 'secrets.set' ? 'session secrets' : `env ${msg.path}`;

	try {
		if (msg.type === 'secrets.set') {
			const saved = deps.services.projectEnv.setSecrets(openVars(deps.services, msg.vars));

			reply = { type: 'env.saved', requestId: msg.requestId, ...saved };
		} else {
			const envSets =
				msg.type === 'env.set'
					? deps.services.projectEnv.set({ path: msg.path, vars: openVars(deps.services, msg.vars) })
					: deps.services.projectEnv.delete(msg.path);

			reply = {
				type: 'env.saved',
				requestId: msg.requestId,
				envSets,
				sessionSecrets: deps.services.projectEnv.secretNames()
			};
		}

		console.log(`${scope}: ${msg.type === 'env.delete' ? 'removed' : `saved ${msg.vars.map((entry) => entry.key).join(', ') || 'nothing'}`}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'could not change the stored values';

		console.error(`${scope}: ${message}`);
		reply = { type: 'env.error', requestId: msg.requestId, message };
	}

	deps.socket.send(JSON.stringify(reply));
}

// The clone can take minutes, and the answer settles what the browser shows about
// the machine. Re-announced after, so the new repository reaches `hello` and the
// git check turns green without anybody pressing Refresh.
async function attachRepository(deps: RouterDeps, msg: Extract<ServerMsg, { type: 'repo.attach' }>): Promise<void> {
	console.log(`repository ${msg.slug}: attaching`);

	const result = await deps.services.workspace.attach(msg);

	if (!result.ok) {
		console.error(`repository ${msg.slug}: ${result.detail}`);
		deps.socket.send(JSON.stringify({ type: 'repo.error', repositoryId: msg.repositoryId, message: result.detail }));

		return;
	}

	console.log(`repository ${msg.slug}: attached at ${result.repoPath}`);
	deps.socket.send(
		JSON.stringify({
			type: 'repo.attached',
			repositoryId: msg.repositoryId,
			repoPath: result.repoPath,
			configOnDefault: result.configOnDefault
		})
	);
	await deps.announce('change');
}

function refusePaused(deps: RouterDeps, reply: AgentMsg): boolean {
	if (!deps.state.paused) {
		return false;
	}

	deps.socket.send(JSON.stringify(reply));

	return true;
}

const PAUSED = 'this machine is paused';

async function routeBuildFrame(
	deps: RouterDeps,
	msg: Extract<ServerMsg, { type: `build.${string}` | `integrate.${string}` | 'line.ask' }>
): Promise<void> {
	switch (msg.type) {
		case 'build.worktree.ensure':
			if (refusePaused(deps, { type: 'build.worktree.error', buildId: msg.buildId, message: PAUSED })) {
				return;
			}

			await ensureWorktree({ services: deps.services, msg, send: deps.sink });

			return;

		case 'build.worktree.remove':
			await deps.services.worktree.remove(msg.slug);
			deps.services.setupSteps.forget(msg.slug);
			console.log(`worktree ${msg.slug}: removed`);

			return;

		case 'build.summarize':
			await deps.summaries.start(msg);

			return;

		case 'integrate.start':
			if (refusePaused(deps, { type: 'integrate.needs_you', integrationId: msg.integrationId, reason: 'error', detail: PAUSED })) {
				return;
			}

			await deps.integrations.start(msg);

			return;

		case 'integrate.cancel':
			deps.integrations.cancel(msg.integrationId);

			return;

		// A question is read-only and answers somebody who is waiting, so a paused
		// machine still takes it: pausing stops dispatching work, not asking.
		case 'line.ask':
			await deps.asks.ask(msg);
	}
}

// A switch rather than a chain with a fallthrough: the chain's last branch was
// `shutdown`, so every frame type added to the union terminated the agent until
// somebody remembered to add a case for it.
export async function routeServerFrame(deps: RouterDeps, msg: ServerMsg): Promise<void> {
	switch (msg.type) {
		case 'refresh':
			await deps.announce('refresh');

			return;

		case 'upgrade':
			await deps.onUpgrade({
				version: msg.version,
				downloadBaseUrl: msg.downloadBaseUrl,
				force: msg.force
			});

			return;

		case 'pause':
			deps.state.paused = true;
			console.log('paused by bosun — holding the connection, taking no work');

			return;

		case 'resume':
			deps.state.paused = false;
			console.log('resumed by bosun');

			return;

		case 'env.set':
		case 'env.delete':
		case 'secrets.set':
			changeEnv(deps, msg);

			return;

		case 'repo.attach':
			await attachRepository(deps, msg);

			return;

		case 'onboarding.start':
			if (refusePaused(deps, { type: 'onboarding.error', runId: msg.runId, message: PAUSED })) {
				return;
			}

			await deps.onboarding.start(msg);

			return;

		case 'onboarding.cancel':
			deps.onboarding.cancel(msg.runId);

			return;

		case 'plan.start':
			if (refusePaused(deps, { type: 'plan.error', planId: msg.planId, message: PAUSED })) {
				return;
			}

			await deps.sessions.start({
				planId: msg.planId,
				input: msg.input,
				verifyInUi: msg.verifyInUi,
				auto: msg.auto,
				notes: msg.notes,
				configDraft: msg.configDraft
			});

			return;

		case 'plan.say':
			await deps.sessions.say({
				planId: msg.planId,
				text: msg.text,
				notes: msg.notes,
				configDraft: msg.configDraft,
				plan: msg.plan
			});

			return;

		case 'plan.answer':
			deps.sessions.answer(msg);

			return;

		case 'plan.cancel':
			deps.sessions.cancel(msg.planId);

			return;

		case 'exec.start':
			if (refusePaused(deps, { type: 'exec.error', runId: msg.runId, message: PAUSED })) {
				return;
			}

			await deps.executions.start(msg);

			return;

		case 'exec.answer':
			deps.executions.answer(msg);

			return;

		case 'exec.cancel':
			deps.executions.cancel(msg.runId);

			return;

		case 'bugfix.start':
			if (refusePaused(deps, { type: 'bugfix.error', sessionId: msg.sessionId, buildId: msg.buildId, message: PAUSED })) {
				return;
			}

			await deps.bugfix.start(msg);

			return;

		case 'bugfix.say':
			deps.bugfix.say(msg);

			return;

		case 'bugfix.cancel':
			deps.bugfix.cancel(msg.sessionId);

			return;

		case 'build.worktree.ensure':
		case 'build.worktree.remove':
		case 'build.summarize':
		case 'integrate.start':
		case 'integrate.cancel':
		case 'line.ask':
			await routeBuildFrame(deps, msg);

			return;

		case 'shutdown':
			deps.sessions.cancelAll();
			deps.executions.cancelAll();
			deps.integrations.cancelAll();
			deps.onboarding.cancelAll();
			deps.asks.cancelAll();
			deps.bugfix.cancelAll();
			await deps.services.stack.downAll();
			await deps.services.teardown.terminateSelf({
				configPath: deps.configPath,
				reason: msg.reason
			});
	}
}
