import { isAxiosError } from 'axios'
import { z } from 'zod'

const SsoErrorRespSchema = z.object({ ssoUrl: z.string() })

// The SAML SSO refusal (AC-8) carries GitHub's own authorization link in
// `details.ssoUrl`, spread beside `message` by be/src/api/errors/error.handler.ts
// — every other refusal has no such field, so this returns null for them.
export function errorSsoUrl (error: unknown): string | null {
	if (!isAxiosError(error)) {
		return null
	}

	const parsed = SsoErrorRespSchema.safeParse(error.response?.data)

	return parsed.success ? parsed.data.ssoUrl : null
}
