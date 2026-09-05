import { z } from 'zod'

import { MachineSchema } from '~/entities/machine/model/machine'

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

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachinePongMsgSchema
])

export type UiMsg = z.infer<typeof UiMsgSchema>
