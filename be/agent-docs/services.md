# Services

Services are infrastructure, third-party wrappers and process-local state under
`src/services/<name>/`. Each exposes a factory (`getXService` / `getX`) returning a typed object, and
exports its type as `X = ReturnType<typeof getX>`. They hold the SDK, HTTP and crypto details so
controllers stay provider-agnostic.

References: `src/services/index.ts` (assembly), `src/types/fastify.d.ts` (decorator types)

## What is here

| Folder | What it wraps |
| --- | --- |
| `drizzle/` | `getDb`, the `Db` / `DbOrTx` types, and `schema.ts` — see [database.md](./database.md) |
| `env/` | `getEnv()` — the one place `process.env` is read, parsed through `EnvSchema` |
| `auth/` | Supabase: `supabase-auth` (resolve a token, publishable key), `supabase-admin` (create accounts, secret key) |
| `github/`, `azure/` | GitHub App / PAT and Azure DevOps clients, branch snapshots, connection guards |
| `git/` | `GitProvider` — the provider-agnostic interface the line codes against |
| `crypto/` | `pat-encryption` — encrypts stored PATs with `AZURE_PAT_ENCRYPTION_KEY` |
| `keys/`, `ids/` | random tokens, machine-key and webhook-secret hashing; prefixed nanoid ids (`m_…`, `p_…`) |
| `tickets/` | single-use, seconds-long WebSocket tickets for the browser socket |
| `sockets/` | the socket registry, disconnect grace, machine memory, pending env requests / upgrades |
| `agent-release/`, `installer/`, `mcp-presets/` | agent versions and rollout, `install.sh`, the MCP preset catalogue |
| `line/`, `plans/`, `runs/`, `notifications/` | line lock, plan text rendering, run activity, web push |

## Assembly & decoration

`getServices({ env })` in `src/services/index.ts` builds every service once, passing each the env
values it needs as plain options. `build-server.ts` decorates the result as `fastify.services`, and
the `Services` type is declared on `FastifyInstance` in `src/types/fastify.d.ts`.

```ts
// src/services/index.ts
githubApp: getGithubAppService({
	appId: opts.env.GITHUB_APP_ID,
	…
	privateKey: opts.env.GITHUB_APP_PRIVATE_KEY
}),
```

Routes read `fastify.services.*` and inject what the controller needs; a deps builder
(`lineDeps(fastify)`) does the same. Controllers never call `getXService()` themselves.

## Rules

- **Env reaches a service only as options.** `getEnv()` is the single reader of `process.env`; a
  service takes `{ secretKey }`, `{ privateKey }`, never `process.env.X`. A new variable goes in
  `EnvSchema` first ([types.md](./types.md)) and then into the `getServices` call
- **A secret is read in exactly one service.** `GITHUB_APP_PRIVATE_KEY` only in
  `github-app.service.ts`, `SUPABASE_SECRET_KEY` only in `supabase-admin.service.ts`. Nothing else is
  handed the raw value, and no GitHub token is written to the database
- **No business logic.** A service calls GitHub, hashes a key or holds a map; it does not decide
  which machine gets a build or who is notified. That is a controller
- **No DB access.** Queries belong in repos. `drizzle/schema.ts` lives here only as infrastructure
  config
- **Plain objects in and out.** No Fastify `request` / `reply`, no raw SDK response shapes leaking
  to callers
- **Some services are stateful, and the state is per-process.** `socketRegistry`, `disconnectGrace`,
  `machineMemory`, `pendingEnvRequests`, `pendingUpgrades`, `lineLock`, `ticketService`,
  `autoUpgradeRollout` and `runActivity` close over in-memory maps built once in `getServices`. That
  is why deploys pin `--ha=false`: a second instance would hold a second, disjoint set. Anything that
  must survive a restart belongs in a table, not a service
- **Adding a service:** write the factory and export its type, add it to `getServices`, and — if a
  domain deps bundle needs it — to `LineDeps` / `OnboardingDeps`. `fastify.d.ts` picks it up through
  `Services`

## Engineering docs

Several services carry an `.md` beside them. Read it before changing the service:

- `auth/supabase-auth.service.md`, `auth/supabase-admin.service.md`
- `github/github-app.service.md`, `github/github-pat.service.md`
- `crypto/pat-encryption.service.md`
- `sockets/registry.service.md`, `sockets/disconnect-grace.service.md`
- `tickets/ticket.service.md`
- `installer/installer.service.md`
- `agent-release/auto-upgrade-rollout.service.md`
