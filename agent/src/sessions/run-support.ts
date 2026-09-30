// One small piece every writing session — a plan bullet and a quick fix alike —
// does the same way around its worktree, before the session itself runs.

import { describeApplied, envFileFor, type ProjectEnvService } from '../services/project-env.service';

// After the branch step, whose `git clean -fd` takes an untracked `.env` with it,
// and before anything reads the worktree. A session that starts without its
// connection is a session that builds a database of its own in /tmp.
export function writeEnvFiles(opts: {
	projectEnv: ProjectEnvService;
	worktreePath: string;
	// Logged alongside what was written, so the line can be traced back to its run.
	id: string;
}): { written: string[]; providedEnv: { path: string; keys: string[] }[] } {
	let applied: { written: string[]; skipped: string[] };

	try {
		applied = opts.projectEnv.applyTo(opts.worktreePath);
	} catch (error) {
		throw new Error(
			`could not write the provided env files: ${error instanceof Error ? error.message : 'unknown error'}`,
			{ cause: error }
		);
	}

	const line = describeApplied(applied);

	if (line !== null) {
		console.log(`[${opts.id}] ${line}`);
	}

	// Only what was written. A set skipped for a directory this branch lacks, named
	// in the prompt, sends the session after a connection that is not there.
	const providedEnv = opts.projectEnv
		.summary()
		.filter((set) => applied.written.includes(envFileFor(set.path)))
		.map((set) => ({ path: set.path, keys: set.keys }));

	return { written: applied.written, providedEnv };
}
