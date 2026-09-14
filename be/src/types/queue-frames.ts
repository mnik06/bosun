import { z } from 'zod';

export const QueueAnswerTextMsgSchema = z.object({
	type: z.literal('queue.answer.text'),
	queueId: z.string(),
	askId: z.string(),
	delta: z.string()
});

export const QueueAnswerDoneMsgSchema = z.object({
	type: z.literal('queue.answer.done'),
	queueId: z.string(),
	askId: z.string(),
	content: z.string()
});

export const QueueAnswerErrorMsgSchema = z.object({
	type: z.literal('queue.answer.error'),
	queueId: z.string(),
	askId: z.string(),
	message: z.string()
});

export const QueuePublishedMsgSchema = z.object({
	type: z.literal('queue.published'),
	itemId: z.string(),
	prUrl: z.string()
});

export const QueuePublishErrorMsgSchema = z.object({
	type: z.literal('queue.publish.error'),
	itemId: z.string(),
	message: z.string()
});

export const QueueWorktreeReadyMsgSchema = z.object({
	type: z.literal('queue.worktree.ready'),
	queueId: z.string(),
	worktreePath: z.string(),
	baseRef: z.string()
});

export const QueueWorktreeErrorMsgSchema = z.object({
	type: z.literal('queue.worktree.error'),
	queueId: z.string(),
	message: z.string()
});
