# Plan: Machine onboarding — one command on the box, the rest in the browser

_Bosun plan #008 · depends on 004, 006_

## Overview

Getting a machine to the point where a queue can build something takes about a dozen commands on two
computers today, in an order the browser does not tell you and partly contradicts. You create a
non-root user, because the installer refuses root. You install `gh` and sign in, because a private
clone needs it — though the browser only shows the GitHub card after enrollment. You clone, `cd` into
the checkout, because `install.sh` enrolls whatever `$PWD` is, and a machine enrolled from the wrong
directory has no way back short of deleting it. You install Claude, mint a token on your laptop, paste
it on the box, add MCP servers, install a browser build, come back to the browser, press Refresh, and
describe the project in a form with one setup command, one start command and one credentials path.

That form is the second problem. It cannot describe a repository with a backend and a frontend in it.
It says nothing about how the two find each other on a queue's ports, which is exactly what breaks
when two queues run side by side. It leaves everything else — codegen, readiness, test accounts, the
toolchain — to a session rediscovering it an hour into a bullet, and nothing checks that what was
typed actually runs.

This plan replaces both:

- **One command, anywhere.** The installer runs from any directory, as root or not. As root it creates
  a user for the agent. Either way it finishes by walking the operator, in the same terminal, through
  the only things that must be typed on the box: the Claude token and any MCP credentials.
- **GitHub is an integration, not a CLI on the box.** A leader installs bosun's GitHub App and picks a
  repository; the agent clones it with a token that lasts an hour and reaches that one repository.
- **Onboarding runs in the background.** "Start onboarding" sends a session to read the repository,
  run what it can, and come back with a config, a list of what it still needs, and the assumptions it
  made. The operator fills one form; the agent then proves the config by installing, migrating,
  starting every app and signing in.
- **The config is a file in the repository**, `.bosun/project.yaml`, so it travels with the branch it
  describes. Bosun holds a draft only until that file exists.

**Success in one sentence:** on a fresh VPS, a leader runs one command, pastes one token into that
terminal, and everything after it — the repository, its config, and the proof that the config runs —
happens in the browser, with no Claude or MCP credential ever leaving the machine.

## Acceptance criteria

**Installing**

- [ ] **AC-1** — The install command works from any directory; where it was run has no effect on what the machine works on.
- [ ] **AC-2** — Run as root on Debian or Ubuntu, the installer creates a `bosun` user, enables linger for it, installs git and the system libraries headless Chromium needs, and installs the agent's unit for that user. No agent process ever runs as root.
- [ ] **AC-3** — Run as a non-root user, the installer installs for that user as today, and a system package it could not install is reported by name rather than failing the install.
- [ ] **AC-4** — The installer installs the Claude CLI when it is missing and a checksummed LTS node for the agent's own tooling, and reads nothing from any repository.
- [ ] **AC-5** — With a terminal attached, the installer ends by running `bosun-agent setup`; without one it prints that command and exits 0.

**The setup wizard**

- [ ] **AC-6** — `bosun-agent setup` walks the Claude token and the browser build in order, and skips each step that is already satisfied, so re-running it is always safe.
- [ ] **AC-7** — The browser step launches the installed Chromium headless once, and a missing shared library fails the step with the library's name.
- [ ] **AC-8** — No step of the wizard sends a credential value to the backend.
- [ ] **AC-9** — A change to `~/.bosun/env`, `~/.bosun/mcp.json` or the env store reaches the browser as a fresh preflight within 5 seconds, with no Refresh.

**GitHub**

- [ ] **AC-10** — A leader can connect the bosun GitHub App to a project from the browser.
- [ ] **AC-11** — An installation is recorded only after the backend confirms, with the installing user's own GitHub authorization, that the user can access that installation. A callback carrying an installation id the user cannot access is refused.
- [ ] **AC-12** — The repository picker lists exactly the repositories the project's installations grant.
- [ ] **AC-13** — No GitHub token is stored in the database or on the machine's disk. The agent's tokens are minted on demand, scoped to the single repository it is attached to, with `contents: write` and nothing broader.
- [ ] **AC-14** — The credential route answers only for the repository the calling machine is attached to; a machine with none is refused.
- [ ] **AC-15** — On a machine attached to a repository, a finished plan's pull request is opened or updated by the backend, and the machine needs no `gh`.
- [ ] **AC-16** — A developer gets `403` on every GitHub and repository-management route, and still sees the repository's name wherever a machine is picked.

**Repositories**

