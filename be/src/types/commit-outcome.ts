import { z } from 'zod';

// Shared by `exec.done` and `quickfix.done`: what a commit-producing bullet reports after
// it runs. `changedFiles` is what the landed commit touched; `pushed` is whether the branch
// reached the remote after it, which is what lets a dependent start elsewhere.
export const CommitOutcomeSchema = z.object({
	commitSha: z.string().nullable(),
	report: z.string(),
	changedFiles: z.array(z.string()).default([]),
	pushed: z.boolean().default(false),
	pushError: z.string().nullable().default(null)
});
