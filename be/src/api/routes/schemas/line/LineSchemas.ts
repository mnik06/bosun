import { z } from 'zod';
import {
	BuildSchema,
	BuildStatusSchema,
	NeedsYouReasonSchema,
	OverlapChoiceSchema,
	RepositoryMessageSchema
} from 'src/types/BuildSchema';
import { PlanAnswerSchema } from 'src/types/PlanSchema';

export const BuildIdParamsSchema = z.object({ id: z.string().min(1) });

export const BuildDependencyParamsSchema = z.object({
	id: z.string().min(1),
	dependencyId: z.string().min(1)
});

export const LineQuerySchema = z.object({ repositoryId: z.string().min(1).optional() });

export const LineOrderReqSchema = z.object({
	repositoryId: z.string().min(1),
	buildIds: z.array(z.string().min(1)).min(1)
});

export const OverlapDecisionParamsSchema = z.object({ id: z.string().min(1) });

export const DecideOverlapReqSchema = z.object({ chosen: OverlapChoiceSchema });

export const RunIdParamsSchema = z.object({ id: z.string().min(1) });

export const AnswerRunReqSchema = z.object({
	questionId: z.string().min(1),
	answers: z.array(PlanAnswerSchema).min(1)
});

export const LineBuildSchema = BuildSchema.extend({
	planNumber: z.number().int(),
	planTitle: z.string().nullable(),
	// The one line a board card carries: what it waits for, or where it stands.
	reason: z.string().nullable()
});

export type LineBuild = z.infer<typeof LineBuildSchema>;

export const LaneOccupantSchema = z.object({
	planId: z.string(),
	planNumber: z.number().int(),
	status: BuildStatusSchema
});

export const MachineCapacitySchema = z.object({
	machineId: z.string(),
	machineName: z.string(),
	repositoryId: z.string().nullable(),
	online: z.boolean(),
	// Null when the machine has not reported its memory.
	buildBytes: z.number().nullable(),
	buildBytesInUse: z.number(),
	buildsRunning: z.number().int(),
	buildCap: z.number().int().nullable(),
	verifyLanes: z.number().int(),
	ignoreMemoryBudget: z.boolean(),
	lane: z.array(LaneOccupantSchema),
	verifyWaiting: z.number().int()
});

export type MachineCapacity = z.infer<typeof MachineCapacitySchema>;

export const LineRespSchema = z.object({
	builds: z.array(LineBuildSchema),
	capacity: z.array(MachineCapacitySchema)
});

export const ShipFoundationRespSchema = z.object({ prUrl: z.string() });

export const NeedsYouKindSchema = z.union([z.literal('question'), NeedsYouReasonSchema]);

export const NeedsYouItemSchema = z.object({
	kind: NeedsYouKindSchema,
	planId: z.string(),
	planNumber: z.number().int(),
	planTitle: z.string().nullable(),
	detail: z.string()
});

export type NeedsYouItem = z.infer<typeof NeedsYouItemSchema>;

export const NeedsYouRespSchema = z.array(NeedsYouItemSchema);

export const RepositoryMessagesRespSchema = z.array(RepositoryMessageSchema);

export const AskLineReqSchema = z.object({ question: z.string().min(1).max(4000) });

export const UpdateRepositoryReqSchema = z.object({ autoResolveConflicts: z.boolean() });

export const UpdateMachineCapacityReqSchema = z
	.object({
		verifyLanes: z.number().int().min(0).max(4),
		buildCap: z.number().int().min(1).max(32).nullable(),
		ignoreMemoryBudget: z.boolean()
	})
	.partial();