- [ ] **AC-17** — Attaching a repository to an online machine clones its default branch into `~/.bosun/repos/<slug>` and turns the `git` preflight green, with no command run on the box.
- [ ] **AC-18** — A machine enrolled under this plan with no repository attached is not offered in the plan or queue pickers, and its page shows the setup checklist instead.
- [ ] **AC-19** — A second machine attached to an onboarded repository needs only its own inputs and a verify — no config work.

**The config**

- [ ] **AC-20** — A session uses `.bosun/project.yaml` from the tree it runs in. The repository's draft is used only when that file does not exist, and the browser says which of the two a machine is on.
- [ ] **AC-21** — A `.bosun/project.yaml` that fails validation stops the session before it starts, naming the field and the reason. It never falls back to the draft.
- [ ] **AC-22** — A worktree's setup steps run in order when it is created, and a failing step fails the queue with the step's name and the tail of its output.
- [ ] **AC-23** — A setup step with `rerunWhen` runs again before the next bullet when any listed file's content changed since it last ran.
- [ ] **AC-24** — The node version and package manager the config names are provisioned by the agent, checksum-verified, and first on `PATH` for setup steps, apps and sessions.
- [ ] **AC-25** — `stack_up` starts the config's apps in dependency order, each on its own port inside the queue's range, with the other apps' URLs substituted into its environment, and returns only once every app answers its readiness check. A failure names the app and returns the tail of its log.
- [ ] **AC-26** — Two queues on one machine can hold a running stack at the same time, and each queue's frontend talks to its own backend.
- [ ] **AC-27** — Every process `stack_up` started is stopped by `stack_down`, and when the session ends, however it ends.
- [ ] **AC-28** — A bullet that leaves `.bosun/project.yaml` invalid fails instead of committing it.
- [ ] **AC-29** — Whether migrations are applied is set per machine in bosun and is not in the file.

**Onboarding**

- [ ] **AC-30** — "Start onboarding" is offered only for an online machine with a repository attached and a green `claude` check, and the run asks the operator nothing while it runs.
- [ ] **AC-31** — A run's progress is visible while it runs and after a reload.
- [ ] **AC-32** — Discovery ends with a valid draft config, a list of required inputs — env keys per path, test-account secrets, the migration policy — and a list of assumptions, each citing the file it was drawn from.
- [ ] **AC-33** — Discovery never pushes, and never writes to the machine's clone outside its scratch worktree.
- [ ] **AC-34** — Once every required input is present for a machine, verify starts without a click.
- [ ] **AC-35** — Verify runs the toolchain, setup, codegen, migrations where the machine allows them, `stack_up`, and a sign-in as every test account, and reports pass or fail per step.
- [ ] **AC-36** — A ready run offers "Open pull request", which opens a pull request adding `.bosun/project.yaml` and nothing else.
- [ ] **AC-37** — An onboarding run is held to the same memory budget and port allocation as a bullet, and cannot collide with a queue running on the same machine.
- [ ] **AC-38** — Onboarding a repository whose default branch already has `.bosun/project.yaml` starts from that file and reports what it would change, rather than starting from nothing.

**Inputs typed in the browser**

- [ ] **AC-39** — Every value typed in the browser — env variables and test-account secrets — is encrypted in the browser to the machine's public key; request bodies, logs and the database hold only ciphertext.
- [ ] **AC-40** — The machine's key fingerprint is shown on its page and printed by `bosun-agent setup`, so the two can be compared.
- [ ] **AC-41** — A machine whose agent has no key refuses browser input with a message to upgrade the agent, rather than accepting a plaintext value.

**Existing machines**

- [ ] **AC-42** — A machine enrolled before this plan, with no repository attached, keeps planning, running queues and opening pull requests exactly as it does today.

## Architecture

### How it works

```
browser   Connect GitHub ───── install the App, ownership confirmed
          Add machine ──────── one command
box       curl … | sh ──────── root phase: user, packages, Chromium libraries
                               user phase: agent, LTS node, claude, unit, enroll
                               bosun-agent setup: Claude token · MCP · browser
browser   Attach repository ── agent clones with an App token
          Start onboarding ─── discover → needs input → verify → ready
          Open pull request ── .bosun/project.yaml lands in the repository
```

Three things move.

**The repository stops being a directory the operator chose and becomes a row bosun knows.** The agent
clones it and owns the clone. This is already nearly true: sessions read `~/.bosun/read-tree`, queues
work in `~/.bosun/worktrees`, and the operator's checkout is never written to
(`agent/src/services/repo.service.md`). What that checkout still supplies — git objects and a copy of
its untracked `.env` — the agent's own clone and the env store supply instead.

