import { z } from 'zod'

export const SignInSchema = z.object({
	email: z.email('Enter a valid email address'),
	password: z.string().min(1, 'Password is required')
})

export type Credentials = z.infer<typeof SignInSchema>
