import { z } from 'zod';

// Key names and nothing else. The values live on the machine alone, so this is
// everything bosun can ever show about a set — and all it is allowed to hold.
export const EnvSetSummarySchema = z.object({
	path: z.string(),
	keys: z.array(z.string()),
	updatedAt: z.string()
});

export type EnvSetSummary = z.infer<typeof EnvSetSummarySchema>;

// A null value keeps what the machine already stores for that key: the browser
// never reads a value back, so changing one key would otherwise mean retyping
// every other secret in the set.
export const EnvVarInputSchema = z.object({
	key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
	value: z
		.string()
		.max(10_000)
		.refine((v) => !/[\r\n]/.test(v), 'must be a single line')
		.nullable()
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

export const EnvSavedMsgSchema = z.object({
	type: z.literal('env.saved'),
	requestId: z.string(),
	envSets: z.array(EnvSetSummarySchema)
});

export const EnvErrorMsgSchema = z.object({
	type: z.literal('env.error'),
	requestId: z.string(),
	message: z.string()
});