**The GitHub credential moves off the box.** The box runs sessions with `Bash` over repository code
and tracker content. It is the place a prompt injection executes, which makes it the worst place for a
long-lived personal token that reaches every repository its owner can. What the box holds instead is
an installation token that expires in an hour, reaches one repository, and is never written to disk.

**What a session used to rediscover is written down once, and proven** before any plan relies on it.

### The installer

`be/assets/install.sh` splits into two phases in one file.

**Root phase** — only when `id -u` is 0:

1. Save the script to a temp file; it arrived on stdin and has to be run again.
2. `apt-get install` git, curl and ca-certificates. Other package managers are not attempted, and the
   installer says what it skipped.
3. Download the LTS node into a temp directory, verify its checksum, and run
   `npx playwright install-deps chromium` — the system libraries headless Chromium links against, which
   a fresh Ubuntu does not have and which only root can install. Today's `browser` preflight looks for
   the build in the cache and cannot see that it will not launch.
4. `useradd --create-home bosun`, unless `BOSUN_USER` names an existing user, then
   `loginctl enable-linger`.
5. Run the saved script again as that user with `runuser`, passing `BOSUN_TOKEN` through the
   environment — never argv, for the reason `installer.service.md` gives.

**User phase** — today's script, without the repository:

- The agent binary, the checksum gate, and `enroll` with no `--repo`.
- The LTS node into `~/.bosun/toolchains/node-<version>`, for the agent's own tooling. The default MCP
  servers are `npx` commands and need a node before any repository exists.
- `curl -fsSL https://claude.ai/install.sh | bash` when `claude` is not on the path.
- `npx playwright install chromium` into the user's cache.
- `~/.bosun/env`, `~/.bosun/mcp.json` and the unit, as today.
- `bosun-agent setup </dev/tty` when `/dev/tty` can be opened. Stdin is the `curl` pipe, so the prompts
  cannot read from it.

**Everything that reads the repository leaves the script** — `.nvmrc`, `.node-version`,
`engines.node`, `packageManager`, the lockfile sniffing. It moves into the agent, driven by the config.
The repository no longer exists when the script runs, and reading only the root is exactly what fails
on a repository like this one, whose packages each carry their own `.nvmrc` and have no root
`package.json`: it gets the current LTS and no pnpm.

### `bosun-agent setup`

A command rather than a daemon step, so it can be run again whenever something is missing. Each step
checks first and skips when satisfied:

| Step | Check | Does |
|---|---|---|
| Claude | `claude auth status`, then one API call | `auth set` as today — echo off, verify, then write |
| MCP | — | lists presets; runs `mcp add` for each one chosen, as today |
| Browser | launch the cached build with `--headless --dump-dom about:blank` | on a missing library, prints it and the `install-deps` command |
| Key | — | prints the machine's key fingerprint |

It ends by printing the machine's page in bosun. The command carries no secret and sends none.

**Preflight follows the files.** The agent watches `~/.bosun`, and when `env`, `mcp.json` or
`project-env.json` changes it re-collects preflight and sends it, debounced by a second. The wizard
writes those files and the browser's checklist ticks as it does. Refresh stays for what it is actually
for — upgrades, and re-reading the repository.

### GitHub App

One App per bosun deployment, registered once, with `contents: write`, `pull_requests: write`,
`metadata: read`, and **"Request user authorization (OAuth) during installation"** switched on.

**Connecting.** The browser sends the leader to
`https://github.com/apps/<slug>/installations/new?state=<signed state>`. GitHub returns them to
`/github/callback` in the web app with `installation_id`, `code` and `state`. The web app posts all
three to the backend, which:

1. verifies that `state` was issued for this user and this project, and has not expired;
2. exchanges `code` for a user token;
3. calls `GET /user/installations` with that token, and refuses unless `installation_id` is in the
   answer;
4. records the installation and discards the user token.

Step 3 is the one that matters. The callback's `installation_id` is a query parameter and anyone can
put any number in it. Without the check, a leader of one project could attach another organization's
installation to their own project and clone its code.

**Tokens.** `github-app.service.ts` signs the App's JWT with node's own `crypto` (RS256, no
dependency) and mints installation tokens with `repositories: [<name>]` and
`permissions: { contents: 'write' }`. A minted token is cached in memory until five minutes before it
expires. Nothing is written to the database except the installation id.

