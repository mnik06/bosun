import { z } from 'zod'

import { MachineSchema } from '~/entities/machine/model/machine'
import { RepositorySchema } from '~/entities/repository'

export const MachineUpdatedMsgSchema = z.object({
	type: z.literal('machine.updated'),
	machine: MachineSchema
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

export const MachineRepositoryErrorMsgSchema = z.object({
	type: z.literal('machine.repository.error'),
	machineId: z.string(),
	repositoryId: z.string(),
	message: z.string()
})

export const RepositoryUpdatedMsgSchema = z.object({
	type: z.literal('repository.updated'),
	repository: RepositorySchema
})

export const OnboardingUpdatedMsgSchema = z.object({
	type: z.literal('onboarding.updated'),
	machineId: z.string(),
	repositoryId: z.string(),
	runId: z.string()
})

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachineDeletedMsgSchema,
	MachineUpgradingMsgSchema,
	MachineUpgradeDeclinedMsgSchema,
	MachineRepositoryErrorMsgSchema,
	RepositoryUpdatedMsgSchema,
	OnboardingUpdatedMsgSchema
])

export type UiMsg = z.infer<typeof UiMsgSchema>
