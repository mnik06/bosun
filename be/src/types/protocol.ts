import { z } from 'zod';
import { ProjectProfileSchema } from 'src/types/ProjectProfileSchema';
import { PreflightCheckSchema } from 'src/types/MachineSchema';
import { PlanAnswerSchema, PlanQuestionSchema } from 'src/types/PlanSchema';
import {
	PlanAnswerMsgSchema,
	PlanCancelMsgSchema,
	PlanSayMsgSchema,
	PlanStartMsgSchema
} from 'src/types/plan-frames';
import {
	PlanActivityMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanQuestionMsgSchema,
	PlanTextMsgSchema
} from 'src/types/plan-stream';
import { MachineMemorySchema } from 'src/types/machine-memory';
import {
	EnvDeleteMsgSchema,
	EnvErrorMsgSchema,
	EnvSavedMsgSchema,
	EnvSetMsgSchema,
	EnvSetSummarySchema,
	SecretsSetMsgSchema
} from 'src/types/env-sets';
import {
	OnboardingCancelMsgSchema,
	OnboardingDoneMsgSchema,
	OnboardingErrorMsgSchema,
	OnboardingStartMsgSchema,
	RepoAttachedMsgSchema,
	RepoAttachMsgSchema,
	RepoErrorMsgSchema,
	RunPolicySchema
} from 'src/types/onboarding-frames';
import {
	BuildSummarizeMsgSchema,
	BuildWorktreeEnsureMsgSchema,
	BuildWorktreeErrorMsgSchema,
	BuildWorktreeReadyMsgSchema,
	BuildWorktreeRemoveMsgSchema,
	IntegrateActivityMsgSchema,
	IntegrateCancelMsgSchema,
	IntegrateDoneMsgSchema,
	IntegrateNeedsYouMsgSchema,
	IntegrateStartMsgSchema,
	LineAnswerDoneMsgSchema,
	LineAnswerErrorMsgSchema,
	LineAnswerTextMsgSchema,
	LineAskMsgSchema
} from 'src/types/build-frames';
import { FindingKindSchema, FindingSeveritySchema, RunPhaseSchema } from 'src/types/BuildSchema';

export {
	PlanActivityMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanQuestionMsgSchema,
	PlanTextMsgSchema
};

