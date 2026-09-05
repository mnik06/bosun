import { z } from 'zod';

export const EnvSchema = z.object({
	TZ: z.string().optional(),
	NODE_ENV: z.enum(['local', 'staging', 'production']),
	HOST: z.string().optional(),
	PORT: z.string().optional(),
	DATABASE_URL: z.string(),
	PUBLIC_SERVER_URL: z.url(),
	AGENT_DOWNLOAD_BASE_URL: z.url()
});

export type Env = z.infer<typeof EnvSchema>;
