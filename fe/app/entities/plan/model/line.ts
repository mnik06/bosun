import { z } from 'zod'

import { BuildSchema, BuildStatusSchema, NeedsYouReasonSchema } from '~/entities/plan/model/build'

export const LineBuildSchema = BuildSchema.extend({
	planNumber: z.number().int(),
	planTitle: z.string().nullable(),
	reason: z.string().nullable()
})

export const MachineCapacitySchema = z.object({
	machineId: z.string(),
	machineName: z.string(),
	repositoryId: z.string().nullable(),
	online: z.boolean(),
	buildBytes: z.number().nullable(),
	buildBytesInUse: z.number(),
	buildsRunning: z.number().int(),
	buildCap: z.number().int().nullable(),
	verifyLanes: z.number().int(),
	// Optional so a board served before the backend that sends it still parses.
	ignoreMemoryBudget: z.boolean().optional(),
	lane: z.array(
		z.object({ planId: z.string(), planNumber: z.number().int(), status: BuildStatusSchema })
	),
	verifyWaiting: z.number().int()
})

export type MachineCapacity = z.infer<typeof MachineCapacitySchema>

export const LineSchema = z.object({
	builds: z.array(LineBuildSchema),
	capacity: z.array(MachineCapacitySchema)
})

export type Line = z.infer<typeof LineSchema>

export const NeedsYouItemSchema = z.object({
	kind: z.union([z.literal('question'), NeedsYouReasonSchema]),
	planId: z.string(),
	planNumber: z.number().int(),
	planTitle: z.string().nullable(),
	detail: z.string()
})

export type NeedsYouItem = z.infer<typeof NeedsYouItemSchema>

export const NeedsYouListSchema = z.array(NeedsYouItemSchema)
