import { z } from 'zod';
import { PlanQuestionSchema } from 'src/types/PlanSchema';

// `provisioning` is a real state, not a nicety: creating a worktree is a command
// sent to a machine that may be offline, so a queue exists in the browser before
// it exists on disk.
export const QueueStatusSchema = z.enum([
	'provisioning',
	'idle',
	'running',
	'paused',
	'blocked',
	'failed'
]);

export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const QueueSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	machineId: z.string(),
	name: z.string(),
	slug: z.string(),
	worktreePath: z.string().nullable(),
	baseRef: z.string().nullable(),
	// Whether a session may stop and ask. Held on the queue rather than the run
	// because it is a property of how the operator intends to watch it.
	afk: z.boolean(),
	portBase: z.number().int(),
	status: QueueStatusSchema,
	failureReason: z.string().nullable(),
	createdAt: z.coerce.date()
});

export type Queue = z.infer<typeof QueueSchema>;

export const QueueListSchema = z.array(QueueSchema);

export const QueueItemStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);

export type QueueItemStatus = z.infer<typeof QueueItemStatusSchema>;

export const QueueItemSchema = z.object({
	id: z.string(),
	queueId: z.string(),
	planId: z.string(),
	ordinal: z.number().int(),
	branch: z.string().nullable(),
	status: QueueItemStatusSchema,
	prUrl: z.string().nullable(),
	failureReason: z.string().nullable(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable()
});

export type QueueItem = z.infer<typeof QueueItemSchema>;

export const SliceRunStatusSchema = z.enum(['pending', 'running', 'done', 'failed']);

export type SliceRunStatus = z.infer<typeof SliceRunStatusSchema>;

export const SliceRunSchema = z.object({
	id: z.string(),
	queueItemId: z.string(),
	sliceId: z.string(),
	ordinal: z.number().int(),
	status: SliceRunStatusSchema,
	questionId: z.string().nullable(),
	question: z.array(PlanQuestionSchema).nullable(),
	commitSha: z.string().nullable(),
	failureReason: z.string().nullable(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable()
});

export type SliceRun = z.infer<typeof SliceRunSchema>;

// A queue name is typed by a person and becomes a directory and a branch, so it
// is reduced to something git and a filesystem both accept rather than trusted.
export function toQueueSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}

export const SliceRunDetailSchema = SliceRunSchema.extend({
	sliceTitle: z.string(),
	// What the session is doing right now. Lives in the server's memory rather
	// than on the row, so it is null for anything not currently running and after
	// a restart.
	activity: z.string().nullable(),
	sliceKind: z.enum(['build', 'verify'])
});

export type SliceRunDetail = z.infer<typeof SliceRunDetailSchema>;

export const QueueItemDetailSchema = QueueItemSchema.extend({
	planTitle: z.string().nullable(),
	runs: z.array(SliceRunDetailSchema)
});

export type QueueItemDetail = z.infer<typeof QueueItemDetailSchema>;

export const QueueMessageRoleSchema = z.enum(['user', 'assistant']);

export type QueueMessageRole = z.infer<typeof QueueMessageRoleSchema>;

export const QueueMessageSchema = z.object({
	id: z.string(),
	queueId: z.string(),
	role: QueueMessageRoleSchema,
	content: z.string(),
	createdAt: z.coerce.date()
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;

export const QueueDetailSchema = z.object({
	queue: QueueSchema,
	items: z.array(QueueItemDetailSchema),
	messages: z.array(QueueMessageSchema)
});

export type QueueDetail = z.infer<typeof QueueDetailSchema>;

