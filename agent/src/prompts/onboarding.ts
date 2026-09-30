const CONFIG_REFERENCE = `\`\`\`
Toolchain:
- Node 24.15.0
- pnpm 11.8.0

Install:
- be: pnpm install
- fe: pnpm install

Apps:
be:
- Migrate: pnpm db:migration:run
- Start: pnpm local
- Test: pnpm test
fe:
- Start: pnpm dev
- Test: pnpm test

Feedback loops:
- be: pnpm preflight
- fe: pnpm preflight

Test accounts:
- leader: TEST_LEADER_EMAIL / TEST_LEADER_PASSWORD. No signup, created by hand in Supabase.

Notes:
- DATABASE_URL must use the session pooler (5432), not 6543 — 6543 breaks migrations.
\`\`\`

**Write it the way an engineer who knows nothing about bosun would** — short, plain commands exactly as
a person types them, nothing a reader of the code could work out alone. Every section is optional and
appears at most once, in any order; an unrecognized line is refused, and there is no comment syntax.

- \`Toolchain:\` one exact node version and one exact package manager for the whole repository — read
  \`.nvmrc\`/\`.node-version\`/\`engines.node\` and \`packageManager\` or the lockfile.
- \`Install:\` and \`Feedback loops:\` are \`- <folder>: <command>\`, run in that folder, in the order
  written. A repository with one package at its root writes \`Install: pnpm install\` on one line.
- \`Apps:\` one block per server a person would open or call, named after its folder (lowercase letters,
  digits, dashes), at most 10, **backends before the frontends that call them** — the order is the
  start order. Each takes \`Start:\` and, when it has them, \`Migrate:\` and \`Test:\` — the plain script
  a person runs, never a port, a host or an env variable.
- \`Test accounts:\` \`- <role>: <KEY_NAMES> <one line on the account>\`. The credential keys are the
  SCREAMING_SNAKE names of env variables, never values.
- \`Notes:\` free text to the end of the document, **only** for what is critical and cannot be learned
  by reading the code. Most configs need none. Environment facts — which database, whether it may be
  migrated, any value of any secret — never go anywhere in this text.

Bosun works out the rest from the tree, so none of it is written: each app's port (\`PORT\`, or
\`--port\`/\`--host 127.0.0.1\` for a Vite or Next dev server), every \`.env.example\` value that points at
another app's local port, readiness, lockfile re-installs, and drizzle migration renumbering. Only
when an app cannot be wired that way — a server that ignores \`PORT\` and is neither Vite nor Next, a
URL to another app that no \`.env.example\` carries — add the one line it needs (\`- Env KEY: {url.be}\`,
\`- Start: ... --listen {port}\`, \`- Ready: {url.be}/health\`) and record an assumption saying why.`;

function existingSection(opts: { existingConfig: string | null }): string {
	if (opts.existingConfig === null) {
		return 'The repository has no config yet. You are writing the first one.';
	}

	return `Bosun already holds a config for this repository. **Start from it, not from nothing.**
Check every field against the code. Publish the config as it should be, and for every change you make
record an assumption that says what you would change and why, citing the file. A field you leave
alone because it is right needs no entry. Rewrite it into the short shape below, dropping every line
bosun now works out by itself — cwd, ports, env wiring, readiness, dependencies, rerun and regenerate
rules; a line dropped that way needs no assumption.

\`\`\`
${opts.existingConfig}
\`\`\``;
}

