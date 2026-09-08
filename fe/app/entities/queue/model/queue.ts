import { z } from 'zod'

export const QueueStatusSchema = z.enum([
	'provisioning',
	'idle',
	'running',
	'paused',
	'blocked',
	'stopped',
	'failed'
])

export type QueueStatus = z.infer<typeof QueueStatusSchema>

export const QueueSchema = z.object({
	id: z.string(),
	userId: z.string(),
	machineId: z.string(),
	name: z.string(),
	slug: z.string(),
	worktreePath: z.string().nullable(),
	baseRef: z.string().nullable(),
	afk: z.boolean(),
	status: QueueStatusSchema,
	failureReason: z.string().nullable(),
	createdAt: z.coerce.date()
})

export type Queue = z.infer<typeof QueueSchema>

export const QueueListSchema = z.array(QueueSchema)

export const QueueItemStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled'])

export type QueueItemStatus = z.infer<typeof QueueItemStatusSchema>

export const SliceRunStatusSchema = z.enum(['pending', 'running', 'done', 'failed'])

export type SliceRunStatus = z.infer<typeof SliceRunStatusSchema>

export const SliceRunDetailSchema = z.object({
	id: z.string(),
	queueItemId: z.string(),
	sliceId: z.string(),
	ordinal: z.number().int(),
	status: SliceRunStatusSchema,
	commitSha: z.string().nullable(),
	failureReason: z.string().nullable(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable(),
	sliceTitle: z.string(),
	sliceKind: z.enum(['build', 'verify'])
})

export type SliceRunDetail = z.infer<typeof SliceRunDetailSchema>

export const QueueItemDetailSchema = z.object({
	id: z.string(),
	queueId: z.string(),
	planId: z.string(),
	ordinal: z.number().int(),
	branch: z.string().nullable(),
	status: QueueItemStatusSchema,
	prUrl: z.string().nullable(),
	failureReason: z.string().nullable(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable(),
	planTitle: z.string().nullable(),
	runs: z.array(SliceRunDetailSchema)
})

export type QueueItemDetail = z.infer<typeof QueueItemDetailSchema>

export const QueueMessageSchema = z.object({
	id: z.string(),
	queueId: z.string(),
	role: z.enum(['user', 'assistant']),
	content: z.string(),
	createdAt: z.coerce.date()
})

export type QueueMessage = z.infer<typeof QueueMessageSchema>

export const QueueDetailSchema = z.object({
	queue: QueueSchema,
	items: z.array(QueueItemDetailSchema),
	messages: z.array(QueueMessageSchema)
})

export type QueueDetail = z.infer<typeof QueueDetailSchema>
