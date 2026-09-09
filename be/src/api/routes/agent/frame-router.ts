import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { type WebSocket } from '@fastify/websocket';
import { recordPlanFrame } from 'src/controllers/plans/record-plan-frame';
import { recordExecFrame } from 'src/controllers/queues/record-exec-frame';
import { askDeps } from 'src/controllers/queues/ask-deps';
import { recordAnswerFrame } from 'src/controllers/queues/record-answer-frame';
import { recordPublishFrame } from 'src/controllers/queues/record-publish-frame';
import { saveQueueWorktree } from 'src/controllers/queues/save-queue-worktree';
import { schedulerDeps } from 'src/controllers/queues/scheduler-deps';
import { applyMachineFrame } from 'src/api/routes/agent/ws.route';
import { type AgentMsg } from 'src/types/protocol';

type PlanFrame = Extract<AgentMsg, { type: `plan.${string}` }>;
type WorktreeFrame = Extract<AgentMsg, { type: `queue.worktree.${string}` }>;
type ExecFrame = Extract<AgentMsg, { type: `exec.${string}` }>;
type PublishFrame = Extract<AgentMsg, { type: 'queue.published' | 'queue.publish.error' }>;
type AnswerFrame = Extract<AgentMsg, { type: `queue.answer.${string}` }>;

export function isPlanFrame(msg: AgentMsg): msg is PlanFrame {
	return msg.type.startsWith('plan.');
}

function isWorktreeFrame(msg: AgentMsg): msg is WorktreeFrame {
	return msg.type.startsWith('queue.worktree.');
}

export function isExecFrame(msg: AgentMsg): msg is ExecFrame {
	return msg.type.startsWith('exec.');
}

function isAnswerFrame(msg: AgentMsg): msg is AnswerFrame {
	return msg.type.startsWith('queue.answer.');
}

function isPublishFrame(msg: AgentMsg): msg is PublishFrame {
	return msg.type === 'queue.published' || msg.type === 'queue.publish.error';
}

export async function handleAgentFrame(opts: {
	fastify: FastifyInstance;
	machineId: string;
	projectId: string;
	socket: WebSocket;
	msg: AgentMsg;
	log: FastifyBaseLogger;
}): Promise<void> {
	const { msg } = opts;
	const { pendingPings, socketRegistry, idService, planTextService } = opts.fastify.services;

	if (msg.type === 'pong') {
		const rttMs = pendingPings.resolve({
			commandId: msg.id,
			machineId: opts.machineId,
			at: Date.now()
		});

		if (rttMs !== null) {
			socketRegistry.broadcastToUi({
				projectId: opts.projectId,
				message: { type: 'machine.pong', machineId: opts.machineId, id: msg.id, rttMs }
			});
		}

		return;
	}

	if (isAnswerFrame(msg)) {
		await recordAnswerFrame(askDeps(opts.fastify), {
			machineId: opts.machineId,
			projectId: opts.projectId,
			frame: msg
		});

		return;
	}

	if (isPublishFrame(msg)) {
		await recordPublishFrame(schedulerDeps(opts.fastify), {
			machineId: opts.machineId,
			frame: msg
		});

		return;
	}

	if (isExecFrame(msg)) {
		await recordExecFrame(schedulerDeps(opts.fastify), {
			machineId: opts.machineId,
			projectId: opts.projectId,
			frame: msg
		});

		return;
	}

	if (isWorktreeFrame(msg)) {
		await saveQueueWorktree({
			queueRepo: opts.fastify.repos.queueRepo,
			socketRegistry,
			machineId: opts.machineId,
			frame: msg
		});

		return;
	}

	if (isPlanFrame(msg)) {
		await recordPlanFrame({
			planRepo: opts.fastify.repos.planRepo,
			planMessageRepo: opts.fastify.repos.planMessageRepo,
			acRepo: opts.fastify.repos.acRepo,
			idService,
			planTextService,
			socketRegistry,
			machineId: opts.machineId,
			frame: msg
		});

		return;
	}

	await applyMachineFrame({ ...opts, msg });
}
