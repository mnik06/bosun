import { z } from 'zod'

export const CreateProjectFormSchema = z.object({
	name: z.string().trim().min(1, 'Give the project a name').max(80)
})

export type CreateProjectForm = z.infer<typeof CreateProjectFormSchema>
