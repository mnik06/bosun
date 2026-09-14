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

export const EnvSetSummarySchema = z.object({
	path: z.string(),
	keys: z.array(z.string()),
	updatedAt: z.iso.datetime()
})

export type EnvSetSummary = z.infer<typeof EnvSetSummarySchema>

export const MachinePolicySchema = z.object({
	applyMigrations: z.boolean(),
	confirmed: z.boolean().default(false)
})

export type MachinePolicy = z.infer<typeof MachinePolicySchema>

export const MachineSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: MachineStatusSchema,
	lastSeenAt: z.iso.datetime().nullable(),
	repoPath: z.string().nullable(),
	agentVersion: z.string().nullable(),
	projectProfile: ProjectProfileSchema.nullable(),
	capabilities: z.array(PreflightCheckSchema).nullable(),
	// Nullish, not nullable: a backend that predates env sets omits the field,
	// and failing the whole machine parse over it would blank the page.
	envSets: z.array(EnvSetSummarySchema).nullish(),
	// Nullish for the same reason: a backend older than repositories and sealed
	// inputs omits all four.
	repositoryId: z.string().nullish(),
	publicKey: z.string().nullish(),
	policy: MachinePolicySchema.nullish(),
	sessionSecrets: z.array(z.string()).nullish(),
	createdAt: z.iso.datetime()
})

export type Machine = z.infer<typeof MachineSchema>

export const MachineListSchema = z.array(MachineSchema)
