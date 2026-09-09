import { z } from 'zod'

import { ProjectRoleSchema } from '~/entities/project'

export const CreateMemberFormSchema = z.object({
	email: z.email('Enter a valid email address'),
	role: ProjectRoleSchema
})

export type CreateMemberForm = z.infer<typeof CreateMemberFormSchema>
