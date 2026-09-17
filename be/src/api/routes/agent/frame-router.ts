import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { type WebSocket } from '@fastify/websocket';
import { recordLineAnswer } from 'src/controllers/line/ask-line';
import { lineDeps } from 'src/controllers/line/line-deps';
import { recordIntegrateFrame, recordWorktreeFrame } from 'src/controllers/line/record-build-frame';
import { recordExecFrame } from 'src/controllers/line/record-exec-frame';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { recordRepoFrame } from 'src/controllers/machines/record-repo-frame';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { recordOnboardingFrame } from 'src/controllers/onboarding/record-onboarding-frame';
import { recordPlanFrame } from 'src/controllers/plans/record-plan-frame';
import { recordBugfixFrame } from 'src/controllers/plans/bugfix/record-bugfix-frame';
import { recordQuickFixFrame } from 'src/controllers/quick-fixes/record-quick-fix-frame';
import { applyMachineFrame } from 'src/api/routes/agent/ws.route';
import { type AgentMsg } from 'src/types/protocol';

type PlanFrame = Extract<AgentMsg, { type: `plan.${string}` }>;
type WorktreeFrame = Extract<AgentMsg, { type: `build.worktree.${string}` }>;
type ExecFrame = Extract<AgentMsg, { type: `exec.${string}` }>;
type IntegrateFrame = Extract<AgentMsg, { type: `integrate.${string}` }>;
type AnswerFrame = Extract<AgentMsg, { type: `line.answer.${string}` }>;
type EnvReplyFrame = Extract<AgentMsg, { type: 'env.saved' | 'env.error' }>;
type RepoFrame = Extract<AgentMsg, { type: `repo.${string}` }>;
type OnboardingFrame = Extract<AgentMsg, { type: `onboarding.${string}` }>;
type QuickFixFrame = Extract<AgentMsg, { type: `quickfix.${string}` }>;

type BugfixFrame = Extract<AgentMsg, { type: `bugfix.${string}` }>;

function isBugfixFrame(msg: AgentMsg): msg is BugfixFrame {
	return msg.type.startsWith('bugfix.');
}

function isRepoFrame(msg: AgentMsg): msg is RepoFrame {
	return msg.type.startsWith('repo.');
}

function isOnboardingFrame(msg: AgentMsg): msg is OnboardingFrame {
	return msg.type.startsWith('onboarding.');
}

function isQuickFixFrame(msg: AgentMsg): msg is QuickFixFrame {
	return msg.type.startsWith('quickfix.');
}

function isPlanFrame(msg: AgentMsg): msg is PlanFrame {
	return msg.type.startsWith('plan.');
}

function isWorktreeFrame(msg: AgentMsg): msg is WorktreeFrame {
	return msg.type.startsWith('build.worktree.');
}

function isExecFrame(msg: AgentMsg): msg is ExecFrame {
	return msg.type.startsWith('exec.');
}

function isIntegrateFrame(msg: AgentMsg): msg is IntegrateFrame {
	return msg.type.startsWith('integrate.');
}

function isAnswerFrame(msg: AgentMsg): msg is AnswerFrame {
	return msg.type.startsWith('line.answer.');
}

function isEnvReplyFrame(msg: AgentMsg): msg is EnvReplyFrame {
	return msg.type === 'env.saved' || msg.type === 'env.error';
}

// Frames that settle work are handled one at a time, in arrival order: a run's
// `exec.done` and the integration the build starts next both move one build, and a
// transcript's appends collide when they overlap. A bug-fixing session's transcript
// is the same collision waiting to happen: two text deltas racing on the same
// build's `max(seq) + 1` insert.
export function isOrderedFrame(msg: AgentMsg): boolean {
	return isPlanFrame(msg) || isExecFrame(msg) || isWorktreeFrame(msg) || isIntegrateFrame(msg) || isBugfixFrame(msg);
}

function settleEnvReply(opts: {
	fastify: FastifyInstance;
	machineId: string;
	msg: EnvReplyFrame;
}): void {
	opts.fastify.services.pendingEnvRequests.settle({
		requestId: opts.msg.requestId,
		machineId: opts.machineId,
		result:
			opts.msg.type === 'env.saved'
				? { ok: true, envSets: opts.msg.envSets, sessionSecrets: opts.msg.sessionSecrets }
				: { ok: false, message: opts.msg.message }
	});
}

// Answers to something the backend asked this socket, none of which settles work.
function settleReply(opts: {
	fastify: FastifyInstance;
	machineId: string;
	projectId: string;
	msg: Extract<AgentMsg, { type: 'upgrade.declined' }> | EnvReplyFrame;
	log: FastifyBaseLogger;
}): void {
	const { msg } = opts;

	if (msg.type === 'upgrade.declined') {
		relayDecline({ ...opts, msg });

		return;
	}

	settleEnvReply({ fastify: opts.fastify, machineId: opts.machineId, msg });
}

