import { z } from 'zod';

// What a machine has to give its bullets, as its agent measured it on announce.
export const MachineMemorySchema = z.object({
	totalBytes: z.number(),
	availableBytes: z.number(),
	swapTotalBytes: z.number(),
	// Whether each bullet runs in a systemd scope under its own limit. Without one,
	// a limit sent on `exec.start` is not enforced and a bullet that runs out of
	// memory can take the agent down with it.
	sessionLimits: z.boolean()
});

export type MachineMemory = z.infer<typeof MachineMemorySchema>;
