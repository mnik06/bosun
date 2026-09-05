import { z } from 'zod'

export const AddMachineFormSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(80)
})

export type AddMachineForm = z.infer<typeof AddMachineFormSchema>

export const CreatedMachineSchema = z.object({
	id: z.string(),
	name: z.string(),
	token: z.string(),
	expiresAt: z.iso.datetime(),
	enrollCommand: z.string(),
	installCommand: z.string()
})

export type CreatedMachine = z.infer<typeof CreatedMachineSchema>
