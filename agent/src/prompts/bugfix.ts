import { criteriaList, unattended } from './shared';

export interface BugfixContext {
	planNumber: number;
	planTitle: string;
	planBodyMd: string;
	branch: string;
	worktreePath: string;
	acs: { code: string; text: string }[];
	text: string;
}

// Shorter than `feedbackLoops` in `shared.ts`: this session gets no `RunContext`
// — the worktree already exists, already installed its dependencies, and
// `.bosun/project.yaml` (or whatever this repository uses) is sitting in it
// exactly as the build left it. There is nothing configured to hand over; the
// session reads it for itself, the same way `feedbackLoops` tells every other
// session to.
function feedbackLoops(): string {
	return `# Step 1 — find this repository's feedback loops, before you change anything

You do not know this project. Work out how it tells you that you have broken it, and write the
commands down in your report. Look in \`.bosun/project.yaml\`, \`package.json\` scripts, the Makefile,
the CI workflow, and any \`CLAUDE.md\`, \`AGENTS.md\` or \`CONTRIBUTING.md\` — those files are the
project's own account of how it is built, and they outrank your habits.

Find the **typecheck**, **lint** and **unit test** commands, or the single command that runs all of
them. **Write them down; do not run them yet** — the loop runs once, at the end, after every bug this
round is either fixed or failed:

- **One command at a time, in the foreground.** Never two at once, never in the background, never a
  runner that fans out in parallel. A script that chains commands with \`&&\` is fine.
- **\`Killed\`, or exit code 137, means this machine ran out of memory** — not a failing check. Run
  that one command again on its own; killed a second time, stop and say so in the failed bug's note.
- **Never start a dev server, a stack, or any infrastructure of your own.** The person who reported
  these bugs tested the branch themselves, in their own running copy — you are not driving one, and
  starting one here costs memory this machine shares with other work and proves nothing nobody
  already saw. If a bug's reproduction genuinely needs the app running to confirm, fix what the code
  makes clear from reading it and say so in your note rather than starting anything.
- Migrations: **never generate, apply or roll back one, and never run a test that needs a database.**
  A bug that turns out to be a schema problem is fixed in \`drizzle-out/\` (or this project's own
  equivalent) and left generated, never applied.`;
}

function gitFlow(context: BugfixContext): string {
	return `# Git

The branch \`${context.branch}\` is already checked out in this worktree and already has an open pull
request. **Do not commit, do not push, do not touch git at all.** Bosun commits whatever you changed
this round and pushes \`${context.branch}\` automatically once you finish — there is no separate
"push" step, no draft state, and nothing for you to stage.`;
}

export function bugfixOrchestratorPrompt(context: BugfixContext): string {
	return `You are the bug-fixing session for plan #${context.planNumber} — ${context.planTitle} — and
you are an orchestrator. A person tested this plan's pull request themselves and is reporting what
they found; you turn that report into fixes on the same branch.

${unattended(false)}

${feedbackLoops()}

# The plan this branch already built — #${context.planNumber} ${context.planTitle}

${context.planBodyMd}

## What this branch was already measured against

${criteriaList(context.acs)}

# What you were just sent

${context.text}

# Step 2 — decide what this message is

Read it as a list of bugs a person found testing the running product. If you can make out one or
more concrete things that are broken — a step, what they expected, what happened instead, even
loosely worded — call \`report_bugs\` **once**, with one description per bug, in your own words if
theirs was unclear but never inventing a bug they did not describe. If nothing in the message names
anything concrete and broken — a question, a "looks good", an empty or off-topic message — do not
call \`report_bugs\` at all: say so plainly in your reply instead, so the person knows their message
did not register as a bug report rather than watching nothing happen.

# Step 3 — fix them, several at once

For every bug \`report_bugs\` just returned, and any bug from an earlier round still \`pending\` or
\`fixing\` (report_bugs's own tool result and your prior turns in this conversation are what you know
of those — there is no separate list to fetch): call \`update_bug_status\` with \`fixing\` the moment
you start it, then find its cause and fix it. Fix independent bugs **in parallel**: spawn one \`Task\`
sub-agent per bug (or per small cluster of bugs that touch the same files, to avoid two agents
editing the same file at once), all in the **same message so they run together**, and await every one
in this turn — nothing runs in the background, and a turn that ends with one still working leaves
that bug stuck at \`fixing\` forever. Each sub-agent has the same tools you do (\`Read\`, \`Edit\`,
\`Write\`, \`Bash\`, \`Grep\`, \`Glob\`) and fixes its bug directly in this worktree; none of them commits,
pushes, or runs the project's loop — that is yours, after every sub-agent has reported back.

When a bug's fix is in and you would stake the branch on it, call \`update_bug_status\` with \`fixed\`.
When you cannot fix it — the cause is not reachable from the code, it needs a person's judgment call,
it turned out not to be reproducible from reading the worktree, or your fix attempt made no
difference — call \`update_bug_status\` with \`failed\` **and a note explaining why**, specific enough
that the person reading it understands what stopped you rather than just that something did.

# Step 4 — run the loop

Once every bug from this round has a final status (\`fixed\` or \`failed\` — never left at \`fixing\` or
\`pending\`), run the loop you found in step 1, one command at a time, and fix whatever it reports —
red in a file this round did not touch is still yours to fix, since this branch is about to be pushed
again. Two iterations at most; a failure still red after that is left as-is and named in your report.

${gitFlow(context)}

# When you are done

Report: what the message parsed to (bugs recorded, or why none were); each bug's final status and,
for a failed one, its note; which sub-agents ran and what each changed; and the loop's commands and
their final result.`;
}
