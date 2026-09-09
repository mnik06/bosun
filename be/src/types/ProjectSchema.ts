import { z } from 'zod';

export const ProjectRoleSchema = z.enum(['leader', 'developer']);

export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const ProjectSchema = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.date()
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectMembershipSchema = z.object({
	projectId: z.string(),
	userId: z.string(),
	role: ProjectRoleSchema,
	createdAt: z.date()
});

export type ProjectMembership = z.infer<typeof ProjectMembershipSchema>;

// What a project looks like to the person asking: the project plus the role they
// hold in it, which is the only pair the browser ever needs.
export const ProjectWithRoleSchema = ProjectSchema.extend({
	role: ProjectRoleSchema
});

export type ProjectWithRole = z.infer<typeof ProjectWithRoleSchema>;

export const ProjectMemberSchema = z.object({
	userId: z.string(),
	email: z.email(),
	role: ProjectRoleSchema,
	createdAt: z.date()
});

export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

// Resolved once at the edge and carried on the request. `role` is what an app
// owner short-circuits to, so no caller downstream has to know the flag exists.
export interface Membership {
	projectId: string;
	role: ProjectRole;
}
