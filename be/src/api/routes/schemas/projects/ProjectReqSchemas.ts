import { z } from 'zod';
import { ProjectRoleSchema } from 'src/types/ProjectSchema';

export const ProjectIdParamsSchema = z.object({ projectId: z.string() });

export const MemberParamsSchema = z.object({ projectId: z.string(), userId: z.string() });

export const ProjectNameReqSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const CreateMemberReqSchema = z.object({
	email: z.email(),
	role: ProjectRoleSchema
});

export const SetMemberRoleReqSchema = z.object({ role: ProjectRoleSchema });
