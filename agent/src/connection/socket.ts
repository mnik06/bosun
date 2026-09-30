import path from 'path';
import WebSocket, { type RawData } from 'ws';
import { createAskSessions } from '../ask/session';
import { createBugfixSessions, type BugfixSessions } from '../bugfix/session';
import { type AgentConfig } from '../config/config';
import { createExecutionSessions, type ExecutionSessions } from '../execution/session';
import { createIntegrationSessions, type IntegrationSessions } from '../integration/session';
import { createOnboardingSessions, type OnboardingSessions } from '../onboarding/session';
import { createPlanningSessions, type PlanningSessions } from '../planning/session';
import { planningPrompt, revisionPrompt } from '../prompts/planning';
import { summaryPrompt } from '../prompts/summary';
import { type AgentMsg } from '../protocol';
import { createQuickFixSessions, type QuickFixSessions } from '../quick-fix/session';
import { type Services } from '../services/index';
import { createSummarySessions } from '../summary/session';
import { sleep } from '../utils';
import { createAnnouncer } from './announce';
import { backoffDelay, nextAttempt } from './backoff';
import { watchBosunFiles } from './file-watch';
import { createFrameSink, type FrameSink } from './frame-sink';
import { parseServerFrame, routeServerFrame, type AgentState, type RouterDeps } from './router';
import { createUpgradeControl } from './upgrade-control';

// A refused upgrade carrying a well-formed key means the credential was
// destroyed on purpose. Retrying cannot fix it, and retrying forever is how a
// deleted machine turns into a process that reconnects until someone notices.
class RevokedError extends Error {}

function socketUrl(serverUrl: string): string {
	const url = new URL(serverUrl);

	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.pathname = '/agent/ws';

	return url.toString();
}

interface ConnectionDeps {
	config: AgentConfig;
	configPath: string;
	services: Services;
	state: AgentState;
	// All three outlive the connection, which is the point of them being passed in
	// rather than built here: see `holdConnection`.
	sink: FrameSink;
	executions: ExecutionSessions;
	integrations: IntegrationSessions;
	sessions: PlanningSessions;
	onboarding: OnboardingSessions;
	bugfix: BugfixSessions;
	quickFixes: QuickFixSessions;
	// The current connection's announce, so a file changing under ~/.bosun reaches
	// whichever socket is open, and nothing at all while none is.
	announcer: { current: ((reason: 'change') => Promise<void>) | null };
}

// Dropped rather than queued, for the per-connection senders only — ask
// sessions and the upgrade handshake. Both are answers to something this
// socket asked for, so replaying one on the next connection would be
// answering a question nobody is waiting on. Everything that outlives the
// connection sends through the sink instead.
function socketSender(socket: WebSocket): (message: AgentMsg) => void {
	return (message) => {
		if (socket.readyState !== WebSocket.OPEN) {
			console.error(`dropped ${message.type}: the connection is not open`);

			return;
		}

		socket.send(JSON.stringify(message));
	};
}

function frameHandler(routerDeps: RouterDeps): (raw: RawData) => void {
	return (raw) => {
		const msg = parseServerFrame(raw.toString());

		if (!msg) {
			return;
		}

		void routeServerFrame(routerDeps, msg).catch((error: unknown) => {
			// Nothing awaits a frame, so a handler that throws is otherwise an
			// unhandled rejection — and that ends the agent and every session on it.
			console.error(`${msg.type}: ${error instanceof Error ? error.message : String(error)}`);
		});
	};
}

async function connectOnce(deps: ConnectionDeps): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const socket = new WebSocket(socketUrl(deps.config.serverUrl), {
			headers: { Authorization: `Bearer ${deps.config.machineKey}` }
		});
		const send = socketSender(socket);
		const summaries = createSummarySessions({
			config: deps.config,
			services: deps.services,
			prompt: summaryPrompt
		});
		const asks = createAskSessions({ services: deps.services, send });
		const announce = createAnnouncer({ ...deps, socket });
		const upgrades = createUpgradeControl({ ...deps, send });
		let settled = false;

		const settle = (error?: Error) => {
			if (settled) {
				return;
			}

			settled = true;

			if (error) {
				reject(error);
			} else {
				resolve();
			}
		};

		// `executions` and `sessions` are deliberately absent: neither a bullet nor
		// a grill is cancelled by the socket it happened to be dispatched over.
		// Detaching parks their frames until the next connection instead of
		// throwing the session away.
		const detach = () => {
			deps.announcer.current = null;
			deps.sink.detach();
			summaries.cancelAll();
			asks.cancelAll();
		};

		socket.on('open', () => {
			const paused = deps.state.paused ? ' (paused by bosun)' : '';

			console.log(`connected to ${deps.config.serverUrl}${paused}`);
			deps.services.upgrade.clearProbation();
			// Announced before the sink is attached, and `announce` sends `hello`
			// before its first await, so the backend learns which runs survived
			// before any frame buffered during the outage arrives to describe one.
			deps.announcer.current = announce;
			void announce('connect');
			deps.sink.attach((message: AgentMsg) => {
				socket.send(JSON.stringify(message));
			});
		});

		socket.on(
			'message',
			frameHandler({
				socket,
				services: deps.services,
				configPath: deps.configPath,
				state: deps.state,
				sessions: deps.sessions,
				executions: deps.executions,
				integrations: deps.integrations,
				onboarding: deps.onboarding,
				quickFixes: deps.quickFixes,
				summaries,
				asks,
				bugfix: deps.bugfix,
				sink: deps.sink.send,
				announce,
				onUpgrade: upgrades.onUpgrade
			})
		);

		socket.on('unexpected-response', (_req, res) => {
			settle(
				res.statusCode === 401
					? new RevokedError('this machine is no longer registered with bosun')
					: new Error(`server refused the connection (${res.statusCode})`)
			);
		});

		socket.on('error', (error) => {
			upgrades.stop();
			detach();
			settle(error);
		});

		socket.on('close', () => {
			detach();
			settle();
		});
	});
}

