# bosun

Bosun is a web app for driving AI coding agents that run on your own hardware. You register a
machine in the browser, enroll a small daemon on that box with a one-time code, and from then on the
machine holds an outbound WebSocket back to the server — so bosun can dispatch work to it and stream
results back live without the box ever needing an inbound port, a public IP, or an SSH key. The web
app is where you see which machines are online, what state each one is in, and what its agents are
doing.

**Planning** is the first thing you can actually do with a machine. Paste a ticket, pick an online
box, and a `claude` session runs in that machine's checkout and grills you — option cards in the
browser, one decision at a time — until it publishes a plan, its acceptance criteria and its tracer
bullets as rows in bosun, all editable afterwards. See `plans/005-planning.md` and
`agent/src/planning/README.md`.

The session lives on the machine, not in the connection: closing the tab, losing the network or
deploying the backend does not end it, and a question can sit unanswered for as long as you like. It
ends when you confirm the plan, or after 24 hours, whichever comes first.

Accounts are email and password, with **Supabase Auth** as the identity provider. Bosun never sees a
password and never mints a session: the browser authenticates against Supabase and presents the
resulting access token to `be/`, which hands it back to Supabase to resolve into a user on every
request. See `plans/002-identity-via-supabase-auth.md` and `be/src/services/auth/supabase-auth.service.md`.

## The three pieces

| Package  | What it is                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| `fe/`    | Browser UI. React Router v7 (SPA), Mantine, Tailwind, TanStack Query. Talks to `be/` over REST + WebSocket. |
| `be/`    | API and WebSocket hub. Fastify 5, Drizzle ORM over Postgres, Zod at the HTTP boundary. Owns all state. |
| `agent/` | The daemon that runs on the remote machine and dials back to `be/`. TypeScript CLI (`commander`), built with `tsc`, run by hand. |

## Running locally

Requires Node >= 24.15 (`.nvmrc` pins 24.15.0) and pnpm 11.8.

### Backend — http://127.0.0.1:1506

```bash
cd be
cp .env.example .env   # set DATABASE_URL to your Postgres; defaults to a local bosun db
pnpm install
pnpm db:migration:run
pnpm local
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` come from the Supabase project (Settings -> API Keys).
Both are public values; the **secret** key must never appear here, and the server refuses to boot if
it does. Email/password sign-in must be enabled on the project, with email confirmation off — the app
signs you in the moment you sign up.

Check it:

```bash
curl http://127.0.0.1:1506/health      # -> {"status":"ok"}
open http://127.0.0.1:1506/api/documentation   # Swagger UI (local + staging only)
```

### Frontend — http://127.0.0.1:5373

