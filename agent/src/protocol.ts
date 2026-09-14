import { z } from 'zod';
import {
	OnboardingCancelMsgSchema,
	OnboardingDoneMsgSchema,
	OnboardingErrorMsgSchema,
	OnboardingStartMsgSchema,
	QueuePushedMsgSchema,
	RepoAttachedMsgSchema,
	RepoAttachMsgSchema,
	RepoErrorMsgSchema,
	RunPolicySchema,
	SealedValueSchema
} from './onboarding-frames';
import { ProjectProfileSchema } from './project-profile';

export {
	SealedValueSchema,
	type OnboardingStart,
	type RepoAttach,
	type SealedValue
} from './onboarding-frames';

export const PreflightCheckSchema = z.object({
	name: z.string(),
	ok: z.boolean(),
	detail: z.string().optional()
});

export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

// What the scheduler budgets this machine's bullets against. Read fresh on every
// announce: `totalBytes` and swap are what the budget is made of, and
// `availableBytes` is only worth sending as what the machine has right now.
export const MachineMemorySchema = z.object({
	totalBytes: z.number(),
	availableBytes: z.number(),
	swapTotalBytes: z.number(),
	// Whether each bullet runs in a systemd scope under its own limit. Without one,
	// a bullet that runs out of memory can take the agent down with it.
	sessionLimits: z.boolean()
});

export type MachineMemory = z.infer<typeof MachineMemorySchema>;

// Everything about an env set except its values, which never leave the machine.
export const EnvSetSummarySchema = z.object({
	path: z.string(),
	keys: z.array(z.string()),
	updatedAt: z.string()
});

export type EnvSetSummary = z.infer<typeof EnvSetSummarySchema>;

// What the store takes, after the agent has opened what the browser sealed.
export interface EnvVarInput {
	key: string;
	// Null keeps the stored value: the browser never holds one to send back.
	value: string | null;
}

// What arrives on the frame: each value sealed in the browser to this machine's
// key, so the backend relays ciphertext and nothing it could read.
export const SealedEnvVarInputSchema = z.object({
	key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
	value: SealedValueSchema.nullable()
});

export type SealedEnvVarInput = z.infer<typeof SealedEnvVarInputSchema>;

