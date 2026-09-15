import { z } from 'zod';

export const ReadForPlanReqSchema = z.object({ planId: z.string().min(1) });

export type ReadForPlanReq = z.infer<typeof ReadForPlanReqSchema>;

export const ReadForPlanRespSchema = z.object({ updated: z.number().int() });

export type ReadForPlanResp = z.infer<typeof ReadForPlanRespSchema>;
