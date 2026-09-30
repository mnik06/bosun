## Project Overview

**Bosun backend** — a Fastify (v5) service that is both the REST API for the web app and the hub that
remote machines connect back to. It owns all business logic, validates every request and response at
the HTTP boundary, and holds the only connection to Postgres (Drizzle ORM). File-based routing via
`@fastify/autoload`; Zod everywhere for validation and type inference.

Nothing but this service talks to the database. `fe/` reaches it over REST and a browser WebSocket;
the `agent/` daemon reaches it over an outbound WebSocket that it dials and the BE never initiates.

Identity is **not** ours: there is no login endpoint, no password column and no session table.
Supabase Auth issues the tokens, and `fastify.requireUser` resolves each one by asking Supabase who
it belongs to before provisioning our `users` row. Accounts are *created* here, though — a leader
adds a member and the backend mints the Supabase account with a generated password, which is the one
thing that needs the secret key. See `src/services/auth/supabase-auth.service.md` and
`src/services/auth/supabase-admin.service.md`.

**Authorization is by project.** `machines`, `plans` and `repositories` — and through them every
build in a repository's line — belong to a project, never to a person. `fastify.requireMembership`
reads `X-Project-Id`, resolves the caller's role and puts `request.membership = { projectId, role }`
on the request; `fastify.requireLeader` refuses a `developer`. A `users.is_app_owner` row resolves as
`leader` of every project without holding a membership. A project the caller is not in answers
**404**; a role they do not hold answers **403**. See `plans/006-projects-and-roles.md` and
`plans/008-machine-onboarding.md`; which folder carries which gate is in
[agent-docs/hooks.md](./agent-docs/hooks.md). The line — builds, dependencies, integration, verify —
is `src/controllers/line/README.md` and `plans/009-the-line.md`.

**The GitHub App's private key is read in one place**, `src/services/github/github-app.service.ts`,
the same containment `SUPABASE_SECRET_KEY` gets. No GitHub token is written to the database: see
`github-app.service.md`.

`/enroll`, `/agent/ws`, `/install.sh`, `/mcp-presets` and `/health` stay unauthenticated by design —
they are the agent's and the installer's surface (`/agent/*` authenticates with the machine key
instead of a bearer token). The webhooks carry no bearer token either: `/github/webhook` is
authenticated by GitHub's `X-Hub-Signature-256` over the raw body, checked against
`GITHUB_WEBHOOK_SECRET`; `/azure/webhook/:repositoryId` by a per-repository header secret compared
against its stored hash.

## Tech Stack

- **Fastify 5** — HTTP server. Routes auto-loaded from `src/api/routes/` via `@fastify/autoload`
- **@fastify/websocket** — the agent socket (`/agent/ws`) and the browser socket (`/ui/ws`)
- **Drizzle ORM** (`drizzle-orm/postgres-js` over the `postgres` driver) for type-safe Postgres access
- **Zod v4** for validation — request/response schemas wired through `fastify-type-provider-zod`
  (`validatorCompiler` + `serializerCompiler`), socket frames, env validation, and repo-boundary
  parsing
- **TypeScript** (CommonJS target), run via `ts-node`/`nodemon` in dev, compiled with `tsc` for
  production. Path alias `src/*` → `./src/*`, resolved at runtime by `tsconfig-paths`
- **Vitest** for unit tests; **ESLint** with `eslint-plugin-boundaries` and `eslint-plugin-sonarjs`;
  **jscpd** for duplication
- **@fastify/swagger** + **swagger-ui** at `/api/documentation`, registered only when `NODE_ENV` is
  `local` or `staging`
- **pnpm** as the package manager (engine-strict; supply-chain guards live in `pnpm-workspace.yaml`,
  not `.npmrc`)

Listens on `HOST`/`PORT` from `.env` — **127.0.0.1:1506** locally. Routes have no `/api` prefix.

## Development Patterns

### Layered Architecture

Strict one-way dependency direction:

```
route handler → controller → repo → database
route handler → route schema (Zod validates request + serializes response)
controller   → (injected repos + services | db.transaction)
repo         → Drizzle → Postgres
```

- **Route** (`src/api/routes/<domain>/*.route.ts`) — HTTP/WebSocket boundary. Declares the Zod
  `schema`, reads deps off `fastify` (`repos`, `services`, `env`, `db`) and the caller off the request
  (`user`, `membership`, `agent`), calls a controller, returns. Zero business logic, no Drizzle
