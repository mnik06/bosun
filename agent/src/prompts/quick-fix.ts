import { PROJECT_CONFIG_PATH, type ProjectConfig } from '../project-config';
import {
	agentConfigRule,
	checksSection,
	codegenSection,
	loopRules,
	migrateSection,
	notesSection,
	providedEnv,
	setupSection,
	toolchainSection,
	unattended
} from './shared';

export interface QuickFixContext {
	description: string;
	branch: string;
	baseRef: string;
	// Null on a repository that has never been onboarded — nothing has told bosun
	// how this project proves itself yet, and the session works that out itself,
	// the same way it would on a machine bosun has never configured.
	config: ProjectConfig | null;
	providedEnv: { path: string; keys: string[] }[];
}

// The same facts `configuredProject` gives a plan bullet, minus the ones that
// only mean something with a dev stack behind them: a quick fix never starts one,
// so naming `stack_up` or a sign-in URL would point the session at a tool and a
// server that are not there.
function configuredChecks(config: ProjectConfig | null): string {
	if (config === null) {
		return '_Nothing configured for this repository yet — everything above is yours to discover._';
	}

	const lines = [
		toolchainSection(config),
		setupSection(config, { rerun: false }),
		codegenSection(config),
		migrateSection(config),
		checksSection(config),
		notesSection(config)
	].filter(Boolean);

	return lines.length === 0
		? '_The operator configured nothing beyond a repository — everything above is yours to discover._'
		: `What \`${PROJECT_CONFIG_PATH}\` says about this project:\n\n${lines.join('\n')}`;
}

// A quick fix is deliberately outside the whole plan/board machinery: no ACs, no
// tracer bullets, no verify pass. What is left is the smallest prompt that still
// tells the session how this repository proves itself and how to leave, one way
// or the other, without anybody watching.
export function quickFixPrompt(context: QuickFixContext): string {
	return `You are fixing a single reported bug, alone, in a git worktree of its own. There is no plan, no
board card and no acceptance criteria behind this session — only the bug below and a branch to push
a fix on.

${unattended(false, false)}

# The bug

${context.description}

# Step 1 — find this repository's feedback loops, before you change anything

You do not know this project. Work out how it tells you that you have broken it, and write the
commands down in your report. Look in \`package.json\` scripts, the Makefile, the CI workflow, and any
\`CLAUDE.md\`, \`AGENTS.md\` or \`CONTRIBUTING.md\` — those files are the project's own account of how it
is built, and they outrank your habits.

**This session never starts the project's dev server or its database.** A quick fix is proven with a
typecheck, a lint, and its unit tests — never by running the app.

${configuredChecks(context.config)}${providedEnv(context)}

Migrations: **never apply one, and never run a test that needs a database.** If the fix needs a schema
change, generate the migration with this project's own generator and leave it in the tree — it goes into
the pull request unapplied, for whoever reviews it to run.

${agentConfigRule()}

${loopRules(context)}

# Step 2 — find the bug and fix it

Find its cause and fix it. Run the loop until it is clean, then stop — there is no dead-code pass, no
duplication pass and no review agent on this path; the smallest correct fix is the whole job.

If you cannot locate the bug, cannot reproduce it, or the fix needs something you were not given — a
service that is not reachable, a decision only a person could make — say so plainly instead of
committing a guess or leaving the branch half-changed. A quick fix that ends without a working,
committable change is a failure to report, not a partial success.

# Git

The branch \`${context.branch}\` is already checked out in this worktree, cut from \`${context.baseRef}\`,
and the tree is clean. **Do not commit, do not push, do not touch git at all.** Bosun commits your fix
and pushes the branch once you finish — there is no pull request or review step of your own to drive.

# When you are done

Report, briefly: what the bug was, what you changed and why, and the loop's final result. If you could
not produce a fix, say so as the first line, with what you tried and what is missing.`;
}
