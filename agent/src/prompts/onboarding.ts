const CONFIG_REFERENCE = `\`\`\`
Toolchain:
- Node: 24.15.0
- Package manager: pnpm@11.8.0

Install:
/be: pnpm install --frozen-lockfile (rerun when: be/pnpm-lock.yaml)
/fe: pnpm install --frozen-lockfile (rerun when: fe/pnpm-lock.yaml)

Apps:
be:
- Cwd: be
- Start: pnpm local
- Env PORT: {port}
- Ready: {url.be}/health
- Migrate: pnpm db:migration:run
- Codegen: pnpm generate
fe:
- Cwd: fe
- Start: pnpm dev --port {port} --strictPort --host 127.0.0.1
- Depends on: be
- Env VITE_API_URL: {url.be}
- Ready: {url.fe}/@vite/client

Feedback loops:
/be: pnpm preflight
/fe: pnpm preflight

Regenerate:
/be:
- Migrations (when be/drizzle-out/** changes): pnpm db:migration:generate
- Lockfile be (when be/pnpm-lock.yaml changes): pnpm install --lockfile-only
/fe:
- Lockfile fe (when fe/pnpm-lock.yaml changes): pnpm install --lockfile-only

Reset database:
- Cwd: be
- Run: pnpm db:reset

Test accounts:
- leader: sign in at {url.fe}/login using TEST_LEADER_EMAIL, TEST_LEADER_PASSWORD

Notes:
Anything a session could not work out by reading the code.
\`\`\`

Every section is optional and appears at most once, in any order. No other sections exist, and an
unrecognized line is refused. **This text has no comment syntax** — nothing published may carry a
trailing annotation of the kind used below to explain it, only what the grammar itself defines:

- \`Toolchain:\` names one node for the whole repository and one package manager, both exact versions —
  read \`.nvmrc\`/\`.node-version\`/\`engines.node\` and \`packageManager\` or the lockfile.
- \`Install:\` and \`Feedback loops:\` run in the order written. \`/dir: command\` is a complete entry for
  that directory; \`/dir:\` alone opens a block whose \`- Label: command\` lines all take that directory,
  and each then needs a label — a directory with only one command may skip the label and write
  \`/dir: command\` directly. An \`Install:\` entry may add \`(rerun when: <path>[, <path>...])\` after its
  command. Every label in a section — including a lone one — is unique across the *whole document*,
  not just within its own directory: \`Lockfile be\`/\`Lockfile fe\` above, never \`Lockfile\` twice.
- \`Apps:\` holds at most 10 named blocks (lowercase letters, digits, dashes); an app's port is
  \`portBase\` plus its position here, started by bosun and never by a session. \`{port}\` and
  \`{url.<app>}\` are templated — \`{url.*}\` is always \`http://127.0.0.1:<port>\`, so a server must listen
  on \`127.0.0.1\` (Vite: \`--host 127.0.0.1\`). \`Ready:\` is polled until it answers below 500;
  \`Ready timeout:\` (seconds) defaults to 90. \`Codegen:\` is optional.
- \`Regenerate:\` follows the same directory-scope shape as \`Install:\`, but every entry is always
  \`- Label (when <glob>[, <glob>...] changes): command\`, globs from the repository root (\`**\` crosses
  directories).
- \`Reset database:\` is optional, at most one, and runs before every verify drive on a machine that
  allows migrations.
- \`Test accounts:\` secrets are key names only, never values, and \`sign in at\` must name an app
  (\`{url.fe}\`), never a bare \`{url}\`.
- \`Notes:\` is free text to the end of the document — anything a session could not work out by reading
  the code. Environment facts — which database, whether it may be migrated, any value of any secret —
  never go anywhere in this text.`;

function existingSection(opts: { existingConfig: string | null }): string {
	if (opts.existingConfig === null) {
		return 'The repository has no config yet. You are writing the first one.';
	}

	return `Bosun already holds a config for this repository. **Start from it, not from nothing.**
Check every field against the code. Publish the config as it should be, and for every change you make
record an assumption that says what you would change and why, citing the file. A field you leave
alone because it is right needs no entry.

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
- **how each installs**, and which lockfile's change means installing again
- **how each generates code** (clients, types from a schema) and **how each migrates**, if it has a database
- **how each starts**, on which port, and how it learns the URL of another app it talks to — these
  are the \`env\` entries that must be wired with \`{port}\` and \`{url.<app>}\`. Every \`{url.<app>}\` is
  \`http://127.0.0.1:<port>\`, so each server must listen on 127.0.0.1: a server bound to \`localhost\`
  can end up on IPv6 alone and never answer (Vite: \`--host 127.0.0.1\`). Point \`ready\` at something
  that answers without rendering the app — a health route, or \`/@vite/client\` for a Vite dev server —
  because the first page of a dev server compiles everything and can take minutes on a small machine
- **how each proves itself**: the typecheck, lint and test commands, or the one command that runs them
- **every env key each reads**: \`.env.example\`, config and env schemas, and the code itself. Each key
  that needs a real value from the operator is a requirement of kind \`env\`, with \`path\` set to the
  folder whose \`.env\` it lives in (\`.\` for the root). Set \`optional\` on a key the project starts and
  works without — telemetry, a feature that switches itself off, a value with a default. Verify waits
  for every input that is not optional, so a key marked required that is not blocks the operator
- **how a user signs in**, and which credentials a test account needs. Their key names go in
  \`testAccounts[].secrets\` and each is a requirement of kind \`secret\`
- **whether the project migrates a database**. If it does, report a requirement of kind \`policy\` with
  key \`applyMigrations\`: whether this machine may migrate is the operator's decision
- **which files are generated rather than written** — migrations a generator numbers, lockfiles, a
  generated client that is committed. Each becomes a \`regenerate\` rule with the paths it owns and the
  command that produces them. Two plans built side by side both generate migration \`0013\`; the rule is
  how bosun renumbers them when they land. A repository whose migrations are hand-written and numbered
  by a person gets no migrations rule — record that as an assumption
- **how the development database is reset** to an empty, migrated state — a reset, a drop-and-create, a
  truncate script. It becomes \`verify.resetDatabase\`; leave it out when the project has none rather than
  inventing one

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

export function signInPrompt(opts: { accounts: { role: string; url: string; secrets: string[] }[] }): string {
	const accounts = opts.accounts
		.map((account) => `- **${account.role}** — open ${account.url}, credentials in: ${account.secrets.map((name) => `\`${name}\``).join(', ')}`)
		.join('\n');

	return `You are the last step of verifying a project's bosun config. Bosun has already installed the project
and started every app; they are running now. Your only job is to prove each test account can sign in.

${accounts}

For each account, in turn:

1. Read the credentials from your environment with Bash — \`printenv NAME\` for each variable named
   above. They are real secrets: **never repeat a value in your replies, in a tool's detail, or anywhere
   else.** Use them only to fill in the sign-in form.
2. Open the URL with the browser tools (find them with ToolSearch if they are not loaded), fill in the
   sign-in form and submit it.
3. Confirm you reached a page past the sign-in screen — not the form again, not an error.
4. Call \`report_sign_in\` with the role, whether it worked, and one line on what you saw.

Report every account, including the ones that failed. Do not change any code, do not start or stop
anything, and do not try to fix a failure — report it and move on. Nobody is watching and nothing can
be asked. When every account is reported, end your turn.`;
}
