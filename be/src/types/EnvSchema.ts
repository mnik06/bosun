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
	SUPABASE_URL: z.url(),
	SUPABASE_PUBLISHABLE_KEY: PublishableKeySchema
});

export type Env = z.infer<typeof EnvSchema>;
