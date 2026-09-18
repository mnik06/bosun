import { z } from 'zod'

export const ConnectAzureFormSchema = z.object({
	organization: z.string().min(1, 'Enter an organization'),
	pat: z.string().min(1, 'Enter a personal access token')
})

export type ConnectAzureForm = z.infer<typeof ConnectAzureFormSchema>

export const RotateAzureFormSchema = z.object({
	pat: z.string().min(1, 'Enter a personal access token')
})

export type RotateAzureForm = z.infer<typeof RotateAzureFormSchema>
