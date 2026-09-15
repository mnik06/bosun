import { z } from 'zod'

import { ProjectNameSchema } from '~/entities/project'

export const CreateProjectFormSchema = z.object({
	name: ProjectNameSchema
})

export type CreateProjectForm = z.infer<typeof CreateProjectFormSchema>
