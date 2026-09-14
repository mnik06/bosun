import { z } from 'zod';

// Key names and nothing else. The values live on the machine alone, so this is
// everything bosun can ever show about a set — and all it is allowed to hold.
export const EnvSetSummarySchema = z.object({
	path: z.string(),
	keys: z.array(z.string()),
	updatedAt: z.string()
});

export type EnvSetSummary = z.infer<typeof EnvSetSummarySchema>;

// A value sealed in the browser to the machine's public key: AES-256-GCM under a
// fresh key, that key wrapped with RSA-OAEP-SHA256. Everything here is base64.
// The size caps are what the backend can still check — a value of the 10 000
// characters the agent accepts, four bytes a character, plus the tag.
export const SealedValueSchema = z.object({
	v: z.literal(1),
	wrappedKey: z.string().min(1).max(1024),
	iv: z.string().min(1).max(64),
	ciphertext: z.string().min(1).max(60_000)
});

export type SealedValue = z.infer<typeof SealedValueSchema>;

// A null value keeps what the machine already stores for that key: the browser
// never reads a value back, so changing one key would otherwise mean retyping
// every other secret in the set.
export const EnvVarInputSchema = z.object({
	key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
	value: SealedValueSchema.nullable()
});

export type EnvVarInput = z.infer<typeof EnvVarInputSchema>;

export const EnvSetMsgSchema = z.object({
	type: z.literal('env.set'),
	requestId: z.string(),
	path: z.string(),
	vars: z.array(EnvVarInputSchema).min(1)
});

export const EnvDeleteMsgSchema = z.object({
	type: z.literal('env.delete'),
	requestId: z.string(),
	path: z.string()
});

// Session secrets replace the machine's whole set, like an env set replaces its
// path's. An empty list removes them all.
export const SecretsSetMsgSchema = z.object({
	type: z.literal('secrets.set'),
	requestId: z.string(),
	vars: z.array(EnvVarInputSchema)
});

export const EnvSavedMsgSchema = z.object({
	type: z.literal('env.saved'),
	requestId: z.string(),
	envSets: z.array(EnvSetSummarySchema),
	// Names only. Optional for agents older than session secrets.
	sessionSecrets: z.array(z.string()).optional()
});

export const EnvErrorMsgSchema = z.object({
	type: z.literal('env.error'),
	requestId: z.string(),
	message: z.string()
});
