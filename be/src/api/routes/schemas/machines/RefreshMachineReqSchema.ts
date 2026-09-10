import { z } from 'zod';

// Optional so a plain refresh stays a bodyless POST. `force` is the operator
// overruling this machine's own record of a version that failed to start here —
// it is never set by anything automatic.
export const RefreshMachineReqSchema = z
	.object({ force: z.boolean() })
	.partial()
	.optional();
