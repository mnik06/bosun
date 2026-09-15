import { z } from 'zod';

// A secret key in this slot would hand the backend blanket authority over the
// auth schema, which `getUser` never needs. The check only catches the current
// key format — legacy anon and service_role keys are both JWTs and are
// indistinguishable from each other by shape.
const PublishableKeySchema = z
	.string()
	.min(1)
	.refine((key) => !key.startsWith('sb_secret_'), 'must be the publishable key, not a secret key');

// The mirror image of the check above. Creating a member's account needs the
// secret key, so the guard cannot be "no secrets here" — it is that the two slots
// must not be filled with each other, which is the mistake that would either
// break sign-in or hand account creation to the browser's key.
const SecretKeySchema = z
	.string()
	.min(1)
	.refine((key) => !key.startsWith('sb_publishable_'), 'must be the secret key, not the publishable key');

export const EnvSchema = z.object({
	TZ: z.string().optional(),
	NODE_ENV: z.enum(['local', 'staging', 'production']),
	HOST: z.string().optional(),
	PORT: z.string().optional(),
	DATABASE_URL: z.string(),
	PUBLIC_SERVER_URL: z.url(),
	// Where the browser reaches the web app. A pull request bosun opens links back
	// to the plan it came from, and the backend cannot derive that origin from its
	// own — the app is served from somewhere else entirely.
	PUBLIC_APP_URL: z.url(),
	AGENT_DOWNLOAD_BASE_URL: z.url(),
	// Followed to find the newest published agent build, so releasing an agent is
	// the only step: machines pick it up on the next Refresh with no redeploy here.
	AGENT_LATEST_RELEASE_URL: z.url().optional(),
	// Pins machines to one build, overriding the lookup above. This is the rollback
	// lever: set it to the last good version and redeploy to pull a fleet back off
	// a bad release. Left unset in normal operation.
	AGENT_EXPECTED_VERSION: z.string().min(1).optional(),
	SUPABASE_URL: z.url(),
	SUPABASE_PUBLISHABLE_KEY: PublishableKeySchema,
	SUPABASE_SECRET_KEY: SecretKeySchema,
	// The GitHub App. The private key can mint `contents: write` for every
	// repository of every installation bosun holds, so it is read in exactly one
	// place — `github-app.service.ts` — and, like the Supabase secret, is a Fly
	// secret and never a fly.toml entry.
	GITHUB_APP_ID: z.string().regex(/^\d+$/, 'must be the numeric App ID'),
	GITHUB_APP_SLUG: z.string().min(1),
	GITHUB_APP_CLIENT_ID: z.string().min(1),
	GITHUB_APP_CLIENT_SECRET: z.string().min(1),
	GITHUB_APP_PRIVATE_KEY: z
		.string()
		.refine((key) => key.includes('PRIVATE KEY'), 'must be the PEM private key the App generated'),
	// Signs the App's `push` and `pull_request` deliveries. A delivery that does not
	// verify is refused: an unsigned merge event would mark a plan merged and start
	// every plan stacked on it.
	GITHUB_WEBHOOK_SECRET: z.string().min(16, 'must be the webhook secret set on the GitHub App'),
	// The Web Push protocol requires every send to be signed as this application.
	// The public half is also shipped to the browser (VITE_VAPID_PUBLIC_KEY) so a
	// subscription can be created against the same key pair the backend signs with.
	VAPID_PUBLIC_KEY: z.string().min(1),
	VAPID_PRIVATE_KEY: z.string().min(1),
	VAPID_SUBJECT: z.string().min(1)
});

export type Env = z.infer<typeof EnvSchema>;