export const HelloMsgSchema = z.object({
	type: z.literal('hello'),
	agentVersion: z.string(),
	hostname: z.string(),
	// Absent until a machine enrolled under plan 008 has a repository attached.
	repoPath: z.string().optional(),
	// Absent from agents older than self-update, which is why it is optional and
	// why anything but an explicit refresh is never offered an upgrade. `change` is
	// a file under ~/.bosun changing, which offers nothing either.
	reason: z.enum(['connect', 'refresh', 'change']).optional(),
	// The bullets still running on this machine. Optional for the same reason:
	// an agent that predates surviving reconnects holds nothing across one, and
	// absent has to keep meaning exactly that.
	runIds: z.array(z.string()).optional(),
	// The planning sessions still held, on the same terms.
	planIds: z.array(z.string()).optional(),
	// The onboarding runs still held, on the same terms.
	onboardingRunIds: z.array(z.string()).optional(),
	// How long this agent process has been alive. It is what separates a socket
	// that dropped from an agent that restarted — the two look identical from the
	// backend, and only one of them means the sessions on that machine are gone.
	uptimeMs: z.number().optional(),
	// Absent off Linux and from agents older than memory budgets; the backend then
	// schedules with its fixed cap alone.
	memory: MachineMemorySchema.optional(),
	// How the previous agent process ended, as systemd recorded it — `oom-kill`
	// when the kernel killed it for memory. Only meaningful beside an uptime that
	// says this process is newer than the bullet it failed to hold.
	previousExit: z.string().optional(),
	// The project env this machine holds, by path and key name. Optional for agents
	// older than env sets; the values are never on any frame.
	envSets: z.array(EnvSetSummarySchema).optional(),
	sessionSecrets: z.array(z.string()).optional(),
	// Base64 SPKI of the key browser input is sealed to.
	publicKey: z.string().optional(),
	repositoryId: z.string().nullable().optional(),
	// Whether the default branch carries `.bosun/project.yaml` as of the last fetch.
	configOnDefault: z.boolean().optional()
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

// The agent's answer to an upgrade it was offered and did not take. Without it
// the browser is told an upgrade started and then watches a banner expire, which
// reads as a broken upgrade rather than a refused one — and the reason only ever
// reached the machine's own log.
export const UpgradeDeclinedMsgSchema = z.object({
	type: z.literal('upgrade.declined'),
	version: z.string(),
	reason: z.string(),
	// Whether an operator asking again with `force` could get anywhere.
	retryable: z.boolean(),
	// Held, not dropped: the machine was busy and will install this the moment its
	// work ends, so nobody has to watch for the gap and press again.
	queued: z.boolean().default(false)
});

// The whole summary after the change, so the browser never has to merge one.
export const EnvSavedMsgSchema = z.object({
	type: z.literal('env.saved'),
	requestId: z.string(),
	envSets: z.array(EnvSetSummarySchema),
	sessionSecrets: z.array(z.string()).optional()
});

export const EnvErrorMsgSchema = z.object({
	type: z.literal('env.error'),
	requestId: z.string(),
	// Paths and key names only — never a value.
	message: z.string()
});

export const AgentMsgSchema = z.discriminatedUnion('type', [
	HelloMsgSchema,
	PreflightMsgSchema,
	PongMsgSchema,
	UpgradeDeclinedMsgSchema,
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
	QueuePushedMsgSchema,
	QueueAnswerTextMsgSchema,
	QueueAnswerDoneMsgSchema,
	QueueAnswerErrorMsgSchema,
	EnvSavedMsgSchema,
	EnvErrorMsgSchema,
	RepoAttachedMsgSchema,
	RepoErrorMsgSchema,
	OnboardingDoneMsgSchema,
	OnboardingErrorMsgSchema
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
	downloadBaseUrl: z.string(),
	// Set only when an operator asked for this version again after it was rolled
	// back here. It overrules the block list and nothing else.
	force: z.boolean().default(false)
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
	notes: z.string().nullable().default(null),
	// The repository's draft, used only when the read tree has no config file.
	configDraft: z.string().nullable().default(null)
});

// One selected plan, whole. The preparation session is the only reader that ever
// has all of them at once, and a summary is not enough to tell what two of them
// genuinely share from what merely sounds alike.
export const PreparePlanSchema = z.object({
	id: z.string(),
	number: z.number().int(),
	title: z.string().nullable(),
	bodyMd: z.string().nullable(),
	// Every plan this one already waits on, and whether that plan is in this
	// selection. The two are not the same job: a blocker outside the selection is
	// carried forward untouched, while an edge between two selected plans is the
	// thing the session was called to remove.
	blockedBy: z.array(z.object({ number: z.number().int(), selected: z.boolean() })),
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	slices: z.array(
		z.object({
			ordinal: z.number().int(),
			kind: z.enum(['build', 'verify']),
			title: z.string(),
			bodyMd: z.string().nullable()
		})
	)
});

export type PreparePlan = z.infer<typeof PreparePlanSchema>;

export const PlanPrepareMsgSchema = z.object({
	type: z.literal('plan.prepare'),
	planId: z.string(),
	planNumber: z.number().int(),
	// Off by default: the person pressed the button and is the only one who can
	// say the dependency map read off their plans is the one they meant.
	auto: z.boolean().default(false),
	plans: z.array(PreparePlanSchema).min(2),
	notes: z.string().nullable().default(null),
	configDraft: z.string().nullable().default(null)
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
	configDraft: z.string().nullable().default(null),
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
	// A machine with no repository runs on the profile edited in the browser. A
	// repository machine reads `.bosun/project.yaml` from the worktree, falls back
	// to `configDraft` only when the file does not exist, and takes `policy` —
	// the one environment fact the file never holds — from here.
	profile: ProjectProfileSchema,
	configDraft: z.string().nullable().default(null),
	policy: RunPolicySchema.nullable().default(null),
	portBase: z.number().int(),
	slice: ExecSliceSchema,
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	// Every criterion in the plan, not only this bullet's — a verify bullet is
	// measured against the whole feature.
	planAcs: z.array(z.object({ code: z.string(), text: z.string() })),
	decisions: z.array(
		z.object({ fork: z.string(), chose: z.string() })
	),
	doneSlices: z.array(z.object({ ordinal: z.number().int(), title: z.string() })),
	// The most memory this bullet's session may use, chosen by the scheduler so the
	// limits of everything running fit the machine. Null from a backend older than
	// memory budgets; the session is then limited to what the machine can spare.
	memoryMaxBytes: z.number().int().positive().nullable().default(null)
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
	setupCommand: z.string().nullable().default(null),
	configDraft: z.string().nullable().default(null)
});

export const QueueWorktreeRemoveMsgSchema = z.object({
	type: z.literal('queue.worktree.remove'),
	queueId: z.string(),
	slug: z.string()
});

// Both are answered on the socket that asked, never through the sink: somebody
// in the browser is waiting on this request, and a reply replayed on another
// connection answers nobody. `vars` replaces the stored set for the path whole.
export const EnvSetMsgSchema = z.object({
	type: z.literal('env.set'),
	requestId: z.string(),
	path: z.string(),
	vars: z.array(SealedEnvVarInputSchema).min(1)
});

// The session secrets, replaced whole. Answered like `env.set`.
export const SecretsSetMsgSchema = z.object({
	type: z.literal('secrets.set'),
	requestId: z.string(),
	vars: z.array(SealedEnvVarInputSchema)
});

// The stored set only. `.env` files already written into worktrees stay.
export const EnvDeleteMsgSchema = z.object({
	type: z.literal('env.delete'),
	requestId: z.string(),
	path: z.string()
});

export const ServerMsgSchema = z.discriminatedUnion('type', [
	PingMsgSchema,
	RefreshMsgSchema,
	UpgradeMsgSchema,
	PauseMsgSchema,
	ResumeMsgSchema,
	ShutdownMsgSchema,
	PlanStartMsgSchema,
	PlanPrepareMsgSchema,
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
	QueueAskMsgSchema,
	EnvSetMsgSchema,
	EnvDeleteMsgSchema,
	SecretsSetMsgSchema,
	RepoAttachMsgSchema,
	OnboardingStartMsgSchema,
	OnboardingCancelMsgSchema
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;

export type ExecStart = z.infer<typeof ExecStartMsgSchema>;

export type QueueAsk = z.infer<typeof QueueAskMsgSchema>;