**The credential helper.** `repo.attach` configures the clone with

```
credential.https://github.com.helper = !<agent binary> git-credential
```

in the clone's own `.git/config`, which its worktrees share. git calls the helper on every fetch and
push. The helper reads the machine key from `~/.bosun/config.json`, calls `POST /agent/git-credential`,
and prints `username=x-access-token` and the token into git's pipe. Nothing is cached on disk. The
route takes no repository argument — it answers for the repository the calling machine is attached to,
so there is nothing to ask for that could be somebody else's.

**Pull requests.** On a repository machine, `execution/publish.ts` stops after the push and reports
the branch. `record-publish-frame.ts` then opens the pull request through the App, or updates the body
of the one already open — the same re-run behaviour `gh pr create` gives today. A machine with no
repository keeps publishing through `gh`.

**The private key is the new privilege**, contained the way `SUPABASE_SECRET_KEY` was in plan 006: a
Fly secret, validated by `EnvSchema`, used only inside `github-app.service.ts`, which exposes minting
for one repository, pull-request writes and contents writes, and nothing that lists or touches a
repository outside an installation bosun recorded.

### `.bosun/project.yaml`

The file holds **facts about the code**. They change when the code changes, so they belong in the tree
beside it. It never holds **facts about an environment** — which database, whether it may be
migrated, any secret — because those differ per machine, and some of them are secrets.

```yaml
version: 1

toolchain:
  node: "24.15.0"
  packageManager: "pnpm@11.8.0"

setup:
  - name: install be
    cwd: be
    run: pnpm install --frozen-lockfile
    rerunWhen: [be/pnpm-lock.yaml]
  - name: install fe
    cwd: fe
    run: pnpm install --frozen-lockfile
    rerunWhen: [fe/pnpm-lock.yaml]

apps:
  be:
    cwd: be
    start: pnpm local
    env:
      PORT: "{port}"
    ready: "{url.be}/health"
    migrate: pnpm db:migration:run
  fe:
    cwd: fe
    start: pnpm dev --port {port} --strictPort
    dependsOn: [be]
    env:
      VITE_API_URL: "{url.be}"
    ready: "{url.fe}"

checks:
  - cwd: be
    run: pnpm preflight
  - cwd: fe
    run: pnpm preflight

testAccounts:
  - role: leader
    signIn: "{url.fe}/login"
    secrets: [TEST_LEADER_EMAIL, TEST_LEADER_PASSWORD]

notes: |
  The backend refuses to boot with a Supabase secret key in SUPABASE_PUBLISHABLE_KEY.
```

| Field | Meaning |
|---|---|
| `toolchain` | Provisioned by the agent into `~/.bosun/toolchains` and put first on `PATH`. One node for the whole repository |
| `setup` | Run in order when a worktree is created. The files in `rerunWhen` are hashed after each run, and a changed hash re-runs the step before the next bullet |
| `apps.<name>.start` | Run by `stack_up`, in `cwd` — never by a session directly |
| `{port}`, `{url.<app>}` | An app's port is `portBase` plus its position in `apps`; its URL is `http://127.0.0.1:<port>`. A queue's ten ports hold ten apps at most, and the schema refuses an eleventh |
| `ready` | Polled until it answers with any status below 500, or until `readyTimeoutSeconds` (default 90) passes |
| `migrate`, `codegen` | Rendered into the prompt and run by verify — `migrate` only where the machine's policy allows it |
| `checks` | The feedback loop the prompt used to ask every session to discover for itself |
| `testAccounts[].secrets` | Key names. The values are machine-held session secrets, put into the session's environment and never written to a file |

**Resolution is by presence, not precedence.** A session reads `.bosun/project.yaml` from the tree it
runs in: the read tree for planning, the queue's worktree for a bullet, the scratch worktree for
onboarding. When the file is absent, the repository's draft arrives in the start frame. When the file
is present and invalid, the session does not start. There is no merging of the two and no fallback
from a broken file to a working draft, because that fallback is a config that silently changes under a
branch nobody touched.

That is also what makes a file worth having. A plan that renames a start script changes the file in
the same branch, and that branch's own verify bullet starts the app the new way. The execution prompt
tells a session to keep the file current when it changes how the project installs or starts, and the
commit gate validates the file before committing a bullet that touched it.

**Session secrets.** `project-env.json` gains a second section beside its sets: values keyed by name,
put into a session's environment rather than written into a `.env`. The env service's rules apply
unchanged — summaries carry names only, and a value reaches no log line and no prompt.

