import { PROJECT_CONFIG_PATH, type ProjectConfig } from '../project-config';
import { type ProjectProfile } from '../project-profile';
import { envFileFor } from '../services/project-env.service';
import { appPorts, renderTemplate } from '../services/stack.service';
import { type ReadTree } from '../services/repo.service';

// A build bullet and a fix session write and commit. A lane session — a drive or a
// re-check — drives the product against a database bosun prepared, and keeps nothing.
export type RunMode = 'build' | 'lane' | 'fix';

export interface RunContext {
	mode: RunMode;
	planNumber: number;
	planTitle: string;
	planBodyMd: string;
	branch: string;
	baseRef: string;
	worktreePath: string;
	profile: ProjectProfile;
	// A repository machine's config, from the worktree's own file or the draft. Null
	// on a machine with no repository, which runs on `profile` as before.
	config: ProjectConfig | null;
	// Policy, not a fact about the code: whether this machine's lane may migrate.
	applyMigrations: boolean;
	// Session-secret names in the session's environment. Never the values.
	sessionSecrets: string[];
	portBase: number;
	afk: boolean;
	decisions: { fork: string; chose: string }[];
	// What bosun changed about this plan so it fits beside the others.
	amendments: string[];
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
// `canRecordDecisions` names whether `record_decision` is actually among this
// session's tools: a quick fix is given none of the plan-bullet MCP tools, and
// telling it to call one it does not have would be a promise the session cannot
// keep.
export function unattended(canAsk: boolean, canRecordDecisions = true): string {
	const asking = canAsk
		? `You may call \`bosun_ask\` when a decision is genuinely the operator's and you cannot settle it from the plan or the code. This plan keeps its build slot while you wait, but only for ten minutes: past that the session is stopped, other plans take the slot, and this bullet starts again from its last commit — with the answer in its prompt — once somebody gives one. Spend it on decisions that change what gets built, never on confirmations.`
		: `**You cannot ask anything.** No tool exists for it. Decide${canRecordDecisions ? ', record the decision with `record_decision` where you have one,' : ''} and carry on. A choice you are unsure of is still better than a session that ends having done nothing.`;

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
export function providedEnv(context: Pick<RunContext, 'providedEnv'>): string {
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

export function commandList(entries: { label: string; cwd?: string; run: string }[]): string {
	return entries.map((entry) => `  - ${entry.label}: \`${entry.run}\`${entry.cwd === undefined ? '' : ` in \`${entry.cwd}\``}`).join('\n');
}

// The toolchain line, identical wherever a config is rendered: a plan bullet, a
// verify pass or a quick fix all run on whatever node bosun provisioned.
export function toolchainSection(config: ProjectConfig): string {
	const toolchain = config.toolchain;

	return toolchain === undefined
		? ''
		: `- Toolchain: node ${toolchain.node}${toolchain.packageManager === undefined ? '' : `, ${toolchain.packageManager}`} — provisioned by bosun and already first on your PATH. Never install or switch another.`;
}

// The setup block. A quick fix has no dev-stack re-run to mention, so it takes the
// shorter of the two — the plain fact that setup already ran in this worktree —
// while a plan bullet also says setup is kept current for it as watched files change.
export function setupSection(config: ProjectConfig, opts: { rerun: boolean }): string {
	if (config.setup.length === 0) {
		return '';
	}

	const commands = commandList(config.setup.map((step) => ({ label: step.name, cwd: step.cwd, run: step.run })));

	return opts.rerun
		? `- Setup, already run in this worktree and re-run by bosun whenever its watched files change:\n${commands}`
		: `- Setup, already run in this worktree:\n${commands}`;
}

export function codegenSection(config: ProjectConfig): string {
	const apps = Object.entries(config.apps);

	return apps.some(([, app]) => app.codegen !== undefined)
		? `- Code generation:\n${commandList(apps.filter(([, app]) => app.codegen !== undefined).map(([name, app]) => ({ label: name, cwd: app.cwd, run: app.codegen! })))}`
		: '';
}

export function migrateSection(config: ProjectConfig): string {
	const apps = Object.entries(config.apps);

	return apps.some(([, app]) => app.migrate !== undefined)
		? `- Migrations:\n${commandList(apps.filter(([, app]) => app.migrate !== undefined).map(([name, app]) => ({ label: name, cwd: app.cwd, run: app.migrate! })))}`
		: '';
}

export function checksSection(config: ProjectConfig): string {
	return config.checks.length === 0
		? ''
		: `- The project's checks — the core of your loop:\n${commandList(config.checks.map((check, index) => ({ label: check.name ?? `check ${index + 1}`, cwd: check.cwd, run: check.run })))}`;
}

export function notesSection(config: ProjectConfig): string {
	return config.notes === undefined ? '' : `- Notes: ${config.notes.trim()}`;
}

// Everything a session used to rediscover an hour into a bullet, written down once
// and proven by onboarding. It is the starting point, not the ceiling: a check the
// config does not name is still worth running when the session finds one.
export function configuredProject(context: RunContext): string[] {
	const config = context.config;

	if (config === null) {
		return [];
	}

	const ports = appPorts(config, context.portBase);
	const apps = Object.entries(config.apps);

	return [
		toolchainSection(config),
		setupSection(config, { rerun: true }),
		apps.length === 0
			? ''
			: `- Apps, started only with the \`stack_up\` tool — never by running their start command yourself:\n${apps.map(([name, app]) => `  - \`${name}\` on port ${ports[name]} (http://127.0.0.1:${ports[name]})${app.cwd === undefined ? '' : ` in \`${app.cwd}\``}${app.dependsOn === undefined ? '' : `, after ${app.dependsOn.join(', ')}`}`).join('\n')}`,
		codegenSection(config),
		migrateSection(config),
		checksSection(config),
		config.testAccounts.length === 0
			? ''
			: `- Test accounts: ${config.testAccounts.map((account) => `${account.role} signs in at ${renderTemplate(account.signIn, { app: null, ports })} with ${account.secrets.map((key) => `\`$${key}\``).join(' and ')} from your environment`).join('; ')}. Read them with \`printenv\` when you need them and never print, quote or write down their values.`,
		notesSection(config),
		`- \`${PROJECT_CONFIG_PATH}\` describes this code and travels with the branch. If your work changes how the project installs, generates, migrates, starts or proves itself, update it in this bullet — it is validated before the bullet is committed, and a file you leave invalid fails the bullet.`
	].filter(Boolean);
}

function configuredProfile(profile: ProjectProfile): string[] {
	return [
		profile.setupCommand === null ? '' : `- Setup for a fresh checkout: \`${profile.setupCommand}\` (already run when this worktree was created).`,
		profile.migrationCommand === null ? '' : `- Migrations: \`${profile.migrationCommand}\`.`,
		profile.startCommand === null ? '' : `- Dev stack: \`${profile.startCommand}\`.`,
		profile.testCredentialsPath === null ? '' : `- Test-user credentials: \`${profile.testCredentialsPath}\`.`,
		profile.notes === null ? '' : `- Operator notes: ${profile.notes}`
	].filter(Boolean);
}

// The heart of the user's requirement: the session works out how this repository
// proves itself before it changes anything. A loop discovered after the work is
// a loop that gets skipped when the work runs long.
export function feedbackLoops(context: RunContext): string {
	const configured = context.config === null ? configuredProfile(context.profile) : configuredProject(context);
	const source = context.config === null ? 'What the operator has already told bosun about this project' : `What \`${PROJECT_CONFIG_PATH}\` says about this project`;

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

${configured.length === 0 ? '_The operator configured nothing — everything above is yours to discover._' : `${source}:\n\n${configured.join('\n')}`}${providedEnv(context)}

${portsRule(context)}

${agentConfigRule()}

${migrationRule(context)}

${loopRules(context)}`;
}

// The rules the loop itself runs under, once a session knows what its commands
// are. Identical whatever kind of session is running it — a plan bullet, a verify
// pass, a quick fix — because the machine it shares and the way `claude` gets
// killed for memory do not change with the kind of work.
export function loopRules(context: Pick<RunContext, 'baseRef'>): string {
	return `## How the loop runs — once per iteration, by you, one command at a time

This machine is shared with other plans and its memory is finite. Typechecking or linting a whole
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

export function portsRule(context: Pick<RunContext, 'portBase'>): string {
	return `**Ports are yours: ${context.portBase}–${context.portBase + 9}.** Other plans on this machine are
running their own copies of this project at the same time, from their own worktrees. Any listener you
start must be inside that range — take a port outside it and you take one another plan is using, and
both stacks break in ways neither session can explain.`;
}

// Sessions driving a plan that touched the agent CLI took the box down three ways:
// an enroll over the config moved the machine onto another identity, a second
// agent's startup stopped every session running, and a revoked one deletes
// `~/.bosun` whatever `--config` it was given. None is safe from a worktree.
export function agentConfigRule(): string {
	return `**The bosun agent on this machine is not yours to run.** Never run \`bosun-agent enroll\`, \`run\`,
\`setup\` or \`mcp add\`; never start, stop or restart \`bosun-agent\` or \`bosun-run-*\` units; and outside
your own worktree never edit, move or replace anything under \`~/.bosun\`. Every plan on this machine runs
through that agent: an enroll replaces its identity, a starting agent stops running sessions, and a
removed one deletes \`~/.bosun\` — each takes every plan down, yours included, and a \`--config\` inside
your worktree prevents none of it. Work that can only be checked by enrolling or running an agent is
blocked: say so, and do not work around it.`;
}

// The database belongs to the lane. Every worktree gets the same env, so a bullet
// that migrated would put its unmerged schema under every other plan on the box —
// and a verify that passed against another plan's schema proves nothing.
export function migrationRule(context: Pick<RunContext, 'mode' | 'applyMigrations'>): string {
	if (context.mode === 'lane') {
		return `Migrations: bosun ${context.applyMigrations ? 'reset this machine\'s development database and applied every migration' : 'left the database alone — this machine may not be migrated —'} before you started. **Never generate, apply or roll back a migration, and never reset or seed the database yourself.**`;
	}

	return `Migrations: **never apply one, and never run a test that needs a database.** Change the schema and
generate the migration with this project's own generator, then leave it in the tree to be committed
with your work. Bosun applies migrations only when it verifies the plan, against a database it resets
first, and renumbers generated migrations when this plan lands beside others. A check that needs a
database is not part of your loop — say in your report which ones you skipped.`;
}

export function amendmentsSection(context: Pick<RunContext, 'amendments'>): string {
	if (context.amendments.length === 0) {
		return '';
	}

	return `# What bosun changed about this plan

This plan was approved beside others, and bosun amended it so they fit together. These are standing
instructions, not suggestions — where one contradicts the plan above, the amendment wins:

${context.amendments.map((entry) => `- ${entry}`).join('\n')}`;
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
	const checkedOut = `The branch \`${context.branch}\` is already checked out in this worktree, cut from \`${context.baseRef}\`,
and the tree is clean. **Do not commit, do not push, do not touch git at all.**`;

	if (context.mode === 'lane') {
		return `# Git

${checkedOut} Nothing you change here is kept: bosun discards the tree when you finish, because this
session drives the product and does not change it.`;
	}

	return `# Git

${checkedOut} Bosun commits ${context.mode === 'fix' ? 'your fixes' : 'this bullet'} when you finish and pushes
the branch, so a plan waiting on this one can build on it. It integrates the branch with its base and
opens the pull request once the plan is built and verified — a commit of your own splits the history
it keeps and leaves no single sha against this ${context.mode === 'fix' ? 'session' : 'bullet'}.`;
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
fetched from the remote a moment ago. It is the same ref every plan is built on top of, so what you see
here is what the work will actually land on.

It is **not** the operator's own working copy, so uncommitted or unpushed work of theirs is not here
and is not something to reason about. What is here is current: if you cannot find something, it is
genuinely absent from \`${tree.ref}\` rather than merely absent from a stale tree.`;
}
