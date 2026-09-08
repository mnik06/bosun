import { z } from 'zod';

// What a session cannot work out for itself by reading the repository. Everything
// discoverable — the preflight command, the test runner, the linter — is left to
// discovery on purpose: a field here is one more thing that can go stale without
// anybody noticing, and a wrong answer is worse than no answer.
export const ProjectProfileSchema = z.object({
	// Policy rather than fact. A machine pointed at a shared database wants this
	// off; one with its own wants it on, and no amount of reading the repo says
	// which this is.
	applyMigrations: z.boolean().default(true),
	// A repository with no user-facing surface has nothing to drive, and a verify
	// bullet that tries anyway reports the absence of a browser as a defect.
	runUiTest: z.boolean().default(true),
	// Run once when a worktree is created. A fresh worktree has no node_modules.
	setupCommand: z.string().nullable().default(null),
	migrationCommand: z.string().nullable().default(null),
	// Started by the verify bullet when it needs something to drive. `{port}` is
	// substituted with the queue's own port base, so two queues on one machine do
	// not fight over a listener.
	startCommand: z.string().nullable().default(null),
	appUrl: z.string().nullable().default(null),
	// The path to them, never the credentials. They stay in the repository or on
	// the box; bosun holds a pointer and nothing more.
	testCredentialsPath: z.string().nullable().default(null),
	// Files git does not track and a fresh worktree therefore lacks — `.env` and
	// its neighbours. Copied from the machine's own checkout, which is the only
	// place they exist.
	copyFiles: z.array(z.string()).default([]),
	notes: z.string().nullable().default(null)
});

export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

export const DEFAULT_PROJECT_PROFILE: ProjectProfile = ProjectProfileSchema.parse({});
