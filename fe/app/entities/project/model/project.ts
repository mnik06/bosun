import { z } from 'zod'

export const ProjectRoleSchema = z.enum(['leader', 'developer'])

export type ProjectRole = z.infer<typeof ProjectRoleSchema>

export const ProjectSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: ProjectRoleSchema,
	createdAt: z.iso.datetime()
})

export type Project = z.infer<typeof ProjectSchema>

export const ProjectListSchema = z.array(ProjectSchema)

export const ProjectMemberSchema = z.object({
	userId: z.string(),
	email: z.email(),
	role: ProjectRoleSchema,
	createdAt: z.iso.datetime()
})

export type ProjectMember = z.infer<typeof ProjectMemberSchema>

export const ProjectMemberListSchema = z.array(ProjectMemberSchema)

export const CreatedMemberSchema = z.object({
	member: ProjectMemberSchema,
	// Null when the address already had an account and only gained a membership.
	password: z.string().nullable()
})

export type CreatedMember = z.infer<typeof CreatedMemberSchema>
