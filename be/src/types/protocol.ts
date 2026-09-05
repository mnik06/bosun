import { z } from 'zod';
import { MachineSchema, PreflightCheckSchema } from 'src/types/MachineSchema';

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

export const AgentMsgSchema = z.discriminatedUnion('type', [
	HelloMsgSchema,
	PreflightMsgSchema,
	PongMsgSchema
]);

export type AgentMsg = z.infer<typeof AgentMsgSchema>;

export const PingMsgSchema = z.object({
	type: z.literal('ping'),
	id: z.string()
});

export type PingMsg = z.infer<typeof PingMsgSchema>;

export const MachineUpdatedMsgSchema = z.object({
	type: z.literal('machine.updated'),
	machine: MachineSchema
});

export const MachinePongMsgSchema = z.object({
	type: z.literal('machine.pong'),
	machineId: z.string(),
	id: z.string(),
	rttMs: z.number()
});

export const UiMsgSchema = z.discriminatedUnion('type', [
	MachineUpdatedMsgSchema,
	MachinePongMsgSchema
]);

export type UiMsg = z.infer<typeof UiMsgSchema>;