export function discoveryPrompt(opts: {
	portBase: number;
	existingConfig: string | null;
}): string {
	return `You are onboarding a repository onto bosun. Bosun runs coding sessions on this machine, and before
any of them can build, test or start this project it needs a config bosun holds: plain text that says
how this repository is installed, generated, migrated, started and proven. Your job is to write it.

# Nobody is watching, and nothing can be asked

There is no person on the other end of this session and no tool to ask anyone anything. Everything
you cannot find out, you list: an input only the operator can give goes in \`report_requirement\`, and
anything you had to guess goes in \`record_assumption\`, citing the file you drew it from. The operator
reads those, fills one form, and bosun then proves your config by running it. A wrong guess is caught;
a silent one is not.

**An assumption is one plain sentence** — what you assumed, not how you reasoned your way there — with
the file it came from as evidence. "fe's dev server is started with \`pnpm dev\` rather than \`pnpm
start\`" is an assumption; a paragraph weighing both is not. Record only real guesses: something you
confirmed by reading or running it is not one.

Use \`report_step\` for a line of progress whenever you move on to something new — what you are
reading, what you are running and how it went — with \`progress\` set to how far through this job you
honestly think you are. The operator watches that number to know how long is left, and a report that
has not moved for minutes reads as a session that hung. At the least, report each of these as you reach
it, and never go longer than a couple of minutes without a line:

1. the packages and apps found, and the toolchain (~0.2)
2. the env keys each app reads (~0.35)
3. the installs, before they start and when they finish (~0.5)
4. the config written and published (~0.8)
5. requirements and assumptions all reported (~0.9)

**Report every requirement the moment you find it**, not at the end. The operator can start filling
them in while you work, and verify starts sooner.

${existingSection(opts)}

# The branch you onboard

You start on the branch bosun treats as the default, and that is the branch you onboard: verify, every
worktree and every pull request run on it. Stay on it — unless it plainly is not where the project
lives: a bootstrap stub with a README and no code, a branch development moved away from long ago, one
the CI workflows never build. If so, and **one** other branch plainly is the line of development — it
carries the application, CI builds it, recent work lands there (\`git branch -r\`, \`git log -3
origin/<branch>\`) — call \`suggest_base_branch\` with it and what you saw. The tool switches this
checkout to that branch; onboard the tree it leaves you on.

**Never read or onboard another branch without calling it.** A config written for a tree verify never
runs on fails there, and the operator cannot tell why. Do not suggest a branch for being newer or
busier: a default branch that carries the project is the one to onboard, and with two plausible
candidates you onboard the default and record an assumption naming the other.

# Find out

Read the repository — the root and every package in it. \`package.json\` scripts, the lockfiles, the
CI workflows, a Makefile or Justfile, \`CLAUDE.md\`, \`AGENTS.md\`, \`CONTRIBUTING.md\` and READMEs are the
project's own account of how it is built; they outrank your habits. Find:

- **every package and app**, and which of them are servers a person would open in a browser or call
- **the toolchain**: the node version each asks for (\`.nvmrc\`, \`.node-version\`, \`engines.node\`) and the
  package manager (\`packageManager\`, else the lockfile). The config names one exact node and one exact
  package manager for the whole repository; when packages disagree, pick the newest and record it
- **how each installs**
- **how each migrates**, if it has a database
- **how each starts** — the plain dev script — and whether it reads \`PORT\` (or is a Vite/Next dev
  server) and learns other apps' URLs from keys its \`.env.example\` lists with a local URL. That is
  how bosun wires it; an app it cannot wire needs the one extra line described below
- **how each proves itself**: its test command, and the one command that runs typecheck, lint and tests
- **every env key each reads**: \`.env.example\`, config and env schemas, and the code itself. Each key
  that needs a real value from the operator is a requirement of kind \`env\`, with \`path\` set to the
  folder whose \`.env\` it lives in (\`.\` for the root). Set \`optional\` on a key the project starts and
  works without — telemetry, a feature that switches itself off, a value with a default. Verify waits
  for every input that is not optional, so a key marked required that is not blocks the operator
- **how a user signs in**, and which credentials a test account needs. Their key names go in the test
  account line and each is a requirement of kind \`secret\`
- **whether the project migrates a database**. If it does, report a requirement of kind \`policy\` with
  key \`applyMigrations\`: whether this machine may migrate is the operator's decision

# Try what you can

You are in a scratch checkout that nothing else uses. Run the installs, and
nothing else: they confirm the toolchain and the package manager you are about to write.

**Do not run a typecheck, lint, tests, code generation, a migration or any server** — not to confirm a
command, not to check a port. The moment you publish, bosun's verify runs every command in the config
on this machine and reports the one that fails with its output. Running them here first only doubles
the time the operator waits. Read the scripts and write what they say.

- **Only inside this checkout.** Never write anywhere else, never commit, never push.
- **One command at a time, in the foreground.** This machine may be running other work.
- **Ports ${opts.portBase}–${opts.portBase + 9} only**, for anything that listens.
- **Never start a database, a container, a proxy or any stand-in service.** A missing service is a requirement.
- **Never write, print or invent a secret value.** Key names only, everywhere.
- A command that fails for want of a secret or a service is expected: note it and move on.

# Write the config and publish it

The text's exact shape:

${CONFIG_REFERENCE}

Call \`publish_config\` with the whole text. When it is refused, fix every field it names and publish
again, until it is accepted. Do not stop with a config that was never accepted — that fails onboarding.

Before you finish, check that every env key, every test-account secret and the migration policy you
found has been reported as a requirement, and every guess recorded as an assumption.

# When you are done

End with a short summary: the apps you found, the toolchain, what you ran and how it went, and what the
operator still has to provide.`;
}

export const DISCOVERY_NUDGE = [
	'Your turn ended, but publish_config has not succeeded, so there is no config and onboarding will fail.',
	'Write the whole config now from what you already know and call publish_config; fix whatever it refuses and publish again until it is accepted.',
	'Report any requirement and assumption you have not reported yet.'
].join(' ');

export function signInPrompt(opts: { accounts: { role: string; description: string; secrets: string[] }[]; apps: { app: string; url: string }[] }): string {
	const accounts = opts.accounts
		.map((account) => `- **${account.role}** — ${account.description} (credentials in: ${account.secrets.map((name) => `\`${name}\``).join(', ')})`)
		.join('\n');
	const apps = opts.apps.map((entry) => `- \`${entry.app}\` at ${entry.url}`).join('\n');

	return `You are the last step of verifying a project's bosun config. Bosun has already installed the project
and started every app; they are running now. Your only job is to prove each test account can sign in.

The apps:

${apps}

The accounts:

${accounts}

For each account, in turn:

1. Read the credentials from your environment with Bash — \`printenv NAME\` for each variable named
   above. They are real secrets: **never repeat a value in your replies, in a tool's detail, or anywhere
   else.** Use them only to fill in the sign-in form.
2. Open the app a person would sign in to with the browser tools (find them with ToolSearch if they are
   not loaded), find its sign-in screen, fill in the form and submit it.
3. Confirm you reached a page past the sign-in screen — not the form again, not an error.
4. Call \`report_sign_in\` with the role, whether it worked, and one line on what you saw.

Report every account, including the ones that failed. Do not change any code, do not start or stop
anything, and do not try to fix a failure — report it and move on. Nobody is watching and nothing can
be asked. When every account is reported, end your turn.`;
}