```bash
cd fe
cp .env.example .env   # VITE_API_URL=http://127.0.0.1:1506 — keep 127.0.0.1, not localhost
pnpm install
pnpm dev
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are the same project URL and publishable key
the backend uses. Both are public values and are meant to ship in the browser bundle.

Then open http://127.0.0.1:5373.

### Agent

```bash
cd agent
pnpm install
pnpm build
node dist/src/index.js enroll --server http://127.0.0.1:1506 --token <code from the browser>
```

`run` holds the outbound WebSocket, re-sending `hello` and `preflight` on every connect and
reconnecting with jittered backoff.

**Deleting the machine in the browser removes bosun from the box.** The agent disables and deletes
its systemd unit, erases `~/.bosun` entirely — machine key, Claude credential, every MCP server's
token — and removes its own binary before exiting. Nothing of bosun's is left behind, because a
de-provisioned host holding live credentials is the thing worth avoiding. `~/.claude` and the repo
are not touched: bosun did not install them. See `agent/src/connection/README.md` for the two
termination paths and what is deliberately spared.

Agents installed before this carry `Restart=always` and need `install.sh` re-run before they can be
deleted cleanly.

`enroll` writes `~/.bosun/config.json` at mode `0600` — server URL, machine id, machine key and the
web app's origin. It enrolls no repository: one is attached from the browser, and the agent clones it
into a directory of its own. `--config` overrides the path.

### Installing on a machine

**Add machine** in the browser prints one command. Run it on the box, from any directory:

```bash
curl -fsSL <server>/install.sh | BOSUN_TOKEN=<code> sh
```

- **As root** — the usual state of a fresh VPS — it installs git, curl and the system libraries
  headless Chromium needs, creates a `bosun` user (or uses the one `BOSUN_USER` names), enables
  linger for it, and installs everything else as that user. No agent process ever runs as root.
- **As any other user** it installs for that user. When that user may use `sudo`, it installs the
  libraries Chromium needs through it, asking for a password only if sudo needs one. Anything it still
  cannot install without root is named rather than failing the install.

Either way it installs the agent, a checksummed LTS node for the agent's own tooling under
`~/.bosun/toolchains`, Claude Code when it is missing, a Chromium build and the systemd unit — and
reads nothing from any repository. It ends by running the setup wizard in the same terminal; with no
terminal attached it prints the command and exits 0.

### `bosun-agent setup`

The only things that have to be typed on the box, in order:

| Step | Skipped when | Otherwise |
| ---- | ------------ | --------- |
| Claude | `claude auth status` has a credential and one API call accepts it | the `auth set` flow below |
| MCP servers | every preset bosun offers is configured | offers each preset; `mcp add` for each one you accept |
| Browser | the installed Chromium launches headless | offers to install the build; names a missing system library and the root command that installs it |
| Machine key | — | prints the machine's key fingerprint |

Every step checks before it acts, so running it again is always safe — it is the answer whenever the
machine's page says something is missing on the box. It ends by printing that page's address. The
command carries no secret and sends none: credentials go into `~/.bosun` on the machine and nowhere
else.

The fingerprint is how values typed in the browser — env variables, test-account secrets — are kept
honest: the browser encrypts them to this machine's key and shows the same fingerprint on the
machine's page. If the two differ, do not type anything in.

### The machine's Claude credential

Planning sessions run the `claude` CLI on the machine, so the box needs the binary on its PATH and a
working login. The installer puts the binary there, and `bosun-agent setup` asks for the token as its
first step. That step is `auth set`, which also works on its own:

```bash
# 1. on your own machine, which has a browser:
claude setup-token

