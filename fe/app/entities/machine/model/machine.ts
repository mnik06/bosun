import { z } from 'zod'

export const MachineStatusSchema = z.enum(['pending', 'online', 'offline'])

export type MachineStatus = z.infer<typeof MachineStatusSchema>

export const PreflightCheckSchema = z.object({
	name: z.string(),
	ok: z.boolean(),
	detail: z.string().optional()
})

export type PreflightCheck = z.infer<typeof PreflightCheckSchema>

export const MachineSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: MachineStatusSchema,
	lastSeenAt: z.iso.datetime().nullable(),
	repoPath: z.string().nullable(),
	agentVersion: z.string().nullable(),
	capabilities: z.array(PreflightCheckSchema).nullable(),
	createdAt: z.iso.datetime()
})

export type Machine = z.infer<typeof MachineSchema>

export const MachineListSchema = z.array(MachineSchema)