- **Controller** (`src/controllers/<domain>/<verb>.ts`) — business logic, one exported controller per
  file; helpers shared by two move to `src/controllers/<domain>/shared/`. Receives its dependencies as
  object params, never a global. Throws `HttpError`. Owns transactions and the background timers
- **Repo** (`src/repos/<domain>/<entity>.repo.ts`) — the ONLY layer that touches the DB. A factory
  `getXRepo(db)` of single-query methods, each result parsed through its Zod schema. Registered in
  `src/repos/index.ts`
- **Service** (`src/services/<name>/`) — infrastructure, third-party wrappers (Supabase, GitHub,
  Azure, web push, crypto) and process-local state (socket registry, tickets, locks). No business
  logic, no DB. Assembled in `src/services/index.ts`
- **Declaration layers** — `src/api/routes/schemas/` (route schemas), `src/types/` (domain schemas,
  socket protocol, `EnvSchema`, `fastify.d.ts`), `src/api/errors/` (`HttpError`, `errorHandler`),
  `src/utils/` (pure, domain-free helpers). Importable from any layer
- **Plugins / hooks** (`src/api/plugins/`, `autohooks.ts` per route folder) — logging, swagger, auth
  gates. Bootstrap order lives in `src/api/build-server.ts` and nowhere else

**The layering is mechanically enforced.** `eslint-plugin-boundaries` in `eslint.config.mjs`
(`BE_ELEMENTS` / `BE_POLICIES`) refuses any import that breaks the direction above: a route
importing a repo, a repo importing a controller or a route schema, a util importing anything but
utils and `src/api/errors` (so `orNotFound` can throw its 404). Services are importable by every
layer. `pnpm lint` fails on a violation — fix the dependency, don't disable the rule.

### Dependency Injection (the house pattern)

Controllers are functions with explicit dependencies — the biggest convention to honor:

- `build-server.ts` decorates the instance with `db`, `env`, `repos`, `services` and the auth hooks;
  every decorator is typed on `FastifyInstance` in `src/types/fastify.d.ts`
- Routes read those and pass exactly what the controller needs:

  ```ts
  const created = await createMachine({
  	machineRepo: fastify.repos.machineRepo,
  	idService: fastify.services.idService,
  	projectId: req.membership!.projectId,
  	name: req.body.name
  });
  ```

- A domain whose controllers share a large set takes a bundle built once — `lineDeps(fastify)`,
  `onboardingDeps(fastify)` — so the socket, routes, webhooks and timers cannot assemble it differently

### Validation

- HTTP: in the route `schema`, never in the handler body. Request schemas `*ReqSchema`, response
  `*RespSchema`, in `src/api/routes/schemas/<domain>/`; domain schemas in `src/types/`
- **Anything arriving over a socket is validated the same way.** WebSocket frames are not HTTP, so the
  route schema does not cover them: parse every inbound frame with its Zod schema before acting on it,
  and log-and-drop what fails rather than partially handling it
- Env is validated once at startup by `EnvSchema.parse(process.env)` (`getEnv()` in
  `src/services/env/env.service.ts`, called first in `buildServer`) — the server refuses to boot on a
  bad `.env`. `process.env` is read nowhere else

Transactions, error handling and the database each have their own doc below; the one-line rules
that apply everywhere are under General Rules.

## Agent Docs

Read the relevant doc before creating or modifying that layer:

- [Routes](./agent-docs/routes.md) — autoload URL rules, Zod type provider, wiring deps, schema
  placement
- [Controllers](./agent-docs/controllers.md) — shape, deps bundles, project scoping, transactions,
  timers
- [Repos](./agent-docs/repos.md) — factories, `DbOrTx`, one query per method, column maps, Zod parsing
- [Services](./agent-docs/services.md) — what each wraps, `getServices`, env as options, per-process
  state
- [Database](./agent-docs/database.md) — schema conventions, ids, migrations, connection
- [Types](./agent-docs/types.md) — route vs domain schemas, protocol types, naming, `EnvSchema`
- [Errors](./agent-docs/errors.md) — `HttpError`, the global handler, status choice, provider errors
- [Plugins](./agent-docs/plugins.md) — logger/swagger/auth plugins, CORS, bootstrap order in
  `build-server.ts`
