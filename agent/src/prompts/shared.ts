import { type ProjectConfig } from '../project-config';
import { type ProjectProfile } from '../project-profile';
import { envFileFor } from '../services/project-env.service';
import { appPorts, renderTemplate } from '../services/stack.service';
import { type ReadTree } from '../services/repo.service';

// A build bullet and a fix session write and commit. A lane session — a drive or a
// re-check — drives the product against a database bosun prepared, and keeps nothing.
export type RunMode = 'build' | 'lane' | 'fix';

export type DatabasePrep = 'migrated' | 'forbidden' | 'unconfigured';

export interface RunContext {
	mode: RunMode;
	planNumber: number;
	planTitle: string;
	planBodyMd: string;
	branch: string;
	baseRef: string;
	worktreePath: string;
	profile: ProjectProfile;
	// The config bosun holds for the repository. Null on a machine with no
	// repository, which runs on `profile` as before.
	config: ProjectConfig | null;
	// What bosun did to the development database before a lane session; null
	// outside the lane, which never touches it.
	database: DatabasePrep | null;
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
	const recording = canRecordDecisions ? ', record the decision with `record_decision` where you have one,' : '';
	const asking = canAsk
		? 'You may call `bosun_ask` when a decision is genuinely the operator\'s and you cannot settle it from the plan or the code. This plan keeps its build slot while you wait, but only for ten minutes: past that the session is stopped, other plans take the slot, and this bullet starts again from its last commit — with the answer in its prompt — once somebody gives one. Spend it on decisions that change what gets built, never on confirmations.'
		: `**You cannot ask anything.** No tool exists for it. Decide${recording} and carry on. A choice you are unsure of is still better than a session that ends having done nothing.`;

	return `# Nobody is watching this run

${asking}

- **Never stop on a blocker while other work remains.** Do every unblocked part of your scope first,
  then report what was blocked and why.
- **Never end your turn with a sub-agent still running.** This process exits when your turn ends, so
  anything outstanding is killed mid-call and the bullet is re-run from scratch. Await every \`Agent\`
  call and read its report inside the same turn.
- **Unblock yourself.** This machine is a server bosun runs for this project, and its worktree is
  yours: a missing env variable, a migration that did not apply, missing seed or test data, a
  dependency not installed, a stale build, a script that needs a flag — find the cause and fix it,
  then carry on. A blocker you could have removed with the shell you already have is a wasted
  session. Say in your report what was in the way and what you did about it.
- Blocked means only what no command here can fix — a secret value you were never given, an account
  or service outside this machine that only a person controls, or a rule below that protects the other
  plans on this machine. Then do not ask for it: finish everything else and say what is blocked, what
  you tried, and what a human must do.`;
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
is a blocker: report it with the error it gave. A key the app needs that is **not** in these files —
\`NODE_ENV\`, a feature flag, a port, anything that is not a secret — you add yourself, to the env file
the app reads.`;
}

