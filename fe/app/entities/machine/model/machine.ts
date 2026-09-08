import { z } from 'zod'

export const ProjectProfileSchema = z.object({
	applyMigrations: z.boolean(),
	setupCommand: z.string().nullable(),
	migrationCommand: z.string().nullable(),
	startCommand: z.string().nullable(),
	testCredentialsPath: z.string().nullable(),
	notes: z.string().nullable()
})

export type ProjectProfile = z.infer<typeof ProjectProfileSchema>

export const DEFAULT_PROJECT_PROFILE: ProjectProfile = {
	applyMigrations: true,
	setupCommand: null,
	migrationCommand: null,
	startCommand: null,
	testCredentialsPath: null,
	notes: null
}

export const MachineStatusSchema = z.enum(['pending', 'online', 'offline', 'paused'])

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
	projectProfile: ProjectProfileSchema.nullable(),
	capabilities: z.array(PreflightCheckSchema).nullable(),
	createdAt: z.iso.datetime()
})

export type Machine = z.infer<typeof MachineSchema>

export const MachineListSchema = z.array(MachineSchema)