- [Hooks](./agent-docs/hooks.md) — `autohooks.ts`, the auth gates, which folder has which gate,
  unauthenticated routes
- [Sockets](./agent-docs/sockets.md) — the agent and browser WebSockets, frame validation, ordering,
  the registry — read before touching `agent/ws.route.ts`, `frame-router.ts`, `ui/` or
  `services/sockets/`

## General Rules

- Use the `src/...` path alias for cross-layer imports. Relative imports only for adjacent /
  same-feature files
- Layer imports are enforced by `eslint-plugin-boundaries` (see Layered Architecture). Routes never
  import repos; repos never import controllers, routes or route schemas
- Route handlers contain zero business logic — declare schema → read deps off `fastify` → call
  controller → return
- Controllers NEVER access Drizzle directly and NEVER import a global repos or services object —
  they receive repos/services/`db` as injected params
- Repos: one method = one Drizzle query; parse the result through its Zod schema before returning;
  register new repos in `src/repos/index.ts`
- **Scope by project in the query.** A browser-reachable read or write goes through a repo's
  `*Owned*` method with `projectId` from `req.membership`; a row the caller's project does not own
  answers 404, exactly like a missing one
- A function with two or more parameters of the same type takes a single object param:

  ```ts
  // BAD
  const linkMachineToUser = (machineId: string, userId: string) => {};
  // GOOD
  const linkMachineToUser = (opts: { machineId: string; userId: string }) => {};
  ```

- **Generic helpers live in `src/utils/`, never beside the caller.** A pure helper typed only in
  primitives/generics (no domain types, no repos, no I/O) goes in `src/utils/general.ts` — not as a
  module-private function next to the first controller that needs it. Private helpers are invisible to
  the next controller, so they get retyped. Big helpers (>~25 lines, or owning private sub-helpers)
  get their own file (`env-path.ts`). Check `general.ts` before writing a new one
- Batch reads — never `Promise.all(ids.map(id => repo.getById(id)))`; add a method using `inArray(...)`
- Parallelize independent reads — when a controller issues 2+ reads with no data dependency between
  them, run them concurrently via `Promise.all([...])` instead of sequential `await`s. Keep dependent
  reads sequential
- Multi-step writes go in one `db.transaction` opened in the **controller**, with repos built from
  the `tx` inside. **No external I/O inside a transaction** — an HTTP call, a socket send, anything
  that can hang ties up the connection and holds locks. Do it before (if the result is needed) or
  after the commit (side effects only)
- Throw `HttpError` for anything the client should see; never `try/catch` in a route just to reshape
  an error. Outside a request (socket handlers, timers, fire-and-forget) catch and log — an unhandled
  rejection takes the process down
- Always generate migrations with `pnpm db:migration:generate` and apply them with
  `pnpm db:migration:run`. Never hand-write migration SQL, never `drizzle-kit push`, never edit or
  delete an applied migration. See [agent-docs/database.md](./agent-docs/database.md)
- Every new env var goes in `src/types/EnvSchema.ts` (no `transform`), `.env.example`, and on Fly —
  see Deployment
- Secrets are stored hashed and compared in constant time; a plaintext credential is returned in
  exactly one response and is never retrievable again. Never log one — `logger.plugin.ts` redacts
  `authorization`, passwords, PATs and webhook secrets, and anything equivalent you add must be
  redacted there too
- A change to a socket frame or the project-config grammar changes `agent/`'s hand-written mirror in
  the same piece of work. See [agent-docs/types.md](./agent-docs/types.md)

## Preflight

`pnpm preflight` runs `typecheck` → `lint:fix` → `test` → `dup` (jscpd). **Run it before you call any
piece of work done**, and leave it green — not "green except for a known failure". Individually:
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm dup`.

Lint is a **two-tier policy** documented at the top of `eslint.config.mjs`: complexity rules (Tier 1)
are never switched off for production code, size rules (Tier 2) are exemptible per shape. Exemptions
are granted exactly two ways — a glob in `eslint.config.mjs` with the reason stated, or a one-off
`// eslint-disable-next-line <rule> -- <reason>`. Silencing a Tier 1 rule instead of refactoring is
not one of them, and neither is disabling a `boundaries` rule to let an import through.

## Deployment

`pnpm deploy` (`scripts/deploy.sh`) is the only supported way to ship the backend. Never
`fly deploy` by hand: the script enforces two things that are invariants rather than preferences.