export function commandList(entries: { label: string; cwd?: string; run: string }[]): string {
	return entries.map((entry) => `  - ${entry.label}: \`${entry.run}\`${entry.cwd === undefined ? '' : ` in \`${entry.cwd}\``}`).join('\n');
}

// The toolchain line, identical wherever a config is rendered: a plan bullet, a
// verify pass or a quick fix all run on whatever node bosun provisioned.
export function toolchainSection(config: ProjectConfig): string {
	const toolchain = config.toolchain;

	if (toolchain === undefined) {
		return '';
	}

	return `- Toolchain: node ${toolchain.node}${toolchain.packageManager === undefined ? '' : `, ${toolchain.packageManager}`} — provisioned by bosun and already first on your PATH. Never install or switch another.`;
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

function appCommandSection(config: ProjectConfig, opts: { field: 'codegen' | 'migrate' | 'test'; title: string }): string {
	const apps = Object.entries(config.apps).filter(([, app]) => app[opts.field] !== undefined);

	return apps.length === 0
		? ''
		: `- ${opts.title}:\n${commandList(apps.map(([name, app]) => ({ label: name, cwd: app.cwd, run: app[opts.field]! })))}`;
}

export function codegenSection(config: ProjectConfig): string {
	return appCommandSection(config, { field: 'codegen', title: 'Code generation' });
}

export function migrateSection(config: ProjectConfig): string {
	return appCommandSection(config, { field: 'migrate', title: 'Migrations' });
}

export function testSection(config: ProjectConfig): string {
	return appCommandSection(config, { field: 'test', title: 'Tests' });
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
// and proven by onboarding. Its checks are the loop; the one place a session looks
// further is a package it changes that none of them covers (see `loopSource`).
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
		testSection(config),
		checksSection(config),
		config.testAccounts.length === 0
			? ''
			: `- Test accounts, their credentials in your environment: ${config.testAccounts.map((account) => `${account.role} — ${renderTemplate(account.description, { app: null, ports })}`).join('; ')}. Read them with \`printenv\` when you need them and never print, quote or write down their values.`,
		notesSection(config),
		"- This project's config lives in bosun, not in the tree. If your work changes how the project installs, generates, migrates, starts or proves itself, say so plainly in your report — a leader edits the config from the browser, and no session can change it directly."
	].filter(Boolean);
}

function configuredProfile(profile: ProjectProfile): string[] {
	return [
		profile.setupCommand === null ? '' : `- Setup for a fresh checkout: \`${profile.setupCommand}\` (already run when this worktree was created).`,
		profile.migrationCommand === null ? '' : `- Migrations: \`${profile.migrationCommand}\`.`,
		profile.startCommand === null ? '' : `- Dev stack: \`${profile.startCommand}\`.`,
		profile.testCredentialsPath === null ? '' : `- Test-user credentials: \`${profile.testCredentialsPath}\`.`
	].filter(Boolean);
}

// The operator's standing instructions for this phase, from the machine's saved
// profile — unconditional, unlike `configuredProfile`/`configuredProject` above,
// which only ever render one or the other depending on whether the repository has
// an onboarded `.bosun/project.yaml`. A standing operator instruction should never
// be silently masked by onboarding, so this is rendered regardless of `config`.
export function operatorInstructionsSection(text: string | null): string {
	return text === null || text.trim() === ''
		? ''
		: `\n## Operator instructions\n\nWritten by the person who set this machine up. Treat it as standing instruction for this repository, in this session and every one like it that follows:\n\n${text.trim()}\n`;
}

export function hasConfiguredChecks(config: ProjectConfig | null): config is ProjectConfig {
	return config !== null && config.checks.length > 0;
}

// Onboarding already ran every check a config names. A session sent to re-read the
// manifests, the CI and the Makefile anyway repeats that search on every bullet,
// and ends up preferring a script it found over the check onboarding proved.
export function loopSource(config: ProjectConfig | null): string {
	if (hasConfiguredChecks(config)) {
		return `The project's config already says how this project proves itself, and onboarding ran every
command in it. **Its checks, listed below, are your loop.** Do not re-read the manifests, the CI workflow
or the Makefile to find another one or to confirm these.

Look further in one case only: a package or workspace you will change that none of those checks covers.
Then read that package's own manifest for its typecheck, lint and test commands — nothing wider — and
write down what you found.`;
	}

	return `You do not know this project. Work out how it tells you that you have broken it, and write the
commands down in your report. Look in \`package.json\` scripts, the Makefile, the CI workflow, and any
\`CLAUDE.md\`, \`AGENTS.md\` or \`CONTRIBUTING.md\` — those files are the project's own account of how it
is built, and they outrank your habits.`;
}

const DISCOVERY_LIST = `Find, for each package or workspace you will touch:

- the **typecheck**, **lint** and **unit test** commands, or the single command that runs all of them
- whether there is a **duplication** or **dead-code** check, and what invokes it
- how **migrations** are generated and applied, if the project has a database
- how the **dev stack** starts, and on which ports
- anything else that fails the build: a formatter check, a bundle-size gate, a codegen step that must
  be re-run after a schema or API change`;

