# Plan: Machine Connection Prototype

_Bosun plan #001 · prototype scope · no Claude integration_

## Overview

Prove the three-hop path **browser → BE → VPS** end to end. A user adds a machine in the web app,
enrolls an agent process on a remote box with a one-time code, watches that machine come online in
real time with a preflight checklist, and clicks a button that round-trips a message to the VPS and
back.

Nothing in this plan touches Claude, plans, slices or runs. The deliverable is the transport that
everything later rides on.

**Success in one sentence:** you click Ping in the browser and see `pong · 43ms` returned by a
process running on a real VPS, next to a green preflight checklist for that box.

## Acceptance criteria

The binding checklist. Each states an observable condition.

**Enrollment**

- [x] **AC-1** — From the machines page, "Add machine" with a name creates a machine and displays a copyable `bosun-agent enroll` command containing a one-time code.
- [x] **AC-2** — The machines page lists every machine with its name, status and last-seen time.
- [x] **AC-3** — Running that command on another box writes `config.json` with mode `0600`, containing the server URL, machine id, machine key and repo path.
- [x] **AC-4** — Enrolling twice with the same code fails with a clear error and issues no second key.
- [x] **AC-5** — A code older than its TTL is rejected with a clear error.
- [x] **AC-6** — The machine key is stored only as a hash. The plaintext appears in exactly one HTTP response and is never retrievable again.
- [ ] **AC-7** — The BE is reachable at a public HTTPS URL and `GET /health` there returns `{"status":"ok"}`.

**The connection**

- [ ] **AC-8** — `bosun-agent run` opens a WebSocket to the BE, authenticates with the machine key, and the machine's status becomes `online`.
- [ ] **AC-9** — A connection attempt with a missing or wrong key is rejected with `401` and no socket is opened.
- [ ] **AC-10** — On connect the agent sends `hello` and `preflight`; the results are persisted on the machine row.
- [ ] **AC-11** — The status dot flips to green in an already-open browser within 2s of the agent connecting, with no page refresh.
- [ ] **AC-12** — The machine detail view renders every preflight check as pass/fail with its detail text.
- [ ] **AC-13** — Stopping the agent process flips the status to offline in the browser within 45s.
- [ ] **AC-14** — Severing the agent's network without killing the process also flips it offline within 45s, driven by unanswered heartbeat frames.
- [ ] **AC-15** — Restarting the agent reconnects, and the stale socket is discarded — one machine never holds two live sockets.
- [ ] **AC-16** — With the BE unreachable, the agent retries with backoff and connects on its own once the BE returns, without being restarted.

**The round-trip**

- [ ] **AC-17** — A Ping button on the machine detail sends a command; the UI shows the pong and the round-trip time in ms.
- [ ] **AC-18** — Ping against an offline machine returns a clear "machine offline" error, surfaced in the UI rather than silently swallowed.
- [ ] **AC-19** — The agent runs on the real VPS — not the dev laptop — and completes the round-trip.
- [ ] **AC-20** — The preflight checklist reflects the actual state of that VPS, and at least one deliberately broken check renders red.

## Architecture

### How it works

The BE never dials the VPS. The agent on the VPS makes one outbound HTTPS request to the BE that is
upgraded to a WebSocket and then held open indefinitely. The BE keeps that socket in an in-memory
`Map<machineId, WebSocket>`. "Sending a command to the VPS" means looking up that map and calling
`.send()` on a socket the VPS itself opened — which is why no inbound port, public IP or SSH key is
ever involved on the VPS side.

Enrollment is separate and happens once over plain HTTP. The browser asks the BE for a machine; the
BE returns a short-lived single-use code. The agent posts that code to `/enroll` and receives a
long-lived machine key, which it stores on disk and presents on every subsequent WebSocket connect.
The BE stores only a hash of that key.

There are **two** WebSocket routes with different auth and different message shapes: `/agent/ws` for
machines (bearer machine key) and `/ui/ws` for browsers (unauthenticated in the prototype). They are
never merged. Events arriving from an agent are written to Postgres and then fanned out to every open
browser socket, so the UI updates without polling.

Liveness is protocol-level: the BE sends WebSocket ping frames every 30s and closes a socket after
two unanswered, which is what catches a dead-but-not-closed TCP connection. The agent's `run` command
is an infinite reconnect loop with capped exponential backoff, re-sending `hello` and `preflight` on
every successful connect.

### Screen layout

Two surfaces, both built from Mantine primitives already in `fe/`.

- `Machines list` — page header with an "Add machine" button · a `Stack` of machine `Card`s, each with a status dot, name, last-seen, and click-through to detail
- `Add machine modal` — name `TextInput` · on submit, swaps to a read-only `Code` block with the full enroll command and a copy button · warns that the code is single-use and expires
- `Machine detail` — status header · preflight checklist as an icon+label list · a `Ping` button with the last result and latency beside it

### Schema changes

One table.

