## Project Overview

**Bosun backend** — a Fastify (v5) service that is both the REST API for the web app and the hub that
remote machines connect back to. It owns all business logic, validates every request and response at
the HTTP boundary, and holds the only connection to Postgres (Drizzle ORM). File-based routing via
`@fastify/autoload`; Zod everywhere for validation and type inference.

Nothing but this service talks to the database. `fe/` reaches it over REST; the `agent/` daemon (not
built yet — see `../plans/001-machine-connection-prototype.md`) will reach it over an outbound
WebSocket that it dials and the BE never initiates.

## Tech Stack

- **Fastify 5** — HTTP server. Routes auto-loaded from `src/api/routes/` via `@fastify/autoload`
- **Drizzle ORM** (`drizzle-orm/postgres-js` over the `postgres` driver) for type-safe Postgres access
- **Zod v4** for validation — request/response schemas wired through `fastify-type-provider-zod`
  (`validatorCompiler` + `serializerCompiler`), env validation, and repo-boundary parsing
- **TypeScript** (CommonJS target), run via `ts-node`/`nodemon` in dev, compiled with `tsc` for
  production. Path alias `src/*` → `./src/*`, resolved at runtime by `tsconfig-paths`
- **@fastify/swagger** + **swagger-ui** at `/api/documentation`, registered only when `NODE_ENV` is
  `local` or `staging`
- **pnpm** as the package manager (engine-strict; supply-chain guards live in `pnpm-workspace.yaml`,
  not `.npmrc`)

Listens on `HOST`/`PORT` from `.env` — **127.0.0.1:1506** locally.

## Development Patterns

### Layered Architecture

Strict one-way dependency direction:

```
route handler → controller → repo → database
route handler → route schema (Zod validates request + serializes response)
controller   → (injected repo | db.transaction)
repo         → Drizzle → Postgres
```

- **Route handler** (`src/api/routes/<entity>/*.route.ts`) — HTTP boundary. A Fastify plugin that
  declares the Zod `schema` (`body` / `params` / `querystring` / `response`), pulls its dependencies
  off the `fastify` instance (`fastify.db`, and the repos once they exist), calls a controller, and
  returns the result. Zero business logic, no Drizzle. `health.route.ts` is the shape to copy
- **Controller** (`src/controllers/<entity>/<verb>.ts`) — business logic, one exported function per
  file. A controller that outgrows one file becomes `<verb>/index.ts` + `<verb>/utils/`; helpers
  shared by two controllers move to `src/controllers/<domain>/shared/`. Receives its dependencies
  (repos, `db`) as an object parameter — it never reaches for a global. Throws `HttpError` for
  client-facing failures. Owns transactions for multi-step writes
- **Repo** (`src/repos/<domain>/<entity>.repo.ts`) — the ONLY layer that touches the DB. A factory
  `getXRepo(db): XRepo` returning Drizzle queries, one query per method, each parsed through its Zod
  entity schema before returning. Assembled and exported from `src/repos/index.ts`
- **Service** (`src/services/<name>/`) — infrastructure and third-party wrappers (`drizzle`, `env`,
  and later the socket registry, hashing, id generation). Provider-agnostic, no business logic
- **Utils** (`src/utils/`) — pure, domain-free helpers importable from any layer. Small helpers go in
  `general.ts`; a helper that is large or owns private sub-helpers gets its own file. No DB, no
  repos, no I/O, no domain types
- **Errors** (`src/api/errors/`) — `HttpError` (status + message) and the global `errorHandler`
- **Plugins** (`src/api/plugins/`) — cross-cutting concerns wired in `build-server.ts` (logging,
  swagger). Bootstrap order lives in `build-server.ts` and nowhere else

`src/controllers/`, `src/repos/` and `src/utils/` are currently empty placeholders. The first file in
each establishes nothing new — it follows the layout above.

### Dependency Injection (the house pattern)

Controllers are pure functions with explicit dependencies — this is the biggest convention to honor:

- `build-server.ts` decorates the instance (`server.decorate('db', getDb(...))`), and each new
  decorator is declared on `FastifyInstance` in `src/types/fastify.d.ts`
- Route handlers read those decorators and pass exactly what the controller needs:

  ```ts
  const machine = await createMachine({ machineRepo: fastify.repos.machineRepo, data: req.body });
  ```

- Controllers accept `{ machineRepo, … }` as an object param and never import a global. This keeps
  them trivially testable and the dependency graph explicit

### Validation

- Validation lives in the Fastify route `schema`, not in handler bodies. `withTypeProvider<ZodTypeProvider>()`
  makes `req.body` / `req.params` / `req.query` fully typed from the Zod schemas, and the response
  serializer validates the `response[statusCode]` schema on the way out
- Request schemas: `*ReqSchema`. Response schemas: `*RespSchema`. Route-boundary schemas live in
  `src/api/routes/schemas/<entity>/`; domain/entity schemas live in `src/types/`
- Repos re-parse rows through the entity schema (`MachineSchema.parse(row)`) so callers can trust the
  type unconditionally
