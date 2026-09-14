import { isAxiosError } from 'axios'
import { z } from 'zod'

const IssuesRespSchema = z.object({
	issues: z.array(z.object({ path: z.string(), message: z.string() }))
})

export type ConfigIssue = z.infer<typeof IssuesRespSchema>['issues'][number]

// Null for any failure that is not a config the backend read and refused, which
// the editor reports as an ordinary error rather than as a list of fields.
export function configIssues (error: unknown): ConfigIssue[] | null {
	if (!isAxiosError(error) || error.response?.status !== 400) {
		return null
	}

	const parsed = IssuesRespSchema.safeParse(error.response.data)

	return parsed.success ? parsed.data.issues : null
}
