import { type ProjectProfile } from '../project-profile';
import { envFileFor } from '../services/project-env.service';
import { type ReadTree } from '../services/repo.service';

export interface RunContext {
	planNumber: number;
	planTitle: string;
	planBodyMd: string;
	branch: string;
	baseRef: string;
	worktreePath: string;
	profile: ProjectProfile;
	portBase: number;
	afk: boolean;
	decisions: { fork: string; chose: string }[];
	planAcs: { code: string; text: string }[];
	// The `.env` files bosun wrote into this worktree, by key name. Never the values:
	// a prompt ends up in a transcript, and the transcript leaves the machine.
	providedEnv: { path: string; keys: string[] }[];
}

export function criteriaList(acs: { code: string; text: string }[]): string {
	return acs.length === 0
		? '_None recorded._'
		: acs.map((ac) => `- **${ac.code}** ${ac.text}`).join('\n');
}

// Nobody is reading the output, and there is no second chance to ask. Every rule
// here exists because the alternative wastes the whole session rather than
// degrading it.
export function unattended(afk: boolean): string {
	const asking = afk
		? `**You cannot ask anything.** No tool exists for it. Decide, record the decision with \`record_decision\`, and carry on. A choice you are unsure of is still better than a session that ends having built nothing.`
		: `You may call \`bosun_ask\` when a decision is genuinely the operator's and you cannot settle it from the plan or the code. It blocks this queue — every plan behind it waits — so spend it on decisions that change what gets built, never on confirmations.`;

	return `# Nobody is watching this run

${asking}

- **Never stop on a blocker while other work remains.** Do every unblocked part of your scope first,
  then report what was blocked and why.
- **Never end your turn with a sub-agent still running.** This process exits when your turn ends, so
  anything outstanding is killed mid-call and the bullet is re-run from scratch. Await every \`Agent\`
  call and read its report inside the same turn.
- If something genuinely cannot be done here — no network route, a credential you lack, an infra
  change only a person can make — do not ask for it. Finish everything else and say what is blocked,
  what you tried, and what a human must do.`;
}

// Verify bullets used to arrive at a worktree with no database URL and build a
// database of their own in /tmp. Naming the keys is what tells the session the
// connection is already there and is the real one.
function providedEnv(context: RunContext): string {
	if (context.providedEnv.length === 0) {
		return '';
	}

	const files = context.providedEnv
		.map((set) => `- \`${envFileFor(set.path)}\`: ${set.keys.join(', ')}`)
		.join('\n');

	return `

**The operator provided this project's real services.** Bosun wrote these into the worktree before
this session started:

${files}

They are the real connections — the database and services this project runs against, not
placeholders. Never override those keys, never point them anywhere else, and never start a local
database, container, proxy or PGlite in their place. Never print or quote their values — not in a
command's output you repeat, not in a brief, not in your report. If one of them is unreachable, that
is a blocker: report it with the error it gave.`;
}