```
machines
  id                text primary key          -- "m_" + nanoid
  name              text not null
  enrollment_token  text unique               -- null once used
  token_expires_at  timestamptz
  token_used_at     timestamptz
  machine_key_hash  text                      -- sha256 hex, null until enrolled
  status            text not null default 'pending'   -- pending | online | offline
  last_seen_at      timestamptz
  repo_path         text
  agent_version     text
  capabilities      jsonb                     -- the preflight check array
  created_at        timestamptz not null default now()
```

Machine keys are 32 bytes of `crypto.randomBytes`, so **sha256 + `timingSafeEqual` is correct and
bcrypt is not needed** — bcrypt's work factor exists to slow brute force against low-entropy human
passwords, which this is not.

### API contract

```ts
POST /machines          { name }                          -> { id, name, token, expiresAt, enrollCommand }
GET  /machines                                            -> Machine[]
GET  /machines/:id                                        -> Machine
POST /machines/:id/ping                                   -> 202 { commandId } | 409 { error: "machine offline" }

POST /enroll            { token, hostname, repoPath }     -> { machineId, machineKey, serverUrl }

GET  /agent/ws          Authorization: Bearer <machineKey> -> 101 Switching Protocols | 401
GET  /ui/ws                                                -> 101 Switching Protocols
GET  /health                                               -> { status: "ok" }
```

### Wire protocol

One zod module, the single source of truth for both sides. Defined in `be/src/types/protocol.ts` and
copied verbatim into `agent/src/protocol.ts` (no shared package in the prototype — see Non-goals).

```ts
// agent -> BE
{ type: "hello",     agentVersion: string, hostname: string, repoPath: string }
{ type: "preflight", checks: { name: string, ok: boolean, detail?: string }[] }
{ type: "pong",      id: string, at: number }

// BE -> agent
{ type: "ping",      id: string }

// BE -> browser
{ type: "machine.updated", machine: Machine }
{ type: "machine.pong",    machineId: string, id: string, rttMs: number }
```

Every inbound message is parsed with the zod schema before it is acted on, on both sides. A message
that fails to parse is logged and dropped, never partially handled.

### Preflight checks

The agent's checks, each returning `{ name, ok, detail }`. These are the reference project's
paid-for-once gotchas turned into machine-readable assertions.

- `node` — version present and >= 24.15
- `pnpm` — on PATH
- `git-clean` — `git status --porcelain` empty in `repoPath`
- `gh-auth` — `gh auth status` exits 0
- `claude-token` — `CLAUDE_CODE_OAUTH_TOKEN` set
- `claude-creds-shadow` — warns if `~/.claude/.credentials.json` exists, since it silently outranks the env token
- `playwright` — a chromium build is installed
- `mcp-json` — `.mcp.json` present in `repoPath`
- `vite-env` — `fe/.env` has `VITE_API_URL` on `127.0.0.1`, not `localhost`

### New libs

- `@fastify/websocket` (BE) — WebSocket routes on the existing Fastify instance
- `ws` (agent) — client side
- `nanoid` (BE) — machine ids and command ids
- `commander` (agent) — `enroll` / `run` subcommands
- `flyctl` (tooling) — deploy

## Key decisions

- **Supabase for Postgres, connected on port 5432 (direct), not 6543 (pooler).** The pooler is
  pgbouncer in transaction mode and `drizzle-kit migrate` fails against it. `supabase-js` is not
  used at all — Drizzle over `postgres-js` talks to it as plain Postgres.
- **Fly.io for the BE.** The BE must hold long-lived connections, which rules out Vercel, Netlify
  and anything Lambda-based, and rules out Render's free tier because it sleeps on idle.
- **Deploy in slice 1, not at the end.** BE reachability is the largest risk in this plan; slices 2
  and 3 are developed against the real topology rather than discovering it late.
- **Two WebSocket routes, never merged.** Different auth, different message shapes, different
  lifecycle.
- **In-memory socket registry.** Single BE process, so a `Map` is sufficient and correct. Multi-
  instance needs a different design and is out of scope.
- **No browser auth.** Adding it later changes no structure in this plan.
- **The agent is run by hand.** `install.sh` and systemd prove nothing about the connection.

## Non-goals

Explicitly out of scope; each would be scope drift in the slices.

- Claude, the Agent SDK, `plan-me`, or any session work
- Plans, acceptance criteria, slices, findings, runs or a queue
- Event sequencing, acking, or replay after reconnect — this prototype is fire-and-forget
- Leases, heartbeat reclaim, retry counts
- `install.sh`, systemd unit, agent auto-update, signed releases
- Browser authentication, users, multi-tenancy
- A shared workspace package for the protocol — it is duplicated in two files on purpose, and
  unifying it is a later refactor
- Multiple BE instances or horizontal scaling

## Blockers & dependencies

- **Blocked by:** the `fe/` and `be/` scaffolding must exist and pass `preflight` before slice 1
  starts.
