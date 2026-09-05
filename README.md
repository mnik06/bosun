# bosun

Bosun is a web app for driving AI coding agents that run on your own hardware. You register a
machine in the browser, enroll a small daemon on that box with a one-time code, and from then on the
machine holds an outbound WebSocket back to the server — so bosun can dispatch work to it and stream
results back live without the box ever needing an inbound port, a public IP, or an SSH key. The web
app is where you see which machines are online, what state each one is in, and what its agents are
doing.

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
pnpm local
```

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

Then open http://127.0.0.1:5373.

### Agent

```bash
cd agent
pnpm install
pnpm build
node dist/index.js enroll --server http://127.0.0.1:1506 --token <code from the browser>
```

`run` holds the outbound WebSocket, re-sending `hello` and `preflight` on every connect and
reconnecting with jittered backoff — see `agent/src/run.md`.

`enroll` writes `~/.bosun/config.json` at mode `0600` — server URL, machine id, machine key, repo
path. `--repo` defaults to the current directory, `--config` overrides the path.

### Before you push

Each package has a `preflight` script that runs typecheck, lint, tests and the duplication check:

```bash
cd be && pnpm preflight
cd fe && pnpm preflight
```

Per-package conventions live in `be/CLAUDE.md` and `fe/CLAUDE.md`.