// The heart of the user's requirement: the session works out how this repository
// proves itself before it changes anything. A loop discovered after the work is
// a loop that gets skipped when the work runs long.
export function feedbackLoops(context: RunContext): string {
	const profile = context.profile;
	const configured = [
		profile.setupCommand === null ? '' : `- Setup for a fresh checkout: \`${profile.setupCommand}\` (already run when this worktree was created).`,
		profile.migrationCommand === null ? '' : `- Migrations: \`${profile.migrationCommand}\`.`,
		profile.startCommand === null ? '' : `- Dev stack: \`${profile.startCommand}\`.`,
		profile.testCredentialsPath === null ? '' : `- Test-user credentials: \`${profile.testCredentialsPath}\`.`,
		profile.notes === null ? '' : `- Operator notes: ${profile.notes}`
	].filter(Boolean);

	return `# Step 1 — find this repository's feedback loops, before you change anything

You do not know this project. Work out how it tells you that you have broken it, and write the
commands down in your report. Look in \`package.json\` scripts, the Makefile, the CI workflow, and any
\`CLAUDE.md\`, \`AGENTS.md\` or \`CONTRIBUTING.md\` — those files are the project's own account of how it
is built, and they outrank your habits.

Find, for each package or workspace you will touch:

- the **typecheck**, **lint** and **unit test** commands, or the single command that runs all of them
- whether there is a **duplication** or **dead-code** check, and what invokes it
- how **migrations** are generated and applied, if the project has a database
- how the **dev stack** starts, and on which ports
- anything else that fails the build: a formatter check, a bundle-size gate, a codegen step that must
  be re-run after a schema or API change

**Write the commands down; do not run them yet.** When and how they run is set out at the end of
this step, and it is the same for every session bosun starts on this machine.

${configured.length === 0 ? '_The operator configured nothing — everything above is yours to discover._' : `What the operator has already told bosun about this project:\n\n${configured.join('\n')}`}${providedEnv(context)}

**Ports are yours: ${context.portBase}–${context.portBase + 9}.** Other queues on this machine are
running their own copies of this project at the same time, from their own worktrees. Any listener you
start must be inside that range — take a port outside it and you take one another queue is using, and
both stacks break in ways neither session can explain.

Migrations: ${profile.applyMigrations ? 'apply them yourself when your work needs them, and never hand-write the SQL — change the schema and regenerate. Once applied, the new schema is live and you can exercise your work for real in this session, so an unapplied migration is never a blocker and never a reason to skip a check.' : '**do not apply them.** This machine points at a database bosun must not migrate. Generate the migration and commit it, then say in your report that it is pending.'}

## How the loop runs — once per iteration, by you, one command at a time

This machine is shared with other queues and its memory is finite. Typechecking or linting a whole
package can take gigabytes on its own; two of them at once, beside a dev stack, is how a session gets
killed by the kernel halfway through its work.

- **Only you run the loop.** Typecheck, lint, tests, duplication and dead-code checks, builds — none of
  them is a sub-agent's job. Every brief you write says so in as many words: *do not run typecheck,
  lint, tests, builds or a dev server; make your changes and report.*
- **It runs once, at the end of an iteration.** An iteration is a round of work — your own, or every
  sub-agent you dispatched for it — and the loop runs after all of it has reported. Never while a
  sub-agent is still working, and never after each small change.
- **One command at a time, in the foreground.** Wait for each to finish before starting the next.
  Never two at once, never in the background, never a runner that fans out in parallel
  (\`--parallel\`, \`concurrently\`, \`npm-run-all -p\`). A script that chains commands with \`&&\` is fine.
- **Red is the next iteration.** Fix what the loop reported, then run it once more. A failure in a file
  this branch did not change (\`git diff --name-only ${context.baseRef}\`) is inherited: report it with
  the command and its output instead of fixing it.
- **\`Killed\`, or exit code 137, means this machine ran out of memory** — it is not a failing check.
  Stop anything of yours still running, a dev server or a watcher, and run that one command again on
  its own. Killed a second time, stop: report it as blocked with the command.
- **Never start infrastructure nobody gave you.** This project's own dev stack is not that; a database,
  PGlite, a Docker container, a proxy or any other stand-in service of your own is, and so is anything
  installed into \`/tmp\`. **A session never starts its own database, under any circumstances** — not
  embedded, not in a container, not "just for the tests", not even when this project's own scripts
  would start one. No database connection configured is a blocker to report, not something to build.
  If the app needs a service that is not reachable, that is a blocker to report with what you tried —
  a stand-in costs this machine memory it does not have and proves nothing about the real one.`;
}

export function decisionsSection(context: RunContext): string {
	const taken =
		context.decisions.length === 0
			? '_Nothing recorded yet on this plan._'
			: context.decisions.map((entry) => `- **${entry.fork}** — ${entry.chose}`).join('\n');

	return `# Record every fork the plan left open

A plan cannot settle every question, and some forks are only visible once the code exists. When you
resolve one it goes on the record with \`record_decision\` — not in your head, not buried in a summary.
It is what the reviewer reads before the diff, and it is carried into the pull request verbatim.

**These triggers are mechanical. Hitting one requires an entry** — do not weigh whether it felt
significant:

- a new shared module, helper or service other code will import
- a new table, column, enum or migration
- a new endpoint, or a change to an existing request or response shape
- a new state machine, reducer or engine rule
- changed props or behaviour on something more than one feature consumes
- a new dependency
- a change spanning more than five files
- an acceptance criterion that turns out unbuildable, wrong, or already true as written
- choosing between two viable implementations where the plan named neither

Never silently drop an acceptance criterion. If one cannot hold, that is a decision: record it with
the reason.

Already decided on this plan — treat these as settled and do not revisit them:

${taken}`;
}

export function gitFlow(context: RunContext): string {
	return `# Git

The branch \`${context.branch}\` is already checked out in this worktree, cut from \`${context.baseRef}\`,
and the tree is clean. **Do not commit, do not push, do not touch git at all.** Bosun commits this
bullet for you when you finish and opens one pull request per plan once every bullet has landed — a
commit of your own splits the history it keeps and leaves no single sha against this bullet.`;
}

// Every read-only session is pointed at a checkout of the current default branch
// that bosun fetched a moment ago, not at the operator's own working copy. The
// session is told which, because the two lead to different answers: "this table
// does not exist" off a tree that is a week behind is how a plan ends up asking
// for something that landed on Tuesday.
export function repoState(tree: ReadTree): string {
	if (!tree.fresh) {
		return `## The checkout you are reading

You are reading the machine's own checkout at \`${tree.path}\`. **It could not be refreshed** —
${tree.detail} — so it may be behind the default branch, may sit on an unrelated branch, and may hold
uncommitted work. Say so in one line when you report, and treat "this does not exist" as "I could not
find it in a tree of unknown age" rather than as a fact.`;
	}

	return `## The checkout you are reading

You are reading \`${tree.path}\` — a checkout of **\`${tree.ref}\`** at \`${tree.sha ?? 'unknown'}\`,
fetched from the remote a moment ago. It is the same ref every queue cuts its branches from, so what
you see here is what the work will actually be built on top of.

It is **not** the operator's own working copy, so uncommitted or unpushed work of theirs is not here
and is not something to reason about. What is here is current: if you cannot find something, it is
genuinely absent from \`${tree.ref}\` rather than merely absent from a stale tree.`;
}
