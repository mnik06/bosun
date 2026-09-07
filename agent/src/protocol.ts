import { z } from 'zod';

export const PreflightCheckSchema = z.object({
	name: z.string(),
	ok: z.boolean(),
	detail: z.string().optional()
});

export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

export const HelloMsgSchema = z.object({
	type: z.literal('hello'),
	agentVersion: z.string(),
	hostname: z.string(),
	repoPath: z.string(),
	// Absent from agents older than self-update, which is why it is optional and
	// why anything but an explicit refresh is never offered an upgrade.
	reason: z.enum(['connect', 'refresh']).optional()
});

export const PreflightMsgSchema = z.object({
	type: z.literal('preflight'),
	checks: z.array(PreflightCheckSchema)
});

export const PongMsgSchema = z.object({
	type: z.literal('pong'),
	id: z.string(),
	at: z.number()
});

export const PlanQuestionSchema = z.object({
	header: z.string(),
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string() })),
	multiSelect: z.boolean()
});

export type PlanQuestion = z.infer<typeof PlanQuestionSchema>;

// One entry per question in the same order, so an answer needs no key back to
// the question it belongs to and cannot be paired with the wrong one.
export const PlanAnswerSchema = z.object({ selected: z.array(z.string()).min(1) });

export type PlanAnswer = z.infer<typeof PlanAnswerSchema>;

export const PlanTextMsgSchema = z.object({
	type: z.literal('plan.text'),
	planId: z.string(),
	delta: z.string()
});

export const PlanActivityMsgSchema = z.object({
	type: z.literal('plan.activity'),
	planId: z.string(),
	label: z.string()
});

export const PlanQuestionMsgSchema = z.object({
	type: z.literal('plan.question'),
	planId: z.string(),
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema).min(1)
});

export const PlanDoneMsgSchema = z.object({
	type: z.literal('plan.done'),
	planId: z.string()
});

export const PlanErrorMsgSchema = z.object({
	type: z.literal('plan.error'),
	planId: z.string(),
	message: z.string()
});

export const ExecTextMsgSchema = z.object({
	type: z.literal('exec.text'),
	runId: z.string(),
	delta: z.string()
});

export const ExecActivityMsgSchema = z.object({
	type: z.literal('exec.activity'),
	runId: z.string(),
	label: z.string()
});

export const ExecQuestionMsgSchema = z.object({
	type: z.literal('exec.question'),
	runId: z.string(),
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema).min(1)
});

export const ExecDoneMsgSchema = z.object({
	type: z.literal('exec.done'),
	runId: z.string(),
	commitSha: z.string().nullable(),
	report: z.string()
});

export const ExecErrorMsgSchema = z.object({
	type: z.literal('exec.error'),
	runId: z.string(),
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

export const AgentMsgSchema = z.discriminatedUnion('type', [
	HelloMsgSchema,
	PreflightMsgSchema,
	PongMsgSchema,
	PlanTextMsgSchema,
	PlanActivityMsgSchema,
	PlanQuestionMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	QueueWorktreeReadyMsgSchema,
	QueueWorktreeErrorMsgSchema,
	ExecTextMsgSchema,
	ExecActivityMsgSchema,
	ExecQuestionMsgSchema,
	ExecDoneMsgSchema,
	ExecErrorMsgSchema,
	QueuePublishedMsgSchema,
	QueuePublishErrorMsgSchema
]);

export type AgentMsg = z.infer<typeof AgentMsgSchema>;

export const PingMsgSchema = z.object({
	type: z.literal('ping'),
	id: z.string()
});

export const RefreshMsgSchema = z.object({ type: z.literal('refresh') });

export const UpgradeMsgSchema = z.object({
	type: z.literal('upgrade'),
	version: z.string(),
	downloadBaseUrl: z.string()
});

export const PauseMsgSchema = z.object({ type: z.literal('pause') });

export const ResumeMsgSchema = z.object({ type: z.literal('resume') });

export const ShutdownMsgSchema = z.object({
	type: z.literal('shutdown'),
	reason: z.string()
});

export const PlanStartMsgSchema = z.object({
	type: z.literal('plan.start'),
	planId: z.string(),
	input: z.string()
});

export const PlanAnswerMsgSchema = z.object({
	type: z.literal('plan.answer'),
	planId: z.string(),
	questionId: z.string(),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const PlanCancelMsgSchema = z.object({
	type: z.literal('plan.cancel'),
	planId: z.string()
});

export const ExecSliceSchema = z.object({
	ordinal: z.number().int(),
	kind: z.enum(['build', 'verify']),
	title: z.string(),
	bodyMd: z.string().nullable()
});

// Everything the session needs travels in the frame. The agent holds no plan
// state of its own, so a slice dispatched after a reconnect needs no lookup and
// no cache that could disagree with the row the backend scheduled from.
export const ExecStartMsgSchema = z.object({
	type: z.literal('exec.start'),
	runId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	// True only for the first slice of a plan: later slices build on the commits
	// the earlier ones made rather than resetting over them.
	freshBranch: z.boolean(),
	afk: z.boolean(),
	planTitle: z.string(),
	planBodyMd: z.string(),
	slice: ExecSliceSchema,
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	doneSlices: z.array(z.object({ ordinal: z.number().int(), title: z.string() }))
});

export const ExecCancelMsgSchema = z.object({ type: z.literal('exec.cancel'), runId: z.string() });

export const ExecAnswerMsgSchema = z.object({
	type: z.literal('exec.answer'),
	runId: z.string(),
	questionId: z.string(),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const QueuePublishMsgSchema = z.object({
	type: z.literal('queue.publish'),
	itemId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	title: z.string(),
	body: z.string()
});

export const QueueWorktreeEnsureMsgSchema = z.object({
	type: z.literal('queue.worktree.ensure'),
	queueId: z.string(),
	slug: z.string()
});

export const QueueWorktreeRemoveMsgSchema = z.object({
	type: z.literal('queue.worktree.remove'),
	queueId: z.string(),
	slug: z.string()
});

export const ServerMsgSchema = z.discriminatedUnion('type', [
	PingMsgSchema,
	RefreshMsgSchema,
	UpgradeMsgSchema,
	PauseMsgSchema,
	ResumeMsgSchema,
	ShutdownMsgSchema,
	PlanStartMsgSchema,
	PlanAnswerMsgSchema,
	PlanCancelMsgSchema,
	QueueWorktreeEnsureMsgSchema,
	QueueWorktreeRemoveMsgSchema,
	ExecStartMsgSchema,
	ExecCancelMsgSchema,
	ExecAnswerMsgSchema,
	QueuePublishMsgSchema
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;

export type ExecStart = z.infer<typeof ExecStartMsgSchema>;