# 2. on the VPS — prompts with echo off, checks the token, saves it:
bosun-agent auth set
bosun-agent auth status   # whether this machine has a working credential
```

The token is never typed into the browser, encrypted or not: it is an account credential, and the
terminal is the one path to the machine that no page served by bosun can read.

The token is typed at a prompt, never passed as an argument, so it stays out of
`/proc/<pid>/cmdline` and the shell's history. `auth set` makes one real API call before writing:
a credential the API refuses is a typo or an expired token, and storing it would leave the machine
looking configured while every planning session fails. Editing `~/.bosun/env` by hand still works.

`claude setup-token` mints a **one-year** OAuth token against a Pro, Max, Team or Enterprise plan,
for exactly this case — CI and machines with no browser. It can only make model requests, which is
all a planning session needs.

Interactive `claude auth login` on the box is deliberately **not** the documented path even though
the CLI supports it over SSH. The session it creates has to renew itself, and headless renewal
failing (`OAuth session expired and could not be refreshed`) is the failure mode an unattended agent
hits after weeks of working. A minted token has no renewal step to fail.

`~/.bosun/env` (mode `0600`, seeded by `install.sh`) is where the token goes. The agent strips
`ANTHROPIC_API_KEY` from every session it spawns, so a stray key on the box cannot quietly decide
which account a session bills to.

Bosun never sees the value. The agent asks `claude auth status --json` and reports what it says.

**That check proves presence, not validity.** `claude auth status` answers `loggedIn: true` for a
token the API will reject, so the `claude` preflight check reads `credential present (oauth_token)`
rather than `authenticated` — it cannot tell a live token from a dead one. Proving a credential
works means spending a real turn against the API, which is what `bosun-agent auth set` does once at
the moment you set it, and what `bosun-agent auth status` does on demand. It is deliberately not in
preflight, which runs on every reconnect and every Refresh.

The consequence worth knowing: a token that expires months later leaves preflight green, and the
first planning session fails with the API's own message. `bosun-agent auth status` is the one-command
answer when that happens.

### Skills

Planning sessions can invoke [Agent Skills](https://code.claude.com/docs/en/skills). Claude Code
discovers them itself from `<repo>/.claude/skills/` and `~/.claude/skills/` on the machine; bosun's
part is naming `Skill` in the session's tool list, because `--tools` replaces the built-in set and a
session without it loads every skill description and then cannot invoke any of them.

A project skill shadows a user skill of the same name. The `skills` preflight check reports what a
machine picked up and from where, so a skill that is present but never loaded is visible instead of
a mystery.

**Skills only get the session's tools.** A planning session runs with `Read`, `Grep`, `Glob`, `Task`
and `Skill` — nothing that writes files or runs commands. A skill that is a checklist or a set of
conventions works; one that shells out will fail partway through. That is a deliberate limit:
planning reads and asks, it does not build.

**A committed skill steers the session.** The session already reads the repo, but a skill is
repo-controlled text that instructs the model rather than data it looks at. On your own repo that is
the point — a repo carrying its own planning conventions is the use case. Treat it as a reason to
review skills in a pull request like any other code.

### Repositories, the config and onboarding

**GitHub is an integration, not a CLI on the box.** A leader connects bosun's GitHub App on the
project's Settings, and each machine then picks a repository those accounts grant; attaching clones its default branch into
`~/.bosun/repos/<slug>` with a token that lasts an hour and reaches that one repository. No GitHub
token is stored in the database or on the machine's disk: git asks `bosun-agent git-credential` on
every fetch and push, and the backend mints one. A finished plan's pull request is opened by the
backend through the App, so a repository machine needs no `gh`. See
`be/src/services/github/github-app.service.md` and `agent/src/services/workspace.service.md`.

**The config is a file in the repository**, `.bosun/project.yaml` — the toolchain, setup steps, apps
and how they find each other on a queue's ports, checks and test accounts. Facts about the code, so it
travels with the branch that changes it. It never holds a secret or anything about one machine.
Bosun keeps a draft only until the file exists, and a session uses the file in the tree it runs in
whenever there is one; a file that does not validate stops the session rather than falling back.
Whether migrations are applied is set per machine in bosun.

**Onboarding writes the config.** *Start onboarding* sends a session to read the repository and run
what it can; it asks nothing, and comes back with a draft, the inputs it still needs — env keys per
path, test-account secrets, the migration policy — and the assumptions it made. Filling the one form
starts verify on its own: the agent installs, generates, migrates where allowed, starts every app with
`stack_up` and signs in as each test account. A ready run offers *Open pull request*, which adds
`.bosun/project.yaml` and nothing else. A second machine on the same repository needs only its own
inputs and a verify. See `be/src/controllers/onboarding/README.md` and `agent/src/onboarding/README.md`.

Values typed in the browser — env sets and session secrets — are encrypted there to the machine's key
and opened only on the machine. Claude and MCP credentials are never typed in the browser at all.

A machine enrolled before all this, onto an existing checkout, keeps working exactly as it did: its
checkout, its project profile and `gh`.

### Refreshing a machine

Refresh in the browser re-runs exactly what the agent runs when it connects: it re-sends `hello` and
re-collects every preflight check, reading each source from disk at that moment. So all of this
takes effect without restarting the agent or re-enrolling.

Most of it needs no Refresh at all. The agent watches `~/.bosun`, and a change to `env`, `mcp.json`
or the env store sends a fresh `hello` and preflight within a few seconds — so the machine's checklist
ticks while `bosun-agent setup` runs, with nobody pressing anything:

| changed | picked up |
| ------- | --------- |
| `~/.bosun/env` — a Claude token, an MCP server's credential | automatically |
| `~/.bosun/mcp.json` — a server added or edited | automatically |
| `~/.bosun/project-env.json` — env sets and session secrets | automatically |
| `.claude/skills/` in the repo, or `~/.claude/skills/` | by Refresh |
| the repo's contents, branch, working tree | by Refresh |

Refresh stays for what it is actually for: upgrades, and re-reading the repository.

`systemd` reads `EnvironmentFile=` only when the unit starts, so the agent re-reads `~/.bosun/env`
itself rather than trusting the environment it was launched with. `PATH` is the one key the file
cannot override — the unit resolves it at install time and that is what lets the service find
`claude` and `node` at all.

**Refresh also upgrades the agent.** If the machine reports a version other than the backend's
`AGENT_EXPECTED_VERSION`, Refresh offers it that build: the agent downloads it, verifies the
published checksum, runs the staged binary to confirm it reports the expected version, swaps it in
and restarts. Only Refresh does this — reconnecting never triggers an upgrade, so one bad release
cannot take a fleet down without somebody choosing it.

A build that installs but never connects rolls itself back to the binary it replaced and refuses to
retry that version, because a machine with no inbound port cannot be rescued from the browser. An
upgrade offered while a planning session is running is deferred to the next Refresh. See
`agent/src/connection/README.md`.

Which build machines are told to run is discovered from the release host, so publishing an agent
release is the whole procedure — the backend needs no redeploy and no version is kept in two places.
To roll a bad release back, pin `AGENT_EXPECTED_VERSION` to the last good version and redeploy; it
overrides the lookup.

Refreshing never un-pauses a machine — `paused` is a property of the machine, not of its socket, and
every reachability write leaves a paused row alone.

### Custom MCP servers

Planning sessions run with `--strict-mcp-config`, so the only MCP servers a session sees are the
ones bosun assembles: its own loopback server, plus whatever is in `~/.bosun/mcp.json` (mode `0600`,
seeded by `install.sh`). A repo's `.mcp.json` is deliberately **not** read — that file is committed,
and a credential in it goes to your git host.

The quickest way to add one is a preset — bosun serves a catalogue and the agent installs from it:

```bash
bosun-agent mcp list           # configured servers, plus what is available
bosun-agent mcp check          # connect to each one and report what answers
bosun-agent mcp add atlassian  # prompts for any credential, confirms, writes
bosun-agent mcp remove jira
```

`mcp check` is the one to reach for when a session says it cannot see something it should. The `mcp`
preflight row reports what is *configured and parseable* — it says nothing about whether a server
answers, because preflight runs on every reconnect and every Refresh and cannot afford a network
round trip per server. `mcp check` does exactly that round trip, on demand, and separates a refused
credential (401) from one that is not permitted (403) from an endpoint that is not there (404).

**The command carries no secret.** A preset names the variables it needs, never their values: the
agent prompts for each on the box — hidden for a credential, echoed for something like an account
email — writes them to `~/.bosun/env`, and puts only the `${VAR}` reference in `mcp.json`.

A preset needing HTTP Basic (Atlassian's personal-token path, `base64(email:token)`) is the one shape
`${VAR}` substitution cannot express, so the agent composes the header value from the two answers and
stores only the encoded result. The raw token is never written anywhere. Nothing is typed into the browser, so the token never reaches bosun, and
nothing is passed as an argument, so it never lands in shell history or `/proc/<pid>/cmdline`.

Re-running `mcp add` on a server that is already there updates it: the config is rewritten and you
are asked whether to replace the stored credential or keep it, which is how a token gets rotated
without editing the file by hand. A variable already set by a *different* server is refused rather
than overwritten — that would break the other integration silently.

`mcp add` prints the resolved server and waits for a `y` before writing anything. That matters most
for a `stdio` preset, which is a command that will run on the machine — a preset comes from bosun,
but running it is the operator's decision rather than an assumption bosun gets to make.

Writing the file by hand does the same job:

```json
{
  "mcpServers": {
    "atlassian": {
      "type": "http",
      "url": "<endpoint from the vendor's docs>",
      "headers": { "Authorization": "Bearer ${ATLASSIAN_TOKEN}" }
    }
  }
}
```

Secrets go in `~/.bosun/env` and are referenced as `${VAR}` or `${VAR:-default}`. The agent expands
them itself before spawning the session, so `mcp.json` never has to hold a literal token. A variable
the environment never supplied is left as written and reported by the `mcp` preflight check rather
than silently becoming an empty string.

Both files are re-read on demand, so adding a server or pasting in a token takes effect on the next
Refresh — see [Refreshing a machine](#refreshing-a-machine).

Every tool of a configured server is allowed (`mcp__<name>__*`). That widens what a session can do:
a planning session with Jira attached can write to Jira. Planning is a read-and-ask activity, so
prefer a read-only token wherever the server offers one. `bosun` is a reserved server name and a
config using it is ignored.

Bosun never sees any of this. The file lives on the box, the expansion happens on the box, and the
backend learns only the server names, through preflight.

**Defaults.** `DEFAULT_SERVERS` in `agent/src/services/mcp-config.service.ts` is merged *underneath*
`~/.bosun/mcp.json`, so an entry of the same name in the user's file wins and `mcp list` labels each
one `(yours)` or `(bosun default)`. Playwright ships as a default, so every machine can inspect a
running app without being configured for it.

Two things a machine needs for that default to work: `npx` on the service PATH (the `package-manager`
check covers it) and a browser build — `npx playwright install chromium`, once per machine. The
`browser` preflight check looks for that build and goes red without it, because the server starts
either way and its tools only fail when a bullet calls one, an hour into a plan.

The default is pinned to `--browser chromium --headless` for the same reason. Playwright MCP
otherwise launches the `chrome` channel — a real Google Chrome installed at a system path — and a
machine that has run `playwright install chromium` does not have one; it is also headed by default,
and a VPS has no display.

A machine that cannot use a default switches it off by naming it `null`:

```json
{ "mcpServers": { "playwright": null } }
```

`systemctl --user` sources no shell rc, so the unit carries an explicit `Environment=PATH=` resolved
at install time and `EnvironmentFile=-%h/.bosun/env`. A machine that passes preflight by hand but was
enrolled with an agent older than 1.3.0 will fail it under the service until `install.sh` is re-run.

### Before you push

Each package has a `preflight` script that runs typecheck, lint, tests and the duplication check:

```bash
cd be && pnpm preflight
cd fe && pnpm preflight
```

Per-package conventions live in `be/CLAUDE.md` and `fe/CLAUDE.md`.

## Deploying the backend

```bash
cd be && pnpm deploy
```

`scripts/deploy.sh` refuses more often than it deploys, which is the point. It checks flyctl is
logged in, that `be/` is committed, that preflight is green, and — the one that actually bites — that
every variable `EnvSchema` requires exists on Fly either as a `[env]` entry in `fly.toml` or as a
secret. That list is read out of the schema at run time rather than restated in the script, so adding
an env var cannot silently produce a crash-looping deploy. It then applies migrations (naming the
database first, because the URL comes from your local `.env`), deploys with `--ha=false`, and waits
for `/health`.

`--allow-dirty`, `--skip-migrations` and `--yes` are there for when you mean it.

Secrets are set out of band, once:

```bash
fly secrets set --app bosun-be SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=...
```

`PUBLIC_APP_URL` is one of those, and it is the web app's origin rather than the backend's: a pull
request bosun opens links back to the plan that produced it, and the backend cannot derive where the
browser reaches the app from where it reaches itself.

**The GitHub App is registered once per deployment**, and the deploy refuses until its five variables
exist. Create it with repository permissions `contents: write`, `pull_requests: write` and
`metadata: read`; make it installable on any account (*Make public*), or it can never be installed on an
organization other than the one that owns it; switch on *Request user authorization (OAuth) during installation*; set the
**Callback URL** to `PUBLIC_APP_URL/github/callback` (with that option on, GitHub disables the setup URL
and sends the installer to the callback URL instead); leave webhooks off. Then:

```bash
fly secrets set --app bosun-be GITHUB_APP_ID=... GITHUB_APP_SLUG=... GITHUB_APP_CLIENT_ID=... \
  GITHUB_APP_CLIENT_SECRET=... GITHUB_APP_PRIVATE_KEY="$(cat bosun.private-key.pem)"
```

A local backend needs the same five in `be/.env` to boot — a second App registered for local use keeps
production's key off developer machines.
