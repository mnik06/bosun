import { z } from 'zod'

export const CreatePlanFormSchema = z.object({
	machineId: z.string().min(1, 'Pick a machine'),
	input: z.string().trim().min(1, 'Paste the ticket'),
	verifyInUi: z.boolean()
})

export type CreatePlanForm = z.infer<typeof CreatePlanFormSchema>
