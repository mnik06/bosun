import { z } from 'zod';

// A secret key in this slot would hand the backend blanket authority over the
// auth schema, which `getUser` never needs. The check only catches the current
// key format — legacy anon and service_role keys are both JWTs and are
// indistinguishable from each other by shape.
const PublishableKeySchema = z
	.string()
	.min(1)
	.refine((key) => !key.startsWith('sb_secret_'), 'must be the publishable key, not a secret key');

export const EnvSchema = z.object({
	TZ: z.string().optional(),
	NODE_ENV: z.enum(['local', 'staging', 'production']),
	HOST: z.string().optional(),
	PORT: z.string().optional(),
	DATABASE_URL: z.string(),
	PUBLIC_SERVER_URL: z.url(),
	AGENT_DOWNLOAD_BASE_URL: z.url(),
	// Followed to find the newest published agent build, so releasing an agent is
	// the only step: machines pick it up on the next Refresh with no redeploy here.
	AGENT_LATEST_RELEASE_URL: z.url().optional(),
	// Pins machines to one build, overriding the lookup above. This is the rollback
	// lever: set it to the last good version and redeploy to pull a fleet back off
	// a bad release. Left unset in normal operation.
	AGENT_EXPECTED_VERSION: z.string().min(1).optional(),
	SUPABASE_URL: z.url(),
	SUPABASE_PUBLISHABLE_KEY: PublishableKeySchema
});

export type Env = z.infer<typeof EnvSchema>;
