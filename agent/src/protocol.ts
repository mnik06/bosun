import { z } from 'zod';
import {
	OnboardingCancelMsgSchema,
	OnboardingDoneMsgSchema,
	OnboardingErrorMsgSchema,
	OnboardingStartMsgSchema,
	RepoAttachedMsgSchema,
	RepoAttachMsgSchema,
	RepoErrorMsgSchema
} from './onboarding-frames';
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
} from './build-frames';
import {
	BugfixActivityMsgSchema,
	BugfixBugsMsgSchema,
	BugfixCancelMsgSchema,
	BugfixDoneMsgSchema,
	BugfixErrorMsgSchema,
	BugfixSayMsgSchema,
	BugfixStartMsgSchema,
	BugfixTextMsgSchema
} from './bugfix-frames';
import { CommitOutcomeSchema } from './commit-outcome';
import {
	EnvDeleteMsgSchema,
	EnvErrorMsgSchema,
	EnvSavedMsgSchema,
	EnvSetMsgSchema,
	EnvSetSummarySchema,
	SecretsSetMsgSchema
} from './env-frames';
import {
	PlanAnswerMsgSchema,
	PlanAnswerSchema,
	PlanCancelMsgSchema,
	PlanModesMsgSchema,
	PlanQuestionSchema,
	PlanSayMsgSchema,
	PlanStartMsgSchema
} from './plan-frames';
import {
	ExecAnswerMsgSchema,
	ExecCancelMsgSchema,
	ExecStartMsgSchema
} from './exec-frames';
import { QuickFixDoneMsgSchema, QuickFixErrorMsgSchema, QuickFixStartMsgSchema } from './quick-fix-frames';

export {
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
	// The integrations still held, on the same terms.
	integrationIds: z.array(z.string()).optional(),
	// The bug-fixing sessions still held, on the same terms.
	bugfixSessionIds: z.array(z.string()).optional(),
	// The quick fixes still held, on the same terms.
	quickFixIds: z.array(z.string()).optional(),
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
	repositoryId: z.string().nullable().optional()
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
	// Present only on an auto plan, where the session answered itself. Carried on the
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

export const ExecDoneMsgSchema = CommitOutcomeSchema.extend({
	type: z.literal('exec.done'),
	runId: z.string()
});

// `conflictWith` names the provider branch a bullet could not merge before it
// started. Optional so a backend that predates it still fails the run as before.
export const ExecErrorMsgSchema = z.object({
	type: z.literal('exec.error'),
	runId: z.string(),
	message: z.string(),
	conflictWith: z.string().optional()
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
	OnboardingErrorMsgSchema,
	BugfixTextMsgSchema,
	BugfixActivityMsgSchema,
	BugfixBugsMsgSchema,
	BugfixDoneMsgSchema,
	BugfixErrorMsgSchema,
	QuickFixDoneMsgSchema,
	QuickFixErrorMsgSchema
]);

export type AgentMsg = z.infer<typeof AgentMsgSchema>;

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

export const ServerMsgSchema = z.discriminatedUnion('type', [
	RefreshMsgSchema,
	UpgradeMsgSchema,
	PauseMsgSchema,
	ResumeMsgSchema,
	ShutdownMsgSchema,
	PlanStartMsgSchema,
	PlanAnswerMsgSchema,
	PlanCancelMsgSchema,
	PlanSayMsgSchema,
	PlanModesMsgSchema,
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
	OnboardingCancelMsgSchema,
	BugfixStartMsgSchema,
	BugfixSayMsgSchema,
	BugfixCancelMsgSchema,
	QuickFixStartMsgSchema
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;

export {
	type BuildSummarize,
	type BuildWorktreeEnsure,
	type IntegrateStart,
	type LineAsk,
	type PlanCriteria,
	type Regenerated,
	type ResolvedConflict
} from './build-frames';

export { type BugfixStart, type BugfixSay } from './bugfix-frames';
export { type QuickFixStart } from './quick-fix-frames';

export {
	EnvSetSummarySchema,
	type EnvSetSummary,
	type EnvVarInput,
	SealedEnvVarInputSchema,
	type SealedEnvVarInput,
	EnvSavedMsgSchema,
	EnvErrorMsgSchema,
	EnvSetMsgSchema,
	SecretsSetMsgSchema,
	EnvDeleteMsgSchema
} from './env-frames';

export {
	PlanQuestionSchema,
	type PlanQuestion,
	PlanAnswerSchema,
	type PlanAnswer,
	PlanStartMsgSchema,
	PlanSnapshotSchema,
	type PlanSnapshot,
	PlanSayMsgSchema,
	PlanModesMsgSchema,
	PlanAnswerMsgSchema,
	PlanCancelMsgSchema
} from './plan-frames';

export {
	ExecSliceSchema,
	ExecFindingSchema,
	type ExecFinding,
	ExecPriorProposalSchema,
	type ExecPriorProposal,
	RunPhaseSchema,
	ExecStartMsgSchema,
	ExecCancelMsgSchema,
	ExecAnswerMsgSchema,
	type ExecStart
} from './exec-frames';
