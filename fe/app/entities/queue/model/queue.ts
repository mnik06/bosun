import { z } from 'zod'

export const QueueStatusSchema = z.enum([
	'provisioning',
	'idle',
	'running',
	'paused',
	'blocked',
	'failed'
])

export type QueueStatus = z.infer<typeof QueueStatusSchema>

export const QueueSchema = z.object({
	id: z.string(),
	projectId: z.string(),
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

// The queue's own copy of the question shape. An entity never reaches into a
// sibling entity, and this is the same three fields either way.
export const QueueQuestionSchema = z.object({
	header: z.string(),
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string() })),
	multiSelect: z.boolean()
})

export type QueueQuestion = z.infer<typeof QueueQuestionSchema>

export const SliceRunDetailSchema = z.object({
	id: z.string(),
	queueItemId: z.string(),
	sliceId: z.string(),
	ordinal: z.number().int(),
	status: SliceRunStatusSchema,
	questionId: z.string().nullable(),
	question: z.array(QueueQuestionSchema).nullable(),
	commitSha: z.string().nullable(),
	report: z.string().nullish().default(null),
	failureReason: z.string().nullable(),
	startedAt: z.coerce.date().nullable(),
	finishedAt: z.coerce.date().nullable(),
	sliceTitle: z.string(),
	// What the run is doing as of this read. Socket frames overwrite it while the
	// tab is open; this is what a reload or a reconnect has instead of nothing.
	//
	// Optional because this app and the backend deploy separately: a field the
	// running backend has not shipped yet must leave the page working rather than
	// fail the parse for every run on it.
	activity: z.string().nullish().default(null),
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
	// The blockers holding this item back, wherever in the project they were
	// queued. Optional for the same reason `activity` is: the running backend may
	// not have shipped it yet, and a missing field must leave the page working.
	waitingFor: z
		.array(z.object({ number: z.number().int(), title: z.string().nullable() }))
		.nullish()
		.default([]),
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
