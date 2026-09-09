import { z } from 'zod';
import { ProjectMemberSchema, ProjectWithRoleSchema } from 'src/types/ProjectSchema';

export const ProjectListRespSchema = z.array(ProjectWithRoleSchema);

export const MemberListRespSchema = z.array(ProjectMemberSchema);

export const CreatedMemberRespSchema = z.object({
	member: ProjectMemberSchema,
	password: z.string().nullable()
});