async function handleRepositoryFrame(opts: {
	fastify: FastifyInstance;
	machineId: string;
	projectId: string;
	msg: RepoFrame | OnboardingFrame;
}): Promise<void> {
	const { msg } = opts;

	if (isRepoFrame(msg)) {
		await recordRepoFrame({
			machineRepo: opts.fastify.repos.machineRepo,
			repositoryRepo: opts.fastify.repos.repositoryRepo,
			socketRegistry: opts.fastify.services.socketRegistry,
			machineId: opts.machineId,
			projectId: opts.projectId,
			frame: msg
		});

		return;
	}

	await recordOnboardingFrame(onboardingDeps(opts.fastify), {
		machineId: opts.machineId,
		projectId: opts.projectId,
		frame: msg
	});
	// A settled run hands its memory back, so anything on the machine held behind
	// it gets to start now rather than on the next nudge.
	await scheduleMachine(lineDeps(opts.fastify), { machineId: opts.machineId });
}

// The refusal used to reach the machine's own log and stop there, so an operator
// watched a banner expire and read that as the upgrade being broken.
function relayDecline(opts: {
	fastify: FastifyInstance;
	machineId: string;
	projectId: string;
	msg: Extract<AgentMsg, { type: 'upgrade.declined' }>;
	log: FastifyBaseLogger;
}): void {
	opts.log.info(
		{ machineId: opts.machineId, version: opts.msg.version, reason: opts.msg.reason },
		'agent declined an upgrade'
	);
	opts.fastify.services.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: {
			type: 'machine.upgrade.declined',
			machineId: opts.machineId,
			to: opts.msg.version,
			reason: opts.msg.reason,
			retryable: opts.msg.retryable,
			queued: opts.msg.queued
		}
	});
}

async function handleLineFrame(opts: {
	fastify: FastifyInstance;
	machineId: string;
	projectId: string;
	msg: ExecFrame | WorktreeFrame | IntegrateFrame | AnswerFrame;
}): Promise<void> {
	const deps = lineDeps(opts.fastify);
	const { msg } = opts;

	if (isExecFrame(msg)) {
		await recordExecFrame(deps, { machineId: opts.machineId, projectId: opts.projectId, frame: msg });
	} else if (isWorktreeFrame(msg)) {
		await recordWorktreeFrame(deps, { machineId: opts.machineId, frame: msg });
	} else if (isIntegrateFrame(msg)) {
		await recordIntegrateFrame(deps, { machineId: opts.machineId, projectId: opts.projectId, frame: msg });
	} else {
		await recordLineAnswer(deps, { machineId: opts.machineId, projectId: opts.projectId, frame: msg });
	}
}

export async function handleAgentFrame(opts: {
	fastify: FastifyInstance;
	machineId: string;
	projectId: string;
	socket: WebSocket;
	// Passed through untouched for `hello`, which is the only frame that cares:
	// see `applyMachineFrame`.
	connectedAt: Date;
	msg: AgentMsg;
	log: FastifyBaseLogger;
}): Promise<void> {
	const { msg } = opts;

	if (msg.type === 'pong') {
		return;
	}

	if (msg.type === 'upgrade.declined' || isEnvReplyFrame(msg)) {
		settleReply({ ...opts, msg });

		return;
	}

	if (isRepoFrame(msg) || isOnboardingFrame(msg)) {
		await handleRepositoryFrame({ fastify: opts.fastify, machineId: opts.machineId, projectId: opts.projectId, msg });

		return;
	}

	if (isQuickFixFrame(msg)) {
		await recordQuickFixFrame(lineDeps(opts.fastify), { machineId: opts.machineId, frame: msg });

		return;
	}

	if (isExecFrame(msg) || isWorktreeFrame(msg) || isIntegrateFrame(msg) || isAnswerFrame(msg)) {
		await handleLineFrame({ fastify: opts.fastify, machineId: opts.machineId, projectId: opts.projectId, msg });

		return;
	}

	if (isPlanFrame(msg)) {
		const { socketRegistry, idService, planTextService, webPush } = opts.fastify.services;

		await recordPlanFrame({
			planRepo: opts.fastify.repos.planRepo,
			planMessageRepo: opts.fastify.repos.planMessageRepo,
			acRepo: opts.fastify.repos.acRepo,
			notificationRepo: opts.fastify.repos.notificationRepo,
			pushSubscriptionRepo: opts.fastify.repos.pushSubscriptionRepo,
			projectMemberRepo: opts.fastify.repos.projectMemberRepo,
			idService,
			planTextService,
			socketRegistry,
			webPush,
			appUrl: opts.fastify.env.PUBLIC_APP_URL,
			machineId: opts.machineId,
			frame: msg
		});

		return;
	}

	if (isBugfixFrame(msg)) {
		await recordBugfixFrame(lineDeps(opts.fastify), { machineId: opts.machineId, frame: msg });

		return;
	}

	await applyMachineFrame({ ...opts, msg });
}
