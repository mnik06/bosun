import { z } from 'zod';
import { ProjectProfileSchema } from './project-profile';

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
	reason: z.enum(['connect', 'refresh']).optional(),
	// The bullets still running on this machine. Optional for the same reason:
	// an agent that predates surviving reconnects holds nothing across one, and
	// absent has to keep meaning exactly that.
	runIds: z.array(z.string()).optional()
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
	questions: z.array(PlanQuestionSchema).min(1),
	// Present only in auto mode, where the session answered itself. Carried on the
	// question rather than sent as a second frame so the transcript cannot record
	// a question that is briefly, and wrongly, waiting on somebody.
	autoAnswers: z.array(PlanAnswerSchema).min(1).optional()
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
	QueuePublishErrorMsgSchema,
	QueueAnswerTextMsgSchema,
	QueueAnswerDoneMsgSchema,
	QueueAnswerErrorMsgSchema
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
	input: z.string(),
	verifyInUi: z.boolean().default(true),
	auto: z.boolean().default(false),
	// The operator's notes from the machine's project setup. Planning gets them
	// for the same reason execution does: a convention nobody can read off the
	// code — a skill this repository expects a session to invoke, a rule the team
	// keeps in its head — is exactly what a session cannot discover for itself.
	notes: z.string().nullable().default(null)
});

// The published plan as it stands, carried on the frame rather than fetched:
// the agent keeps no plan state, so a revision session that starts an hour after
// the grill ended needs the artifact handed to it.
export const PlanSnapshotSchema = z.object({
	verifyInUi: z.boolean(),
	auto: z.boolean(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	acs: z.array(
		z.object({
			code: z.string(),
			text: z.string(),
			sliceOrdinal: z.number().int().nullable()
		})
	),
	slices: z.array(
		z.object({
			ordinal: z.number().int(),
			kind: z.enum(['build', 'verify']),
			title: z.string(),
			bodyMd: z.string().nullable()
		})
	)
});

// A line the person typed into the plan's chat. It reaches a live session as
// another turn on its stdin; when the session is already over it starts a
// revision session with the published plan in front of it.
export type PlanSnapshot = z.infer<typeof PlanSnapshotSchema>;

export const PlanSayMsgSchema = z.object({
	type: z.literal('plan.say'),
	planId: z.string(),
	text: z.string(),
	notes: z.string().nullable().default(null),
	plan: PlanSnapshotSchema
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
	planId: z.string(),
	sliceId: z.string(),
	planNumber: z.number().int(),
	planTitle: z.string(),
	planBodyMd: z.string(),
	// Everything a session cannot work out by reading the repository, plus the
	// port range this queue owns. Sent per run rather than read from disk so a
	// profile edited in the browser takes effect on the next bullet.
	profile: ProjectProfileSchema,
	portBase: z.number().int(),
	slice: ExecSliceSchema,
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	// Every criterion in the plan, not only this bullet's — a verify bullet is
	// measured against the whole feature.
	planAcs: z.array(z.object({ code: z.string(), text: z.string() })),
	decisions: z.array(
		z.object({ fork: z.string(), chose: z.string() })
	),
	doneSlices: z.array(z.object({ ordinal: z.number().int(), title: z.string() }))
});

export const ExecCancelMsgSchema = z.object({ type: z.literal('exec.cancel'), runId: z.string() });

export const ExecAnswerMsgSchema = z.object({
	type: z.literal('exec.answer'),
	runId: z.string(),
	questionId: z.string(),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const QueueAskMsgSchema = z.object({
	type: z.literal('queue.ask'),
	queueId: z.string(),
	askId: z.string(),
	worktreePath: z.string(),
	question: z.string(),
	// The state bosun holds, rendered for the session. It reads the worktree for
	// everything else, but the statuses and the failure reasons live here.
	state: z.string(),
	transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
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

// Sent after the pull request is asked for, not instead of it: the summary is a
// convenience and the branch is the deliverable, so a machine that cannot write
// one still opens the PR.
export const QueueSummarizeMsgSchema = z.object({
	type: z.literal('queue.summarize'),
	planId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	planTitle: z.string(),
	planBodyMd: z.string()
});

export const QueueWorktreeEnsureMsgSchema = z.object({
	type: z.literal('queue.worktree.ensure'),
	queueId: z.string(),
	slug: z.string(),
	setupCommand: z.string().nullable().default(null)
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
	PlanSayMsgSchema,
	QueueWorktreeEnsureMsgSchema,
	QueueWorktreeRemoveMsgSchema,
	ExecStartMsgSchema,
	ExecCancelMsgSchema,
	ExecAnswerMsgSchema,
	QueuePublishMsgSchema,
	QueueSummarizeMsgSchema,
	QueueAskMsgSchema
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;

export type ExecStart = z.infer<typeof ExecStartMsgSchema>;

export type QueueAsk = z.infer<typeof QueueAskMsgSchema>;
