import { z } from 'zod';

export const PreflightCheckSchema = z.object({
	name: z.string(),
	ok: z.boolean(),
	detail: z.string().optional()
});

export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

export const HelloMsgSchema = z.object({
	type: z.literal('hello'),
	agentVersion: z.string(),
	hostname: z.string(),
	repoPath: z.string()
});

export const PreflightMsgSchema = z.object({
	type: z.literal('preflight'),
	checks: z.array(PreflightCheckSchema)
});

export const PongMsgSchema = z.object({
	type: z.literal('pong'),
	id: z.string(),
	at: z.number()
});

export const PingMsgSchema = z.object({
	type: z.literal('ping'),
	id: z.string()
});

export const ServerMsgSchema = z.discriminatedUnion('type', [PingMsgSchema]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;
