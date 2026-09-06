# bosun

Bosun is a web app for driving AI coding agents that run on your own hardware. You register a
machine in the browser, enroll a small daemon on that box with a one-time code, and from then on the
machine holds an outbound WebSocket back to the server — so bosun can dispatch work to it and stream
results back live without the box ever needing an inbound port, a public IP, or an SSH key. The web
app is where you see which machines are online, what state each one is in, and what its agents are
doing.

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

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` come from the Supabase project (Settings -> API Keys),
and `CORS_ORIGINS` is the comma-separated list of browser origins allowed to call the API — note that
`localhost` and `127.0.0.1` are distinct origins to a browser, so local dev wants both. Both Supabase
values are public; the **secret** key must never appear here, and the server refuses to boot if it
does. Email/password sign-in must be enabled on the project, with email confirmation off — the app
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
own systemd unit, discard `~/.bosun/config.json` and exit — see `agent/src/run.md` for the two
termination paths. Agents installed before that change carry `Restart=always` and need `install.sh`
re-run before they can be deleted cleanly.

`enroll` writes `~/.bosun/config.json` at mode `0600` — server URL, machine id, machine key, repo
path. `--repo` defaults to the current directory, `--config` overrides the path.

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
fly secrets set --app bosun-be SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... CORS_ORIGINS=...
```