export const HelloMsgSchema = z.object({
	type: z.literal('hello'),
	agentVersion: z.string(),
	hostname: z.string(),
	// Absent from an agent enrolled under plan 008 that has no repository yet: it
	// has no checkout, and an empty string would read as one.
	repoPath: z.string().optional(),
	// Absent from agents older than self-update, which is why it is optional and
	// why anything but an explicit refresh is never offered an upgrade. `change` is
	// a file under ~/.bosun changing, which is not a request for an upgrade either.
	reason: z.enum(['connect', 'refresh', 'change']).optional(),
	// The bullets still running on that machine. Optional for the same reason: an
	// agent that predates surviving reconnects holds nothing across one, and
	// absent has to keep meaning exactly that rather than "unknown".
	runIds: z.array(z.string()).optional(),
	// The planning sessions still held, on the same terms.
	planIds: z.array(z.string()).optional(),
	// The onboarding runs still held, on the same terms.
	onboardingRunIds: z.array(z.string()).optional(),
	// The integrations still held, on the same terms.
	integrationIds: z.array(z.string()).optional(),
	// How long that agent process has been alive. A dropped socket and a restarted
	// agent are indistinguishable here otherwise, and only one of them means every
	// session on the machine is gone.
	uptimeMs: z.number().optional(),
	// Absent off Linux and from agents older than memory budgets, which are then
	// scheduled without a budget.
	memory: MachineMemorySchema.optional(),
	// How the agent process before this one ended, as systemd recorded it. `oom-kill`
	// beside an uptime newer than a stranded bullet is the kernel having killed the
	// agent for memory, not a restart anybody asked for.
	previousExit: z.string().optional(),
	// Absent from agents older than env sets, and absent must leave the stored
	// summary alone rather than read as a machine holding none.
	envSets: z.array(EnvSetSummarySchema).optional(),
	sessionSecrets: z.array(z.string()).optional(),
	// Base64 SPKI of the key browser input is sealed to. Absent from an agent too
	// old to decrypt, which is what refuses browser input for that machine.
	publicKey: z.string().max(2000).optional(),
	// The repository the agent believes it is attached to, and whether the default
	// branch carries `.bosun/project.yaml` as of its last fetch.
	repositoryId: z.string().nullable().optional(),
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

// `changedFiles` is what the landed commit touched; `pushed` is whether the branch
// reached the remote after it, which is what lets a dependent start elsewhere.
export const ExecDoneMsgSchema = z.object({
	type: z.literal('exec.done'),
	runId: z.string(),
	commitSha: z.string().nullable(),
	report: z.string(),
	changedFiles: z.array(z.string()).default([]),
	pushed: z.boolean().default(false),
	pushError: z.string().nullable().default(null)
});

export const ExecErrorMsgSchema = z.object({
	type: z.literal('exec.error'),
	runId: z.string(),
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
	BuildWorktreeReadyMsgSchema,
	BuildWorktreeErrorMsgSchema,
	ExecTextMsgSchema,
	ExecActivityMsgSchema,
	ExecQuestionMsgSchema,
	ExecDoneMsgSchema,
	ExecErrorMsgSchema,
	IntegrateActivityMsgSchema,
	IntegrateDoneMsgSchema,
	IntegrateNeedsYouMsgSchema,
	LineAnswerTextMsgSchema,
	LineAnswerDoneMsgSchema,
	LineAnswerErrorMsgSchema,
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

export const ExecSliceSchema = z.object({
	ordinal: z.number().int(),
	kind: z.enum(['build', 'verify']),
	title: z.string(),
	bodyMd: z.string().nullable()
});

export const ExecFindingSchema = z.object({
	id: z.string(),
	acCode: z.string().nullable(),
	kind: FindingKindSchema,
	reproduction: z.string(),
	severity: FindingSeveritySchema
});

// Everything the session needs travels in the frame. The agent holds no plan
// state of its own, so a slice dispatched after a reconnect needs no lookup and
// no cache that could disagree with the row the backend scheduled from.
export const ExecStartMsgSchema = z.object({
	type: z.literal('exec.start'),
	runId: z.string(),
	buildId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	// An AFK plan's bullets are given no way to ask.
	afk: z.boolean(),
	planId: z.string(),
	sliceId: z.string(),
	planNumber: z.number().int(),
	planTitle: z.string(),
	planBodyMd: z.string(),
	// A machine with no repository still runs on the profile edited in the
	// browser. A repository machine reads `.bosun/project.yaml` from the worktree
	// and falls back to `configDraft` only when the file does not exist; `policy`
	// is the one environment fact the file never holds, and governs only the lane.
	profile: ProjectProfileSchema,
	configDraft: z.string().nullable(),
	policy: RunPolicySchema.nullable(),
	portBase: z.number().int(),
	slice: ExecSliceSchema,
	// Null on a build bullet.
	phase: RunPhaseSchema.nullable(),
	acs: z.array(z.object({ code: z.string(), text: z.string() })),
	// Every criterion in the plan, not only this bullet's — a verify session is
	// measured against the whole feature.
	planAcs: z.array(z.object({ code: z.string(), text: z.string() })),
	decisions: z.array(z.object({ fork: z.string(), chose: z.string() })),
	doneSlices: z.array(z.object({ ordinal: z.number().int(), title: z.string() })),
	// What bosun changed about this plan to fit the others: rendered as standing
	// instruction, never as a request to reconsider.
	amendments: z.array(z.string()),
	// Provider branches merged in before the bullet, so a stacked plan builds on
	// whatever its provider gained since it started.
	mergeIn: z.array(z.string()),
	// Push the branch after committing. Off for a machine with no repository.
	push: z.boolean(),
	// A bullet restarted after its question was answered.
	answer: z
		.object({ questions: z.array(PlanQuestionSchema), answers: z.array(PlanAnswerSchema) })
		.nullable(),
	// A fix session's findings.
	findings: z.array(ExecFindingSchema),
	// The criteria a re-check drives.
	recheckCodes: z.array(z.string()),
	// The most memory this session may use: the same number it was admitted
	// against, so the limits of everything running fit the machine.
	memoryMaxBytes: z.number().int().positive().nullable()
});

export const ExecCancelMsgSchema = z.object({ type: z.literal('exec.cancel'), runId: z.string() });

export const ExecAnswerMsgSchema = z.object({
	type: z.literal('exec.answer'),
	runId: z.string(),
	questionId: z.string(),
	answers: z.array(PlanAnswerSchema).min(1)
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
	BuildWorktreeEnsureMsgSchema,
	BuildWorktreeRemoveMsgSchema,
	ExecStartMsgSchema,
	ExecCancelMsgSchema,
	ExecAnswerMsgSchema,
	IntegrateStartMsgSchema,
	IntegrateCancelMsgSchema,
	BuildSummarizeMsgSchema,
	LineAskMsgSchema,
	EnvSetMsgSchema,
	EnvDeleteMsgSchema,
	SecretsSetMsgSchema,
	RepoAttachMsgSchema,
	OnboardingStartMsgSchema,
	OnboardingCancelMsgSchema
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;

export type ExecStart = z.infer<typeof ExecStartMsgSchema>;

export { UiMsgSchema, UiCommandSchema, type UiMsg, type UiCommand } from 'src/types/ui-protocol';
