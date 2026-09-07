import { z } from 'zod';
import { MachineSchema, PreflightCheckSchema } from 'src/types/MachineSchema';
import {
	AcSchema,
	PlanAnswerSchema,
	PlanMessageSchema,
	PlanQuestionSchema,
	PlanSchema,
	SliceSchema
} from 'src/types/PlanSchema';

export const HelloMsgSchema = z.object({
	type: z.literal('hello'),
	agentVersion: z.string(),
	hostname: z.string(),
	repoPath: z.string()
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

export const AgentMsgSchema = z.discriminatedUnion('type', [
	HelloMsgSchema,
	PreflightMsgSchema,
	PongMsgSchema,
	PlanTextMsgSchema,
	PlanActivityMsgSchema,
	PlanQuestionMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema
]);

export type AgentMsg = z.infer<typeof AgentMsgSchema>;

export const PingMsgSchema = z.object({
	type: z.literal('ping'),
	id: z.string()
});

export const RefreshMsgSchema = z.object({ type: z.literal('refresh') });

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

export const ServerMsgSchema = z.discriminatedUnion('type', [
	PingMsgSchema,
	RefreshMsgSchema,
	PauseMsgSchema,
	ResumeMsgSchema,
	ShutdownMsgSchema,
	PlanStartMsgSchema,
	PlanAnswerMsgSchema,
	PlanCancelMsgSchema
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;

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

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachinePongMsgSchema,
	MachineDeletedMsgSchema,
	PlanTextMsgSchema,
	PlanActivityMsgSchema,
	PlanQuestionMsgSchema,
	PlanDoneMsgSchema,
	PlanErrorMsgSchema,
	PlanUpdatedMsgSchema,
	PlanDeletedMsgSchema,
	PlanMessageMsgSchema,
	PlanArtifactMsgSchema
]);

export type UiMsg = z.infer<typeof UiMsgSchema>;

export const UiCommandSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('plan.subscribe'), planId: z.string() }),
	z.object({ type: z.literal('plan.unsubscribe'), planId: z.string() })
]);

export type UiCommand = z.infer<typeof UiCommandSchema>;