export async function holdConnection(opts: {
	config: AgentConfig;
	configPath: string;
	services: Services;
}): Promise<never> {
	let attempt = 0;
	const state: AgentState = { paused: false };
	// Outside the loop, which is the whole fix: a bullet is not tied to the socket
	// it was dispatched over. `claude` keeps building through a backend deploy, and
	// the sessions map plus the frames they produced while nothing was listening
	// have to still be here when the connection comes back.
	const sink = createFrameSink();
	const executions = createExecutionSessions({ services: opts.services, send: sink.send });
	// A grill is a conversation with a person, and a person does not stop being in
	// the middle of one because a proxy dropped an idle socket or the backend
	// deployed. The session survives the gap and reports on whatever connection is
	// current; `hello` names the ones it still holds so the backend can settle the
	// rest.
	const sessions = createPlanningSessions({
		config: opts.config,
		services: opts.services,
		prompt: planningPrompt,
		revisionPrompt,
		send: sink.send
	});

	// The children are detached so cancelling reaps their process groups, which
	// also means nothing reaps them when this process is stopped. That was
	// tolerable while a grill died with its socket; a session that now survives
	// reconnects would otherwise leave a `claude` holding a port, a worktree and a
	// credential behind every `systemctl restart`.
	const onboarding = createOnboardingSessions({ services: opts.services, send: sink.send });
	// An integration outlives the socket for the same reason a bullet does: it is a
	// merge, a regenerate and a check run in a worktree, none of which needs bosun
	// listening until it has something to say.
	const integrations = createIntegrationSessions({ services: opts.services, send: sink.send });
	// A bug-fixing session outlives the socket on the same terms as a grill: a
	// person pastes more bugs into the same chat later, and the warm `claude`
	// process is what answers.
	const bugfix = createBugfixSessions({ services: opts.services, send: sink.send });
	// A quick fix outlives the socket for the same reason a bullet does: it is a
	// branch, a fix and a push in a worktree, none of which needs bosun listening
	// until it has something to say.
	const quickFixes = createQuickFixSessions({ services: opts.services, send: sink.send });
	const announcer: ConnectionDeps['announcer'] = { current: null };

	// Stacks are reaped here too: an app a session started runs in a process group
	// of its own, so nothing else stops it when the agent does.
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => {
			sessions.cancelAll();
			executions.cancelAll();
			integrations.cancelAll();
			onboarding.cancelAll();
			bugfix.cancelAll();
			quickFixes.cancelAll();
			void opts.services.stack.downAll().finally(() => {
				process.exit(0);
			});
		});
	}

	// The wizard, `mcp add` and a hand edit all write these files. Watching them is
	// what turns the browser's checklist green as they land, with no Refresh.
	watchBosunFiles({
		dir: path.dirname(opts.services.projectEnv.storePath),
		onChange: () => {
			void announcer.current?.('change');
		}
	});

	for (;;) {
		try {
			await connectOnce({ ...opts, state, sink, executions, integrations, sessions, onboarding, bugfix, quickFixes, announcer });
			console.log('connection closed');
			attempt = 0;
		} catch (error) {
			if (error instanceof RevokedError) {
				await opts.services.teardown.terminateSelf({
					configPath: opts.configPath,
					reason: error.message
				});
			}

			console.error(error instanceof Error ? error.message : error);
		}

		const delay = backoffDelay(attempt);

		attempt = nextAttempt(attempt);
		console.log(`reconnecting in ${Math.round(delay / 100) / 10}s`);
		await sleep(delay);
	}
}
