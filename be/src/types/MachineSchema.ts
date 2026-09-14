import { z } from 'zod';
import { EnvSetSummarySchema } from 'src/types/env-sets';
import { MachinePolicySchema } from 'src/types/OnboardingSchema';
import { ProjectProfileSchema } from 'src/types/ProjectProfileSchema';

export const MachineStatusSchema = z.enum(['pending', 'online', 'offline', 'paused']);

export type MachineStatus = z.infer<typeof MachineStatusSchema>;

export const PreflightCheckSchema = z.object({
	name: z.string(),
	ok: z.boolean(),
	detail: z.string().optional()
});

export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

export const MachineSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	name: z.string(),
	status: MachineStatusSchema,
	lastSeenAt: z.date().nullable(),
	repoPath: z.string().nullable(),
	agentVersion: z.string().nullable(),
	projectProfile: ProjectProfileSchema.nullable(),
	capabilities: z.array(PreflightCheckSchema).nullable(),
	envSets: z.array(EnvSetSummarySchema).nullable(),
	repositoryId: z.string().nullable(),
	publicKey: z.string().nullable(),
	policy: MachinePolicySchema,
	sessionSecrets: z.array(z.string()).nullable(),
	createdAt: z.date()
});

// Enrolled before plan 008: it names the operator's checkout and has no
// repository row. Everything it does keeps going through today's path.
export function isLegacyMachine(machine: Machine): boolean {
	return machine.repositoryId === null && machine.repoPath !== null;
}

export type Machine = z.infer<typeof MachineSchema>;

export const EnrollmentSchema = z.object({
	id: z.string(),
	tokenExpiresAt: z.date().nullable(),
	tokenUsedAt: z.date().nullable()
});

export type Enrollment = z.infer<typeof EnrollmentSchema>;