**Machine policy.** `machines.policy` holds `{ applyMigrations }`, edited on the machine's page. Every
other field of today's project profile is replaced by the file.

### `stack_up` and `stack_down`

Two tools on the session's MCP server, implemented in the agent by `stack.service.ts`:

- `stack_up({ apps? })` — resolve `dependsOn`, start each app in its own process group with the
  toolchain on `PATH` and its env templated, write its output to `~/.bosun/logs/<run>/<app>.log`, poll
  `ready`, and return `{ app, url, log }[]`. On failure, stop what it started and return the app, the
  reason and the log's tail.
- `stack_down()` — stop every process group it started.

The agent starts the processes so that starting the stack means the same thing everywhere — in a
verify bullet, in onboarding's verify, on a second machine. The session still decides *when*, which is
what the memory rules in `prompts/shared.ts` depend on: the stack is up for the browser pass and down
before the checks run. A session's end reaps its stack whatever the session did.

### Onboarding

A run belongs to a repository and a machine. **Discovery** happens once per repository; **verify**
happens once per machine. A verify run on a second machine takes its requirements from the
repository's latest discovery.

```
discovering ──► needs_input ──► verifying ──► ready
     │                              │
     └──────────► failed ◄──────────┘
```

**Discovery** is a Claude session in a scratch worktree of the default branch, with the execution tool
set — it needs `Bash` to install and try things — a port range from the queue allocator, and admission
through the memory budget. It asks nothing. Its prompt has it find every package and app, the
toolchain each asks for, how each installs, generates, migrates, starts and proves itself, which env
keys each reads (from `.env.example`, config schemas and the code), and how a user signs in; run what
it can without secrets; and report through four tools:

| Tool | Does |
|---|---|
| `report_step` | `{ label, status, detail }` — one progress line in the browser |
| `publish_config` | `{ yaml }` — validated by the backend; a validation error goes back to the session to fix |
| `report_requirement` | `{ kind: 'env' \| 'secret' \| 'policy', path?, key, why, evidence }` |
| `record_assumption` | `{ text, evidence }` |

A session that ends without a valid published config fails the run.

**Needs input.** The browser shows the draft, the assumptions, and one form built from the
requirements: env keys grouped by path, test-account secrets, the migration toggle. Saving goes through
the existing env-set path. The backend decides "satisfied" from what it already holds — the machine's
env-set summaries and session-secret names against the required keys — and starts verify itself when
the last one lands.

**Verify** is not a judgement a session makes. The agent runs it: toolchain, setup steps, codegen,
migrations if the machine allows them, `stack_up`, then one short Claude turn with Playwright that
signs in as each test account and confirms it got past the sign-in page. Each step is a line with pass
or fail, and a failure carries the step and its output's tail. Only the sign-in needs a model, so only
the sign-in uses one.

**Ready** offers "Open pull request". The backend creates `bosun/onboarding` from the default branch,
writes `.bosun/project.yaml` through the contents API, and opens the pull request. It does not open one
unasked: bosun writes nothing into somebody's repository without a person choosing it, the rule
`mcp add` keeps with its `y`.

Onboarding a repository whose default branch already has the file starts discovery from that file and
publishes its result as a proposed change to it.

### Encrypting what the browser sends

The agent generates an RSA-3072 key pair the first time it runs without one, at
`~/.bosun/inputs.key` (mode `0600`), and sends the public key in `hello`. For every save, the browser
generates an AES-256-GCM key, encrypts the values with it, wraps it with RSA-OAEP-SHA256, and sends
`{ v: 1, wrappedKey, iv, ciphertext }` in place of the values. WebCrypto and node both do all of it
natively.

The backend validates what it can still see — the path, the key names, the envelope's size — and
relays the envelope. The agent decrypts it and applies the value rules the backend used to apply
(single line, length), which it already repeats today.

The fingerprint is `sha256` of the public key's SPKI, shown on the machine's page and printed by
`bosun-agent setup`. A backend that swapped the key in `hello` would show a fingerprint the terminal
does not.

What this protects against: request logging, the database, log drains, error trackers, and anyone who
can read the backend's traffic or memory without being able to change what it serves. What it does
not protect against: a compromised backend or frontend serving JavaScript that reads the form before
it is encrypted. That limit is why the Claude token and MCP credentials stay in the terminal — they are
account credentials, and this is a mitigation rather than a boundary.

### Schema changes

