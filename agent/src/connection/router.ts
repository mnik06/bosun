import WebSocket from 'ws';
import { type AskSessions } from '../ask/session';
import { type ExecutionSessions } from '../execution/session';
import { type PlanningSessions } from '../planning/session';
import { type SummarySessions } from '../summary/session';
import { ServerMsgSchema, type ServerMsg } from '../protocol';
import { type Services } from '../services/index';

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
	summaries: SummarySessions;
	asks: AskSessions;
	announce: (reason: 'connect' | 'refresh') => Promise<void>;
	onUpgrade: (opts: { version: string; downloadBaseUrl: string; force: boolean }) => Promise<void>;
}

// A switch rather than a chain with a fallthrough: the chain's last branch was
// `shutdown`, so every frame type added to the union terminated the agent until
// somebody remembered to add a case for it.
export async function routeServerFrame(deps: RouterDeps, msg: ServerMsg): Promise<void> {
	switch (msg.type) {
		case 'ping':
			deps.socket.send(JSON.stringify({ type: 'pong', id: msg.id, at: Date.now() }));

			return;

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

		case 'plan.start':
			if (deps.state.paused) {
				deps.socket.send(
					JSON.stringify({
						type: 'plan.error',
						planId: msg.planId,
						message: 'this machine is paused'
					})
				);

				return;
			}

			await deps.sessions.start({
				planId: msg.planId,
				input: msg.input,
				verifyInUi: msg.verifyInUi,
				auto: msg.auto,
				notes: msg.notes
			});

			return;

		case 'plan.prepare':
			if (deps.state.paused) {
				deps.socket.send(
					JSON.stringify({
						type: 'plan.error',
						planId: msg.planId,
						message: 'this machine is paused'
					})
				);

				return;
			}

			await deps.sessions.prepare({
				planId: msg.planId,
				planNumber: msg.planNumber,
				auto: msg.auto,
				plans: msg.plans,
				notes: msg.notes
			});

			return;

		case 'plan.say':
			await deps.sessions.say({
				planId: msg.planId,
				text: msg.text,
				notes: msg.notes,
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
			if (deps.state.paused) {
				deps.socket.send(
					JSON.stringify({
						type: 'exec.error',
						runId: msg.runId,
						message: 'this machine is paused'
					})
				);

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

		case 'queue.ask':
			await deps.asks.ask(msg);

			return;

		case 'queue.summarize':
			await deps.summaries.start(msg);

			return;

		case 'queue.publish': {
			const result = await deps.services.publish.publish({
				worktreePath: msg.worktreePath,
				branch: msg.branch,
				baseRef: msg.baseRef,
				title: msg.title,
				body: msg.body
			});

			console.log(`publish ${msg.branch}: ${result.detail}`);
			deps.socket.send(
				JSON.stringify(
					result.ok && result.prUrl
						? { type: 'queue.published', itemId: msg.itemId, prUrl: result.prUrl }
						: { type: 'queue.publish.error', itemId: msg.itemId, message: result.detail }
				)
			);

			return;
		}

		case 'queue.worktree.ensure': {
			const result = await deps.services.worktree.ensure({ slug: msg.slug });

			if (result.ok && msg.setupCommand) {
				const setup = await deps.services.worktree.setup({
					slug: msg.slug,
					command: msg.setupCommand
				});

				console.log(`worktree ${msg.slug}: ${setup.detail}`);
			}

			console.log(`worktree ${msg.slug}: ${result.detail}`);
			deps.socket.send(
				JSON.stringify(
					result.ok
						? {
							type: 'queue.worktree.ready',
							queueId: msg.queueId,
							worktreePath: result.worktreePath,
							baseRef: result.baseRef
						}
						: { type: 'queue.worktree.error', queueId: msg.queueId, message: result.detail }
				)
			);

			return;
		}

		case 'queue.worktree.remove':
			await deps.services.worktree.remove(msg.slug);
			console.log(`worktree ${msg.slug}: removed`);

			return;

		case 'shutdown':
			deps.sessions.cancelAll();
			deps.executions.cancelAll();
			deps.asks.cancelAll();
			await deps.services.teardown.terminateSelf({
				configPath: deps.configPath,
				reason: msg.reason
			});
	}
}
