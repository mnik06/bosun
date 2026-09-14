const CONFIG_REFERENCE = `\`\`\`yaml
version: 1

toolchain:                      # one node for the whole repository, exact versions only
  node: "24.15.0"               # from .nvmrc / .node-version / engines.node
  packageManager: "pnpm@11.8.0" # npm|pnpm|yarn @ exact version, from packageManager or the lockfile

setup:                          # run in order when a worktree is created; names are unique
  - name: install be
    cwd: be                     # relative to the repository root, optional
    run: pnpm install --frozen-lockfile
    rerunWhen: [be/pnpm-lock.yaml]   # re-run before a bullet when any of these files changed
  - name: install fe
    cwd: fe
    run: pnpm install --frozen-lockfile
    rerunWhen: [fe/pnpm-lock.yaml]

apps:                           # at most 10; an app's port is portBase + its position here
  be:                           # names: lowercase letters, digits, dashes
    cwd: be
    start: pnpm local           # started by bosun, never by a session
    env:                        # templated: {port} is this app's port, {url.<app>} another app's URL
      PORT: "{port}"
    ready: "{url.be}/health"    # polled until it answers below 500; readyTimeoutSeconds defaults to 90
    migrate: pnpm db:migration:run
    codegen: pnpm generate      # optional
  fe:
    cwd: fe
    start: pnpm dev --port {port} --strictPort
    dependsOn: [be]
    env:
      VITE_API_URL: "{url.be}"
    ready: "{url.fe}"

checks:                         # the feedback loop every session runs
  - cwd: be
    run: pnpm preflight
  - cwd: fe
    run: pnpm preflight

testAccounts:
  - role: leader
    signIn: "{url.fe}/login"    # must name an app: {url.fe}, never a bare {url}
    secrets: [TEST_LEADER_EMAIL, TEST_LEADER_PASSWORD]   # key names only, never values

notes: |
  Anything a session could not work out by reading the code.
\`\`\`

No other keys exist, and unknown keys are refused. Environment facts — which database, whether it
may be migrated, any value of any secret — never go in this file.`;

function existingSection(opts: { existingConfig: string | null; configPath: string }): string {
	if (opts.existingConfig === null) {
		return `The repository has no \`${opts.configPath}\` yet. You are writing the first one.`;
	}

	return `The default branch already carries \`${opts.configPath}\`. **Start from it, not from nothing.**
Check every field against the code. Publish the config as it should be, and for every change you make
record an assumption that says what you would change and why, citing the file. A field you leave
alone because it is right needs no entry.

\`\`\`yaml
${opts.existingConfig}
\`\`\``;
}

export function discoveryPrompt(opts: {
	portBase: number;
	existingConfig: string | null;
	configPath: string;
}): string {
	return `You are onboarding a repository onto bosun. Bosun runs coding sessions on this machine, and before
any of them can build, test or start this project it needs \`${opts.configPath}\`: a file that says how
this repository is installed, generated, migrated, started and proven. Your job is to write it.

# Nobody is watching, and nothing can be asked

There is no person on the other end of this session and no tool to ask anyone anything. Everything
you cannot find out, you list: an input only the operator can give goes in \`report_requirement\`, and
anything you had to guess goes in \`record_assumption\`, citing the file you drew it from. The operator
reads those, fills one form, and bosun then proves your config by running it. A wrong guess is caught;
a silent one is not.

Use \`report_step\` for a line of progress whenever you move on to something new — what you are
reading, what you are running and how it went.

${existingSection(opts)}

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
  are the \`env\` entries that must be wired with \`{port}\` and \`{url.<app>}\`
- **how each proves itself**: the typecheck, lint and test commands, or the one command that runs them
- **every env key each reads**: \`.env.example\`, config and env schemas, and the code itself. Each key
  that needs a real value from the operator is a requirement of kind \`env\`, with \`path\` set to the
  folder whose \`.env\` it lives in (\`.\` for the root)
- **how a user signs in**, and which credentials a test account needs. Their key names go in
  \`testAccounts[].secrets\` and each is a requirement of kind \`secret\`
- **whether the project migrates a database**. If it does, report a requirement of kind \`policy\` with
  key \`applyMigrations\`: whether this machine may migrate is the operator's decision

# Try what you can

You are in a scratch checkout of the default branch that nothing else uses. Run what needs no secret —
installs, code generation that needs no service, a typecheck — to confirm the commands you are about
to write actually work here.

- **Only inside this checkout.** Never write anywhere else, never commit, never push.
- **One command at a time, in the foreground.** This machine may be running other work.
- **Ports ${opts.portBase}–${opts.portBase + 9} only**, for anything that listens.
- **Never start a database, a container, a proxy or any stand-in service.** A missing service is a requirement.
- **Never write, print or invent a secret value.** Key names only, everywhere.
- A command that fails for want of a secret or a service is expected: note it and move on.

# Write the config and publish it

The file's exact shape:

${CONFIG_REFERENCE}

Call \`publish_config\` with the whole file. When it is refused, fix every field it names and publish
again, until it is accepted. Do not stop with a config that was never accepted — that fails onboarding.

Before you finish, make sure every env key, every test-account secret and the migration policy you
found is reported as a requirement, and every guess is recorded as an assumption.

# When you are done

End with a short summary: the apps you found, the toolchain, what you ran and how it went, and what the
operator still has to provide.`;
}

export const DISCOVERY_NUDGE = [
	'Your turn ended, but publish_config has not succeeded, so there is no config and onboarding will fail.',
	'Write the whole .bosun/project.yaml now from what you already know and call publish_config; fix whatever it refuses and publish again until it is accepted.',
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