- A Supabase project with its direct connection string.
- A Fly.io account.
- The VPS reachable over SSH with node 24 and pnpm, for slice 3.

## Slices

- [ ] **Phase 1: Machines exist and can enroll** — AC-1 … AC-7
- [ ] **Phase 2: The line stays open** — AC-8 … AC-16
- [ ] **Phase 3: Round-trip on the real VPS** — AC-17 … AC-20

### Phase 1 — Machines exist and can enroll

Vertical cut through schema, API, UI and a new `agent/` package, ending with the BE publicly
deployed. No WebSockets anywhere in this slice.

- `be/` — Drizzle schema for `machines` + first migration against Supabase; `POST /machines`,
  `GET /machines`, `GET /machines/:id`, `POST /enroll`; key generation, sha256 storage, token TTL
  and single-use enforcement
- `be/` — Dockerfile + `fly.toml`, deployed, `GET /health` green on the public URL
- `fe/` — machines list page, "Add machine" modal, copyable enroll command, TanStack Query wiring
- `agent/` — new package: `package.json`, tsconfig, `bin`, `commander` CLI, `config.ts`,
  `enroll.ts` posting to the deployed BE and writing `config.json` at `0600`

Proof: add a machine in the browser against the Fly URL, run the printed command on your laptop,
`config.json` exists with the key, the row shows `token_used_at` set, and re-running the command
fails.

### Phase 2 — The line stays open

The socket, both directions, with the browser updating live.

- `be/` — `@fastify/websocket`; `/agent/ws` with bearer auth and stale-socket eviction; the
  `Map<machineId, WebSocket>` registry; 30s ping frames with a two-strike close; `hello` and
  `preflight` handlers persisting to the row; `/ui/ws` and the fan-out to open browsers
- `be/src/types/protocol.ts` — the zod message schemas
- `agent/` — `run` command: connect, authenticate, reconnect loop with capped backoff, `hello` +
  `preflight` on every connect, `preflight.ts` implementing all nine checks
- `fe/` — `/ui/ws` client with its own reconnect, patching the query cache; status dot on the list;
  machine detail view with the preflight checklist

Proof: start the agent, the dot goes green with no refresh; `Ctrl-C`, red within 45s; restart, green
again with one socket; stop the BE and the agent keeps retrying until it returns.

### Phase 3 — Round-trip on the real VPS

The command path down, the reply path up, and the move off the laptop.

- `be/` — `POST /machines/:id/ping` looking up the registry, `409` when absent, `202` with a
  `commandId` when sent; `pong` handler computing RTT and pushing `machine.pong` to browsers
- `agent/` — `ping` command handler replying `pong` with the correlation id
- `fe/` — Ping button, last-result and latency display, offline error surfaced
- Ops — get `agent/` onto the VPS, enroll it there, run it, and confirm the checklist reflects that
  box

Proof: AC-17 through AC-20, with the agent on the VPS and the laptop agent stopped.

## Risks

- **The BE must be publicly reachable before anything works.** This is why deploy is in slice 1. For
  the inner dev loop, run the agent on the laptop against a local BE; only slice 3 requires the VPS.
- **Ghost sockets.** A machine that reconnects while the BE still holds its old socket will look
  online forever and receive commands into a dead pipe. Eviction on connect plus ping frames are both
  required; neither alone is sufficient.
- **The pooler port.** Using 6543 will appear to work until the first `drizzle-kit migrate`.
- **Silent protocol drift.** The protocol file is duplicated by design. Both sides must parse with
  zod and log parse failures loudly, or a shape change degrades into messages that are quietly
  ignored.
- **Fly cold start.** If the BE restarts, every agent reconnects at once. Backoff must be jittered,
  not a fixed interval.

## Decisions taken

- **`DATABASE_URL` is Supabase's session pooler on 5432, not the direct host.** The direct host
  (`db.<ref>.supabase.co`) resolves to IPv6 only unless the IPv4 add-on is bought, so it is
  unreachable from the dev laptop. Supavisor session mode is IPv4 and, unlike transaction mode on
  6543, runs `drizzle-kit migrate` fine. The plan's constraint was really "not transaction mode".
- **`PUBLIC_SERVER_URL` added to the env contract.** The BE has to name itself in the enroll command
  it prints, and behind Fly's proxy it cannot infer that from the request.
- **`nanoid@3`, not 5.** v5 is ESM-only and `be` compiles to CommonJS.
- **The agent uses relative imports and no path alias.** A `src/*` alias would need
  `tsconfig-paths` registered at runtime on the VPS for a binary that has no other reason to carry
  it.
- **Enrollment token TTL is 15 minutes**, and the token is consumed by a single conditional UPDATE —
  see `be/src/controllers/enroll/enroll-machine.md`.
- **`auto_stop_machines = "off"` in `fly.toml`.** A proxy-stopped machine drops every agent socket,
  which is the one thing this service exists to hold.
