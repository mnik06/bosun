import { z } from 'zod';
import { BuildSchema, RepositoryMessageSchema } from 'src/types/BuildSchema';
import { BugfixMessageSchema } from 'src/types/BugfixSchema';
import { MachineSchema } from 'src/types/MachineSchema';
import {
	AcSchema,
	PlanDecisionSchema,
	PlanMessageSchema,
	PlanQuestionSchema,
	PlanSchema,
	SliceSchema
} from 'src/types/PlanSchema';
import { NotificationSchema } from 'src/types/NotificationSchema';
import { RepositorySchema } from 'src/types/RepositorySchema';
import {
	PlanActivityMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanQuestionMsgSchema,
	PlanTextMsgSchema
} from 'src/types/plan-stream';
import {
	BugfixActivityMsgSchema,
	BugfixBugsMsgSchema,
	BugfixDoneMsgSchema,
	BugfixErrorMsgSchema,
	BugfixTextMsgSchema
} from 'src/types/bugfix-stream';

export const MachineUpdatedMsgSchema = z.object({
	type: z.literal('machine.updated'),
	machine: MachineSchema
});

export const MachineDeletedMsgSchema = z.object({
	type: z.literal('machine.deleted'),
	machineId: z.string()
});

// An upgrade takes tens of seconds and spans a restart, so the machine's own row
// says nothing useful for most of it. Without this the browser shows a refresh
// that settled and then a machine that goes quiet, which reads as nothing having
// happened at all.
export const MachineUpgradingMsgSchema = z.object({
	type: z.literal('machine.upgrading'),
	machineId: z.string(),
	from: z.string().nullable(),
	to: z.string()
});

// The other half of `machine.upgrading`. Sent when the agent looked at the offer
// and said no, so the browser can stop claiming an upgrade is under way and show
// what actually happened.
export const MachineUpgradeDeclinedMsgSchema = z.object({
	type: z.literal('machine.upgrade.declined'),
	machineId: z.string(),
	to: z.string(),
	reason: z.string(),
	retryable: z.boolean(),
	// The machine is busy and holding this version, not refusing it.
	queued: z.boolean().default(false)
});

export const RepositoryUpdatedMsgSchema = z.object({
	type: z.literal('repository.updated'),
	repository: RepositorySchema
});

// A nudge rather than the run: the browser refetches, so the missing-inputs list
// it shows is computed by the one place that also decides whether verify starts.
export const OnboardingUpdatedMsgSchema = z.object({
	type: z.literal('onboarding.updated'),
	machineId: z.string(),
	repositoryId: z.string(),
	runId: z.string()
});

export const MachineRepositoryErrorMsgSchema = z.object({
	type: z.literal('machine.repository.error'),
	machineId: z.string(),
	repositoryId: z.string(),
	message: z.string()
});

export const PlanUpdatedMsgSchema = z.object({
	type: z.literal('plan.updated'),
	plan: PlanSchema
});

export const PlanMessageMsgSchema = z.object({
	type: z.literal('plan.message'),
	planId: z.string(),
	message: PlanMessageSchema
});

export const PlanDeletedMsgSchema = z.object({
	type: z.literal('plan.deleted'),
	planId: z.string()
});

// Rides the plan's existing `plan.subscribe` channel, on the same terms as
// `plan.message`: a bug-fixing session's chat has no subscription of its own,
// and every subscriber watching the plan is already watching its build.
export const BugfixMessageMsgSchema = z.object({
	type: z.literal('bugfix.message'),
	buildId: z.string(),
	message: BugfixMessageSchema
});

export const PlanArtifactMsgSchema = z.object({
	type: z.literal('plan.artifact'),
	planId: z.string(),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema)
});

// A nudge: something the plan page reads changed — its dependencies, amendments,
// findings, integrations or runs. The page refetches rather than merging each.
export const PlanChangedMsgSchema = z.object({
	type: z.literal('plan.changed'),
	planId: z.string()
});

export const BuildUpdatedMsgSchema = z.object({
	type: z.literal('build.updated'),
	build: BuildSchema
});

export const BuildDeletedMsgSchema = z.object({
	type: z.literal('build.deleted'),
	buildId: z.string(),
	planId: z.string()
});

// A nudge: a repository's line moved — an order, a capacity, a reason line.
export const LineChangedMsgSchema = z.object({
	type: z.literal('line.changed'),
	repositoryId: z.string()
});

export const NeedsYouChangedMsgSchema = z.object({
	type: z.literal('needs_you.changed')
});

export const RunTextMsgSchema = z.object({
	type: z.literal('run.text'),
	runId: z.string(),
	delta: z.string()
});

export const RunActivityMsgSchema = z.object({
	type: z.literal('run.activity'),
	runId: z.string(),
	label: z.string()
});

export const RunQuestionMsgSchema = z.object({
	type: z.literal('run.question'),
	runId: z.string(),
	planId: z.string(),
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema).min(1)
});

export const IntegrationActivityMsgSchema = z.object({
	type: z.literal('integration.activity'),
	integrationId: z.string(),
	planId: z.string(),
	label: z.string()
});

export const PlanDecisionMsgSchema = z.object({
	type: z.literal('plan.decision'),
	planId: z.string(),
	decision: PlanDecisionSchema
});

export const RepositoryMessageMsgSchema = z.object({
	type: z.literal('repository.message'),
	message: RepositoryMessageSchema
});

export const RepositoryAnswerMsgSchema = z.object({
	type: z.literal('repository.answer'),
	repositoryId: z.string(),
	askId: z.string(),
	delta: z.string()
});

// Sent only to the recipient's own sockets via `sendToUiUser` — never broadcast
// project-wide, which would show one member's notification on another's screen.
export const NotificationCreatedMsgSchema = z.object({
	type: z.literal('notification.created'),
	notification: NotificationSchema
});

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachineDeletedMsgSchema,
	MachineUpgradingMsgSchema,
	MachineUpgradeDeclinedMsgSchema,
	MachineRepositoryErrorMsgSchema,
	RepositoryUpdatedMsgSchema,
	OnboardingUpdatedMsgSchema,
	PlanTextMsgSchema,
	PlanActivityMsgSchema,
	PlanQuestionMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanUpdatedMsgSchema,
	PlanDeletedMsgSchema,
	PlanMessageMsgSchema,
	PlanArtifactMsgSchema,
	PlanChangedMsgSchema,
	BuildUpdatedMsgSchema,
	BuildDeletedMsgSchema,
	LineChangedMsgSchema,
	NeedsYouChangedMsgSchema,
	RunTextMsgSchema,
	RunActivityMsgSchema,
	RunQuestionMsgSchema,
	IntegrationActivityMsgSchema,
	PlanDecisionMsgSchema,
	RepositoryMessageMsgSchema,
	RepositoryAnswerMsgSchema,
	NotificationCreatedMsgSchema,
	BugfixTextMsgSchema,
	BugfixActivityMsgSchema,
	BugfixBugsMsgSchema,
	BugfixDoneMsgSchema,
	BugfixErrorMsgSchema,
	BugfixMessageMsgSchema
]);

export type UiMsg = z.infer<typeof UiMsgSchema>;

export const UiCommandSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('plan.subscribe'), planId: z.string() }),
	z.object({ type: z.literal('plan.unsubscribe'), planId: z.string() })
]);
