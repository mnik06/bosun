import { z } from 'zod'

import { MachineSchema } from '~/entities/machine/model/machine'
import { PlanDecisionSchema } from '~/entities/plan'
import { QueueMessageSchema, QueueSchema } from '~/entities/queue'

export const MachineUpdatedMsgSchema = z.object({
	type: z.literal('machine.updated'),
	machine: MachineSchema
})

export const MachinePongMsgSchema = z.object({
	type: z.literal('machine.pong'),
	machineId: z.string(),
	id: z.string(),
	rttMs: z.number()
})

export const MachineDeletedMsgSchema = z.object({
	type: z.literal('machine.deleted'),
	machineId: z.string()
})

export const MachineUpgradingMsgSchema = z.object({
	type: z.literal('machine.upgrading'),
	machineId: z.string(),
	from: z.string().nullable(),
	to: z.string()
})

export const MachineUpgradeDeclinedMsgSchema = z.object({
	type: z.literal('machine.upgrade.declined'),
	machineId: z.string(),
	to: z.string(),
	reason: z.string(),
	retryable: z.boolean(),
	queued: z.boolean().nullish().default(false)
})

export const QueueUpdatedMsgSchema = z.object({
	type: z.literal('queue.updated'),
	queue: QueueSchema
})

export const QueueDeletedMsgSchema = z.object({
	type: z.literal('queue.deleted'),
	queueId: z.string()
})

const RunQuestionOptionSchema = z.object({
	label: z.string(),
	description: z.string().optional()
})

export const RunQuestionItemSchema = z.object({
	header: z.string(),
	question: z.string(),
	options: z.array(RunQuestionOptionSchema),
	multiSelect: z.boolean().optional()
})

export const RunTextMsgSchema = z.object({
	type: z.literal('run.text'),
	runId: z.string(),
	delta: z.string()
})

export const RunActivityMsgSchema = z.object({
	type: z.literal('run.activity'),
	runId: z.string(),
	label: z.string()
})

export const RunQuestionMsgSchema = z.object({
	type: z.literal('run.question'),
	runId: z.string(),
	questionId: z.string(),
	questions: z.array(RunQuestionItemSchema).min(1)
})

export type RunQuestionMsg = z.infer<typeof RunQuestionMsgSchema>

export const PlanDecisionMsgSchema = z.object({
	type: z.literal('plan.decision'),
	planId: z.string(),
	decision: PlanDecisionSchema
})

export const QueueMessageMsgSchema = z.object({
	type: z.literal('queue.message'),
	message: QueueMessageSchema
})

export const QueueAnswerMsgSchema = z.object({
	type: z.literal('queue.answer'),
	queueId: z.string(),
	askId: z.string(),
	delta: z.string()
})

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachinePongMsgSchema,
	MachineDeletedMsgSchema,
	MachineUpgradingMsgSchema,
	MachineUpgradeDeclinedMsgSchema,
	QueueUpdatedMsgSchema,
	QueueDeletedMsgSchema,
	RunTextMsgSchema,
	RunActivityMsgSchema,
	RunQuestionMsgSchema,
	PlanDecisionMsgSchema,
	QueueMessageMsgSchema,
	QueueAnswerMsgSchema
])

export type UiMsg = z.infer<typeof UiMsgSchema>
