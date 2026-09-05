import { isAxiosError } from 'axios'
import { z } from 'zod'

const ErrorRespSchema = z.object({ message: z.string() })

export function toErrorMessage (error: unknown, fallback: string): string {
	if (isAxiosError(error)) {
		const parsed = ErrorRespSchema.safeParse(error.response?.data)

		return parsed.success ? parsed.data.message : error.message
	}

	return error instanceof Error ? error.message : fallback
}
