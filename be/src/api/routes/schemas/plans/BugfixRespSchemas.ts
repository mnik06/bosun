import { z } from 'zod';
import { BugfixMessageSchema, PlanBugSchema } from 'src/types/BugfixSchema';

export const BugfixMessageListRespSchema = z.array(BugfixMessageSchema);

export const PlanBugListRespSchema = z.array(PlanBugSchema);
