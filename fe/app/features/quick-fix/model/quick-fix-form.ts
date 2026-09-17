import { z } from 'zod'

export const QuickFixFormSchema = z.object({
	machineId: z.string().min(1, 'Pick a machine'),
	description: z.string().trim().min(1, 'Describe the bug').max(4000, 'Keep it under 4000 characters')
})

export type QuickFixForm = z.infer<typeof QuickFixFormSchema>
