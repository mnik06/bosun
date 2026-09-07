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
node dist/index.js enroll --server http://127.0.0.1:1506 --token <code from the browser>
```

`run` holds the outbound WebSocket, re-sending `hello` and `preflight` on every connect and
reconnecting with jittered backoff. Deleting the machine in the browser makes the agent disable its
own systemd unit, discard `~/.bosun/config.json` and exit — see `agent/src/connection/README.md` for the two
termination paths. Agents installed before that change carry `Restart=always` and need `install.sh`
re-run before they can be deleted cleanly.

`enroll` writes `~/.bosun/config.json` at mode `0600` — server URL, machine id, machine key, repo
path. `--repo` defaults to the current directory, `--config` overrides the path.

### The machine's Claude credential

Planning sessions run the `claude` CLI on the machine, so the box needs the binary on its PATH and a
working login. There is exactly one supported way to give it one:

```bash
# on your own machine, which has a browser:
claude setup-token
# then paste the token into ~/.bosun/env on the VPS:
CLAUDE_CODE_OAUTH_TOKEN=...
systemctl --user restart bosun-agent
```

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

Bosun never sees the value. The agent asks `claude auth status --json` and reports only whether the
box is logged in. A token that is present but refused is reported differently from no token at all —
the first means re-run `setup-token`, the second means the file was never filled in.

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

### Refreshing a machine

Refresh in the browser re-runs exactly what the agent runs when it connects: it re-sends `hello` and
re-collects every preflight check, reading each source from disk at that moment. So all of this
takes effect without restarting the agent or re-enrolling:

| changed | picked up by Refresh |
| ------- | -------------------- |
| `~/.bosun/env` — a Claude token, an MCP server's credential | yes |
| `~/.bosun/mcp.json` — a server added or edited | yes |
| `.claude/skills/` in the repo, or `~/.claude/skills/` | yes |
| the repo's contents, branch, working tree | yes |

`systemd` reads `EnvironmentFile=` only when the unit starts, so the agent re-reads `~/.bosun/env`
itself rather than trusting the environment it was launched with. `PATH` is the one key the file
cannot override — the unit resolves it at install time and that is what lets the service find
`claude` and `node` at all.

**The one thing Refresh cannot change is the running binary.** `agentVersion` is compiled in, so a
new agent build needs a restart (`systemctl --user restart bosun-agent`) or a re-run of
`install.sh`. Refresh re-reports the version it has; it cannot replace it.

Refreshing never un-pauses a machine — `paused` is a property of the machine, not of its socket, and
every reachability write leaves a paused row alone.

### Custom MCP servers

Planning sessions run with `--strict-mcp-config`, so the only MCP servers a session sees are the
ones bosun assembles: its own loopback server, plus whatever is in `~/.bosun/mcp.json` (mode `0600`,
seeded by `install.sh`). A repo's `.mcp.json` is deliberately **not** read — that file is committed,
and a credential in it goes to your git host.

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
