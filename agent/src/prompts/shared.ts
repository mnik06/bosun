import { type ProjectProfile } from '../project-profile';

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

Run the loop **once now, before you touch anything**. A repository that is already red tells you so
in thirty seconds; discovering it after your changes are in means you cannot tell your breakage from
what you inherited. Say in your report which it was.

${configured.length === 0 ? '_The operator configured nothing — everything above is yours to discover._' : `What the operator has already told bosun about this project:\n\n${configured.join('\n')}`}

**Ports are yours: ${context.portBase}–${context.portBase + 9}.** Other queues on this machine are
running their own copies of this project at the same time, from their own worktrees. Any listener you
start must be inside that range — take a port outside it and you take one another queue is using, and
both stacks break in ways neither session can explain.

Migrations: ${profile.applyMigrations ? 'apply them yourself when your work needs them, and never hand-write the SQL — change the schema and regenerate. Once applied, the new schema is live and you can exercise your work for real in this session, so an unapplied migration is never a blocker and never a reason to skip a check.' : '**do not apply them.** This machine points at a database bosun must not migrate. Generate the migration and commit it, then say in your report that it is pending.'}`;
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
