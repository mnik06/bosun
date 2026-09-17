// Two small pieces every writing session — a plan bullet and a quick fix alike —
// does the same way around its worktree, before and after the session itself runs.

import { PROJECT_CONFIG_PATH } from '../project-config';
import { resolveProjectConfig } from '../services/config-resolution';
import { type ExecService } from '../services/exec.service';
import { describeApplied, envFileFor, type ProjectEnvService } from '../services/project-env.service';

// A bullet or a quick fix that touched `.bosun/project.yaml` is refused rather than
// committed when it left the file invalid: whatever runs next on this branch would
// stop on it anyway, somewhere far from the change that broke it.
export async function configGate(opts: {
	exec: ExecService;
	worktreePath: string;
	// Names who left the file invalid, for the error message the operator reads.
	actor: 'bullet' | 'fix';
}): Promise<string | null> {
	const changed = await opts.exec.run(
		'git',
		['-C', opts.worktreePath, 'status', '--porcelain', '--', PROJECT_CONFIG_PATH],
		{ timeoutMs: 30_000 }
	);

	if (!changed.ok || changed.stdout === '') {
		return null;
	}

	const resolved = resolveProjectConfig({ treePath: opts.worktreePath, draft: null });

	return resolved.source === 'invalid' ? `the ${opts.actor} left ${resolved.detail}` : null;
}

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
			`could not write the provided env files: ${error instanceof Error ? error.message : 'unknown error'}`
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
