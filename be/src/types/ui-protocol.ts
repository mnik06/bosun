import { z } from 'zod';
import { MachineSchema } from 'src/types/MachineSchema';
import {
	AcSchema,
	PlanMessageSchema,
	PlanQuestionSchema,
	PlanSchema,
	SliceSchema
} from 'src/types/PlanSchema';
import { QueueSchema } from 'src/types/QueueSchema';
import {
	PlanActivityMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanQuestionMsgSchema,
	PlanTextMsgSchema
} from 'src/types/protocol';

export const MachineUpdatedMsgSchema = z.object({
	type: z.literal('machine.updated'),
	machine: MachineSchema
});

export const MachinePongMsgSchema = z.object({
	type: z.literal('machine.pong'),
	machineId: z.string(),
	id: z.string(),
	rttMs: z.number()
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

export const PlanArtifactMsgSchema = z.object({
	type: z.literal('plan.artifact'),
	planId: z.string(),
	acs: z.array(AcSchema),
	slices: z.array(SliceSchema)
});

export const QueueUpdatedMsgSchema = z.object({
	type: z.literal('queue.updated'),
	queue: QueueSchema
});

export const QueueDeletedMsgSchema = z.object({
	type: z.literal('queue.deleted'),
	queueId: z.string()
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
	questionId: z.string(),
	questions: z.array(PlanQuestionSchema).min(1)
});

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachinePongMsgSchema,
	MachineDeletedMsgSchema,
	MachineUpgradingMsgSchema,
	PlanTextMsgSchema,
	PlanActivityMsgSchema,
	PlanQuestionMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanUpdatedMsgSchema,
	PlanDeletedMsgSchema,
	PlanMessageMsgSchema,
	PlanArtifactMsgSchema,
	QueueUpdatedMsgSchema,
	QueueDeletedMsgSchema,
	RunTextMsgSchema,
	RunActivityMsgSchema,
	RunQuestionMsgSchema
]);

export type UiMsg = z.infer<typeof UiMsgSchema>;

export const UiCommandSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('plan.subscribe'), planId: z.string() }),
	z.object({ type: z.literal('plan.unsubscribe'), planId: z.string() })
]);

export type UiCommand = z.infer<typeof UiCommandSchema>;