```
github_installations              (new)
    id                 text pk               ghi_<nanoid12>
    project_id         text not null → projects.id on delete cascade
    installation_id    bigint not null
    account_login      text not null
    created_by_user_id text null     → users.id on delete set null
    created_at         timestamptz not null default now()
    unique (project_id, installation_id)

repositories                      (new)
    id                 text pk               repo_<nanoid12>
    project_id         text not null → projects.id on delete cascade
    installation_id    text not null → github_installations.id on delete cascade
    github_repo_id     bigint not null
    full_name          text not null
    default_branch     text not null
    config_draft       text null             yaml, validated on write
    config_on_default  boolean not null default false     reported by the agent
    created_at         timestamptz not null default now()
    unique (project_id, github_repo_id)

onboarding_runs                   (new)
    id                 text pk               onb_<nanoid12>
    repository_id      text not null → repositories.id on delete cascade
    machine_id         text not null → machines.id on delete cascade
    phase              text not null         'discover' | 'verify'
    status             text not null         'discovering' | 'needs_input' | 'verifying' | 'ready' | 'failed'
    port_base          integer null
    steps              jsonb not null default '[]'
    requirements       jsonb not null default '[]'
    assumptions        jsonb not null default '[]'
    failure_reason     text null
    started_at         timestamptz not null default now()
    finished_at        timestamptz null
    index on (repository_id), index on (machine_id)

machines
  + repository_id      text null → repositories.id on delete set null
  + public_key         text null
  + policy             jsonb not null default '{"applyMigrations": true}'
    project_profile    kept; read only for machines with no repository
```

### API contract

```ts
// browser, leader
GET    /github/install-url                                      -> { url }
POST   /github/installations   { installationId, code, state }  -> { installation }
GET    /github/repositories                                     -> { githubRepoId, fullName }[]
POST   /repositories           { githubRepoId }                 -> { repository }
PUT    /repositories/:id/config-draft   { yaml }                -> { repository } | 400 with issues
POST   /repositories/:id/pull-request                           -> { prUrl }
POST   /machines/:id/repository         { repositoryId }        -> 202
PUT    /machines/:id/policy             { applyMigrations }     -> { machine }
POST   /machines/:id/onboarding         { phase }               -> { run }
GET    /machines/:id/onboarding                                 -> { run } | 404
PUT    /machines/:id/session-secrets    { vars }                -> { machine }

// browser, member
GET    /repositories                                            -> Repository[]

// agent, machine key
POST   /agent/git-credential                                    -> { token, expiresAt }
POST   /agent/onboarding/:runId/steps          { label, status, detail }
POST   /agent/onboarding/:runId/config         { yaml }         -> { ok } | { issues }
POST   /agent/onboarding/:runId/requirements   { kind, path?, key, why, evidence }
POST   /agent/onboarding/:runId/assumptions    { text, evidence }
```

`PUT /machines/:id/env-sets` keeps its route and its shape, except that each value becomes an envelope.
So do the session-secret values.

### Wire protocol

```ts
// BE -> agent
{ type: 'repo.attach',       repositoryId, cloneUrl, defaultBranch, slug }
{ type: 'onboarding.start',  runId, phase, portBase, configDraft }
{ type: 'onboarding.cancel', runId }
// exec.start: `profile` is replaced by `configDraft` (null when the repository has none) and `policy`
// queue.worktree.ensure: `setupCommand` is dropped for repository machines — the steps come from the config

// agent -> BE
{ type: 'repo.attached',        repositoryId, repoPath, configOnDefault }
{ type: 'repo.error',           repositoryId, message }
{ type: 'onboarding.done',      runId }
{ type: 'onboarding.error',     runId, message }
{ type: 'queue.worktree.error', queueId, message }     // now also sent when a setup step fails
// hello: + publicKey, + repositoryId
```

### Screen layout

- **Machine page** leads with a setup checklist — agent connected, Claude, browser, repository, config,
  inputs, verified. Each row shows its state and the one action that fixes it: a button where the
  browser can do it, a copyable command where only the box can. The preflight list moves below it.
- **Machines list** shows `setup 5/7` beside a machine that is not finished.
- **Repositories** (leader only) — connected installations and repositories, and for each repository:
  where its config comes from, the draft editor, the latest discovery, and verify status per machine.
- **Onboarding report** — progress lines while it runs; then the assumptions, the inputs form, and
  verify's steps.
- The plan and queue pickers label machines `machine · repository`.

### New modules