- Env is validated once at startup by `EnvSchema.parse(process.env)` (`src/services/env/env.service.ts`,
  imported first in `build-server.ts`) — the server refuses to boot on a bad `.env`. Every new env var
  goes in `src/types/EnvSchema.ts`, and in `.env.example` alongside it. No `transform` in `EnvSchema` —
  it must not rewrite `process.env`
- **Anything arriving over a socket is validated the same way.** WebSocket frames are not HTTP, so the
  route schema does not cover them: parse every inbound frame with its Zod schema before acting on it,
  and log-and-drop what fails rather than partially handling it

### Error Handling

- Throw `new HttpError(statusCode, message, { cause })` for anything the client should see. The global
  `errorHandler` formats it and collapses any 5xx to `Internal server error`
- Never write `try/catch` in a route just to convert an error — let it propagate to `errorHandler`.
  Logs feed error metrics, so the thrown type matters

### Database

- `getDb(opts)` (`src/services/drizzle/drizzle.service.ts`) builds the Drizzle client with
  `casing: 'snake_case'`; it is decorated as `fastify.db`. The connection string is the validated
  `DATABASE_URL`
- Schema in `src/services/drizzle/schema.ts`. Migrations in `drizzle-out/`, generated with
  `pnpm db:migration:generate` — never hand-written. Fix the schema, not the generated SQL
- Apply what you generated with `pnpm db:migration:run`. A generated-but-unapplied migration leaves
  every later session running against a schema that does not match the code. Never `drizzle-kit push`,
  and never edit or delete a migration that has already been applied
- Connect to Postgres on the **direct** port, not a transaction-mode pooler — `drizzle-kit migrate`
  fails against pgbouncer in transaction mode

### Transactions

- Multi-step writes are wrapped in a single transaction at the **controller** level, with tx-scoped
  repos built inside so every call participates in the same transaction. A route handler never opens
  one
- **No external I/O inside a transaction** — an HTTP call, a socket send, anything that can hang ties
  up the DB connection and holds locks. Do it before the transaction (if the result is needed) or
  after it commits (side effects only)

## General Rules

- Use the `src/...` path alias for cross-layer imports. Relative imports only for adjacent /
  same-feature files
- Route handlers contain zero business logic — declare schema → read deps off `fastify` → call
  controller → return
- Controllers NEVER access the DB directly and NEVER import a global repos object — they receive
  repos/`db` as injected params
- Repos: one method = one Drizzle query; parse the result through its Zod entity schema before
  returning; register new repos in `src/repos/index.ts`
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
  get their own file. Check `general.ts` before writing a new one
- Batch reads — never `Promise.all(ids.map(id => repo.getById(id)))`; add a method using `inArray(...)`
- Parallelize independent reads — when a controller issues 2+ reads with no data dependency between
  them, run them concurrently via `Promise.all([...])` instead of sequential `await`s. Keep dependent
  reads sequential
- Secrets are stored hashed and compared in constant time; a plaintext credential is returned in
  exactly one response and is never retrievable again. Never log one — `logger.plugin.ts` redacts
  `authorization`, and anything equivalent you add must be redacted there too

## Preflight

`pnpm preflight` runs `typecheck` → `lint:fix` → `test` → `dup` (jscpd). **Run it before you call any
piece of work done**, and leave it green — not "green except for a known failure". Individually:
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm dup`.

Lint is a **two-tier policy** documented at the top of `eslint.config.mjs`: complexity rules (Tier 1)
are never switched off for production code, size rules (Tier 2) are exemptible per shape. Exemptions
are granted exactly two ways — a glob in `eslint.config.mjs` with the reason stated, or a one-off
`// eslint-disable-next-line <rule> -- <reason>`. Silencing a Tier 1 rule instead of refactoring is
not one of them.

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
- Tests live beside the code as `<file>.test.ts` and run under Vitest (`pnpm test`)

## Engineering docs

When you create a module a reader cannot understand from the code alone — a state machine, a
reconnect/liveness protocol, a multi-step async flow, a non-obvious invariant — write a `<module>.md`
beside it, or a `README.md` for a folder that only makes sense as a whole. Cover **why it is shaped
this way, the invariants that must hold, what breaks if you change them, how its failure modes
surface, and what was tried and rejected**. Never restate the API: the signatures are the API, and a
doc that paraphrases them rots on the first refactor while looking authoritative. Update the doc in
the **same commit** as the change that invalidates it — a stale engineering doc is worse than none,
because it gets believed.

## HARD RULES

- **NEVER LEAVE A COMMENT THAT NARRATES THE CODE** — no restating what a line plainly does, no section
  banners, no changelog or attribution notes, no commented-out code, no TODOs. The single exception: a
  short comment explaining WHY a non-obvious guard, invariant, or defensive check exists — the threat
  model, the ruling, or the failure it prevents — when a reader could not recover that from the code
  alone
- **NEVER PUT ANY CO-AUTHORS WHEN COMMITTING CODE - DO IT LIKE THE ENGINEER WOULD DO IT BY THEMSELVES**
- **WHEN REPORTING INFORMATION TO ME, BE EXTREMELY CONCISE AND SACRIFICE GRAMMAR FOR THE SAKE OF CONCISION**