- **Every variable `EnvSchema` requires must exist on Fly** before the image is built, as a `[env]`
  entry in `fly.toml` or a secret. The list is derived from the schema at run time, so a new env var
  is caught by the next deploy instead of crash-looping the app. Adding one therefore means
  `EnvSchema.ts`, `.env.example`, **and** `fly secrets set`
- **`--ha=false`.** The agent and browser socket registries live in process memory. A second machine
  splits them, and a machine ends up online on one instance and unreachable on the other. See
  `src/services/sockets/registry.service.md`

Migrations are applied from your machine before the deploy, using the `DATABASE_URL` in your local
`.env`. Nothing can tell whether that is the database Fly points at, so the script names it on the
way past and leaves it in the log — deliberately not a prompt, because the deploy runs unattended and
a question nobody is there to answer is worse than a line nobody read.

Only the checks that can be decided without a person refuse: a dirty `be/`, a failing preflight, or a
variable `EnvSchema` requires that Fly does not have. `--allow-dirty` and `--skip-migrations` opt out
of the first and the third.

## Testing

- **The test gate — no test is the default.** Before writing any unit test, answer three questions
  about the code under test. **(1) Can it break on its own?** — could it fail for a reason other than
  someone deliberately editing the declaration it mirrors: a branch, a boundary, ordering, parsing,
  math, a mapper, a state transition, an async or error path, an invariant spanning two files.
  **(2) Is it fragile?** — many branches or edge cases, several callers depending on it, or rules a
  future reader would not infer from the code. **(3) Is a silent break critical?** — wrong data
  written, credential or token handling, a connection/lifecycle path, a migration, data loss. Write
  the test only when **(1) is yes AND (2) or (3) is yes**. Otherwise write none and say which question
  failed. Coverage is not a goal and "this file has no test" is not a defect. That rules out tests for
  repos, route Zod schemas (defaults, required fields, unknown-key rejection — Zod's own behavior),
  repo column lists, constant tables, pass-through controllers that only call one service, and DTO
  shapes. When you meet such a test, delete it rather than update it
- **Never weaken a test to make it pass.** A red test is a finding. Do not loosen an assertion, widen
  an expected range, stub out the thing under test, `.skip` it, or delete it because it is in the way —
  fix the code, or explain why the test's expectation was wrong and change it deliberately. Deleting a
  test is legitimate in exactly one case: it fails the gate above and never should have been written
- Tests live beside the code as `<file>.test.ts` and run under Vitest (`pnpm test`). Controllers are
  tested by injecting fakes for their deps (`{ deleteOwned } as unknown as MachineRepo`), never by
  standing up Fastify or a database

## Engineering docs

When you create a module a reader cannot understand from the code alone — a state machine, a
reconnect/liveness protocol, a multi-step async flow, a non-obvious invariant — write a `<module>.md`
beside it, or a `README.md` for a folder that only makes sense as a whole. Cover **why it is shaped
this way, the invariants that must hold, what breaks if you change them, how its failure modes
surface, and what was tried and rejected**. Never restate the API: the signatures are the API, and a
doc that paraphrases them rots on the first refactor while looking authoritative. Update the doc in
the **same commit** as the change that invalidates it — a stale engineering doc is worse than none,
because it gets believed.

The existing ones are indexed in [agent-docs/controllers.md](./agent-docs/controllers.md) (domain
READMEs) and [agent-docs/services.md](./agent-docs/services.md) (service docs). `agent-docs/` itself
is the layer-convention layer: when a convention changes, update its agent-doc in the same commit.

## HARD RULES

- **NEVER LEAVE A COMMENT THAT NARRATES THE CODE** — no restating what a line plainly does, no section
  banners, no changelog or attribution notes, no commented-out code, no TODOs. The single exception: a
  short comment explaining WHY a non-obvious guard, invariant, or defensive check exists — the threat
  model, the ruling, or the failure it prevents — when a reader could not recover that from the code
  alone
- **NEVER PUT ANY CO-AUTHORS WHEN COMMITTING CODE - DO IT LIKE THE ENGINEER WOULD DO IT BY THEMSELVES**
- **WHEN REPORTING INFORMATION TO ME, BE EXTREMELY CONCISE AND SACRIFICE GRAMMAR FOR THE SAKE OF CONCISION**