- `be/src/services/github/github-app.service.ts` — JWT, installation tokens, repository list, pull
  requests, contents
- `be/src/types/ProjectConfigSchema.ts` and `agent/src/project-config.ts` — one schema, mirrored the way
  `ProjectProfileSchema` is today
- `be/src/controllers/github/`, `be/src/controllers/repositories/`, `be/src/controllers/onboarding/`
- `agent/src/commands/setup.ts`, `agent/src/commands/git-credential.ts`
- `agent/src/services/toolchain.service.ts` — the node and package-manager provisioning `install.sh`
  does today, ported and driven by the config
- `agent/src/services/stack.service.ts`, `agent/src/services/inputs-key.service.ts`
- `agent/src/onboarding/session.ts`, `agent/src/prompts/onboarding.ts`
- `fe/app/widgets/setup-checklist/`, `fe/app/views/repositories/`, `fe/app/features/connect-github/`,
  `fe/app/features/attach-repository/`, `fe/app/features/start-onboarding/`,
  `fe/app/features/provide-inputs/`, `fe/app/shared/lib/seal.ts`

## Key decisions

- **The GitHub credential lives in bosun, not on the box.** This reverses the README's "holds no GitHub
  credential of its own", deliberately. The box is where untrusted content executes with `Bash`, and
  the `gh` token it holds today reaches every repository its owner can. The App key in bosun is worth
  more, but it sits somewhere that runs no untrusted code, and what reaches the box is one repository
  for one hour
- **An installation is proven by the installer's own authorization**, never by the callback's
  `installation_id`, which is a number anyone can type
- **Account credentials in the terminal, project inputs in the browser — encrypted.** A Claude token or
  an MCP credential reaches an account; an env value reaches one project's development services.
  Different blast radius, different path. The wizard is what keeps the terminal path to one command
- **Onboarding reports; it does not grill.** Nothing in discovery depends on an answer mid-way: what
  it cannot find, it lists as a requirement; what it has to guess, it records as an assumption. One form
  at the end costs the operator one visit instead of a vigil
- **Verify is run by the agent, not judged by a session.** "Ready" means the steps ran through the same
  `stack_up` a bullet will use — not that a session believed they would work
- **Code facts in the repository, environment facts in bosun.** The file follows the branch, so a plan
  that changes how the app starts carries its own config. The draft exists only until the file does;
  the two are never merged
- **A broken file stops the session.** Falling back to the draft would run a branch against a config
  the branch no longer matches, and fail somewhere far less legible
- **The agent starts the stack; the session chooses when.** Deterministic ports and wiring, without
  taking away the memory discipline the prompt already relies on
- **Ports by position.** An app's port is its index in `apps`, so no allocator and no second place to
  look — at the cost of ten apps per repository
- **The pull request is a button.** Bosun does not write into somebody's repository unasked
- **One repository per machine.** The complaint was where the installer has to run, and a clone the
  agent owns answers it. Several repositories per box changes the worktree, read-tree and env-store
  layouts for nobody who has asked
- **The installer creates a user instead of refusing root.** The invariant was never "refuse root"; it
  was "the agent never runs as root", and a fresh VPS usually offers nothing else
- **YAML, with the `yaml` package.** The file is written and reviewed by people, and it needs comments.
  The package is plain JavaScript and compiles into the bun binary like `commander` and `ws`

## Non-goals

- GitLab, Bitbucket, or any host but GitHub. A machine with no repository attached keeps working with
  whatever credential its operator set up, as today
- More than one repository on a machine. `machines.repository_id` is a column, not a join table
- A node version per app
- Services an app needs — Postgres, Redis — started by bosun. They arrive through env, as today
- GitHub webhooks: marking a plan landed when its pull request merges, re-verifying when the config
  changes on the default branch. The App is registered with webhooks off; they are the next plan
- Pasting a Claude or MCP credential into the browser, encrypted or not
- Removing the no-repository path. Named so it does not become permanent: it goes once every machine
  has been re-added
- Distributions without `apt`, in the root phase

## Blockers & dependencies

- A GitHub App registered for each deployment with the permissions above, user authorization during
  installation switched on, and its setup URL at `PUBLIC_APP_URL/github/callback`
- `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` and
  `GITHUB_APP_PRIVATE_KEY` in `EnvSchema` and set as Fly secrets. `scripts/deploy.sh` refuses the
  deploy until they exist, which is intended