// The fix session's machine pass runs the repository's own dead-code and
// duplication tools, and a config names its checks without saying which is which.
const SCAN_TOOLS = `The fix pass in step 2 also needs this repository's **dead-code** and **duplication** tools. Tell them
apart among the checks below — read the script a check runs when its name does not say — and write down
which they are. "None" is an answer.`;

function loopDetail(context: RunContext): string {
	if (!hasConfiguredChecks(context.config)) {
		return DISCOVERY_LIST;
	}

	return context.mode === 'fix' ? SCAN_TOOLS : '';
}

// The heart of the user's requirement: the session works out how this repository
// proves itself before it changes anything. A loop discovered after the work is
// a loop that gets skipped when the work runs long.
export function feedbackLoops(context: RunContext): string {
	const configured = context.config === null ? configuredProfile(context.profile) : configuredProject(context);
	const source = context.config === null ? 'What the operator has already told bosun about this project' : "What bosun's stored config says about this project";
	const detail = loopDetail(context);

	return `# Step 1 — this repository's feedback loops, before you change anything

${loopSource(context.config)}
${detail === '' ? '' : `\n${detail}\n`}
**Write the commands down; do not run them yet.** When and how they run is set out at the end of
this step, and it is the same for every session bosun starts on this machine.

${configured.length === 0 ? '_The operator configured nothing — everything above is yours to discover._' : `${source}:\n\n${configured.join('\n')}`}${providedEnv(context)}
${operatorInstructionsSection(context.profile.implementInstructions)}
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
  If the app needs a service that is not reachable, rule out your own side first — a wrong URL, a
  missing variable, a port — and fix that; only a service that is really down or absent is a blocker
  to report with what you tried. A stand-in costs this machine memory it does not have and proves
  nothing about the real one.`;
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
const DATABASE_STATE: Record<DatabasePrep, string> = {
	// "Ran" is not "applied": drizzle skips a migration older than the newest one
	// in the database and still exits 0, and a drive told the schema was current
	// called the missing column an infra gap nobody could act on.
	migrated:
		'bosun ran this repository\'s `migrate` command before you started. That is not proof every migration applied: a table or column this branch adds that is still missing means the tool skipped it — find out why (a migration journal out of order is the usual cause), make it apply, and run the `migrate` command again.',
	forbidden: 'bosun left the database alone before you started — this machine may not be migrated.',
	unconfigured:
		'bosun did **not** migrate the database: this repository has no config in bosun, or its config has no `migrate` command. Find how this project migrates from its scripts and run it yourself before you drive.'
};

// The lane database is this machine's alone, and bosun re-prepares it before the
// next drive, so a drive may migrate and fill it. `forbidden` is a person's
// decision about a database bosun must not change, so it is the one state that
// still stops a session.
export function migrationRule(context: Pick<RunContext, 'mode' | 'database'>): string {
	if (context.mode === 'lane') {
		const database = context.database ?? 'forbidden';

		return database === 'forbidden'
			? `Migrations: ${DATABASE_STATE.forbidden} **Never apply or roll back a migration, and never reset or seed the database.** A table or column the branch needs that is missing is a blocker to report.`
			: `Migrations: ${DATABASE_STATE[database]} The development database is yours to make usable: apply migrations, run the project's seeds, create the records a criterion needs. **Never drop or reset it** — other people may read it — and never edit a migration's SQL; a change to how one is ordered or registered you make, and report as a \`setup\` finding so it is committed.`;
	}

	return `Migrations: **never apply one, and never run a test that needs a database.** Change the schema and
generate the migration with this project's own generator, then leave it in the tree to be committed
with your work. A hand-written migration still goes through the generator (drizzle: \`--custom\`): never
write a journal entry or its timestamp yourself, because a tool that orders by timestamp skips every
migration dated before one you invented. A drive finding that a migration exists but never applied is
yours to repair in those files. Bosun applies migrations only when it verifies the plan, against a database it resets
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
