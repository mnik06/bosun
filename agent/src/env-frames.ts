import { z } from 'zod';
import { SealedValueSchema } from './onboarding-frames';

// Everything about an env set except its values, which never leave the machine.
export const EnvSetSummarySchema = z.object({
	path: z.string(),
	keys: z.array(z.string()),
	updatedAt: z.string()
});

export type EnvSetSummary = z.infer<typeof EnvSetSummarySchema>;

// What the store takes, after the agent has opened what the browser sealed.
export interface EnvVarInput {
	key: string;
	// Null keeps the stored value: the browser never holds one to send back.
	value: string | null;
}

// What arrives on the frame: each value sealed in the browser to this machine's
// key, so the backend relays ciphertext and nothing it could read.
export const SealedEnvVarInputSchema = z.object({
	key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
	value: SealedValueSchema.nullable()
});

export type SealedEnvVarInput = z.infer<typeof SealedEnvVarInputSchema>;

// The whole summary after the change, so the browser never has to merge one.
export const EnvSavedMsgSchema = z.object({
	type: z.literal('env.saved'),
	requestId: z.string(),
	envSets: z.array(EnvSetSummarySchema),
	sessionSecrets: z.array(z.string()).optional()
});

export const EnvErrorMsgSchema = z.object({
	type: z.literal('env.error'),
	requestId: z.string(),
	// Paths and key names only — never a value.
	message: z.string()
});

// Both are answered on the socket that asked, never through the sink: somebody
// in the browser is waiting on this request, and a reply replayed on another
// connection answers nobody. `vars` replaces the stored set for the path whole.
export const EnvSetMsgSchema = z.object({
	type: z.literal('env.set'),
	requestId: z.string(),
	path: z.string(),
	vars: z.array(SealedEnvVarInputSchema).min(1)
});

// The session secrets, replaced whole. Answered like `env.set`.
export const SecretsSetMsgSchema = z.object({
	type: z.literal('secrets.set'),
	requestId: z.string(),
	vars: z.array(SealedEnvVarInputSchema)
});

// The stored set only. `.env` files already written into worktrees stay.
export const EnvDeleteMsgSchema = z.object({
	type: z.literal('env.delete'),
	requestId: z.string(),
	path: z.string()
});