- An agent release carrying `setup`, `git-credential`, the toolchain and stack services, and the key.
  The backend refuses `repo.attach` to an older agent with a message to upgrade, rather than sending a
  frame it will ignore
- `yaml` as a dependency of the agent and the backend

## Slices

### Phase 1 — Setup that fails loudly

On today's machines, before anything else moves. A failed setup command fails the queue instead of
reporting it ready (`agent/src/connection/router.ts:258` logs the failure and sends
`queue.worktree.ready` regardless). Tracked lockfiles are hashed, and a changed one re-runs the setup
command before the next bullet — today a worktree keeps the `node_modules` it was created with for
every plan that follows. Preflight follows `~/.bosun`. Small, and every piece of it is a bug today.

### Phase 2 — GitHub App and repositories

Installations with the ownership check, the repository table and picker, `repo.attach`, the credential
helper, pull requests from the backend, repository-aware pickers.

### Phase 3 — One command

The root phase and the `bosun` user, the repository-free user phase, `bosun-agent setup`, the real
browser launch, the setup checklist. After this phase a fresh VPS reaches "repository attached" with
one command and one paste.

### Phase 4 — The config

The schema, file-then-draft resolution and the invalid-file stop, the toolchain service, setup steps
with `rerunWhen` — replacing phase 1's lockfile heuristic on repository machines — `stack_up` and
`stack_down`, prompts rendered from the config, session secrets, machine policy, and the commit gate on
the file. A hand-written draft is enough to exercise all of it.

### Phase 5 — Onboarding

Runs, the discovery session and its tools, the report, the inputs form and the satisfaction check,
agent-run verify with the sign-in turn, "Open pull request", verify per machine.

### Phase 6 — Encrypted inputs

The key pair and `hello`, envelopes in the browser for env sets and session secrets, decryption and
the value rules on the agent, the refusal for keyless agents, the fingerprint.

## Risks

- **The App key widens a backend compromise.** It can mint `contents: write` for every repository of
  every installation bosun holds. Contained, as `SUPABASE_SECRET_KEY` is, by module boundary, env
  validation and per-repository minting — not eliminated
- **git now depends on the backend.** The credential helper asks bosun on every fetch and push, so a
  backend outage stops a running queue at its next push, where today it only stops coordination.
  Tokens are cached for most of their hour, which covers a deploy but not a long outage
- **A session can call the credential helper.** It has `Bash`, and the helper is on its `PATH`. What it
  gets is an hour of `contents: write` on the repository it is already working in — narrower than the
  `gh` token on today's machines, and not nothing
- **Discovery will be wrong about things.** Verify catches whatever does not run. What runs but is
  wrong — a start script that is not the one the team actually uses — is only as visible as the
  assumptions list makes it
- **Onboarding costs.** A discovery session is Claude usage, tens of minutes, and memory on a box that
  may be running queues. The memory budget admits it; nothing makes it cheap
- **Two paths for a while.** Machines with no repository keep `gh`, `projectProfile` and the
  operator's checkout, and every change to publishing or setup has to hold on both until that path is
  removed
- **Encryption stops at the page.** A compromised frontend reads the form before it is encrypted
- **The config is only as fresh as its last verify.** A merged change that breaks it is found by the
  next bullet that starts the stack, until webhooks re-verify on merge

## Verification

- A fresh Ubuntu 24.04 VPS with only root: one command from `/root`, one token pasted into the same
  terminal. The machine comes online, `claude` and `browser` go green, and nobody presses Refresh
- Connect GitHub on an organization and attach this repository — three packages, no root
  `package.json`, an `.nvmrc` in each. Onboarding publishes a config with `be` and `fe` as apps, node
  24.15.0 and pnpm 11.8.0. The inputs form asks for `DATABASE_URL`, `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY` under `be`, and for a test account; filling it starts verify, verify signs
  in, and the pull request adds exactly one file
- Two queues on one machine run verify bullets at the same time, and each frontend's API requests go to
  its own queue's backend port
- A plan adds a frontend dependency; the next bullet's log shows `install fe` running again
- A setup step that exits non-zero leaves the queue failed, naming the step
- `POST /github/installations` with another organization's installation id is refused
- A machine with no repository calls `POST /agent/git-credential` and is refused; a token minted for a
  machine attached to repository A cannot push to repository B
- After saving an env set, the backend's request log, the database and the Fly logs contain no value
- A second VPS attached to the same repository reaches ready with its own inputs and a verify, and no
  config step
- A machine enrolled before this plan still plans, runs a queue and opens a pull request through `gh`
