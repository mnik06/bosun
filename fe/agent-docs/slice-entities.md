# Slice: `entities/` — one folder per backend noun

> `architecture.md` routed you here. This file holds the rules for `entities/<noun>/` only. The
> layout map, import direction, path alias and barrel rules stay in `architecture.md`.

## What it is

Everything the app knows about **one backend noun**: its Zod schema and inferred type, its query
keys, fetchers and query hooks, the functions that patch its cache, the socket subscriber that keeps
that cache live, and the small components that render *that* noun (`MachineStatusDot`,
`PlanStatusBadge`, `OnboardingStatusBadge`). No orchestration, no user verbs.

Current entities: `machine`, `mcp-preset`, `notification`, `plan` (also owns builds, the line,
bugfix sessions and proposals), `project`, `repository`, `session`.

## When to add

When the backend exposes a noun the UI reads. Don't create an empty slice ahead of the first read.
A sub-resource that is only ever read through its parent stays in the parent's slice (bugfix,
proposal and line live in `entities/plan`) and gets its own `api/<sub>.queries.ts` file.

## Folder shape

```
entities/<noun>/
├── api/
│   ├── <noun>.queries.ts        # <noun>Keys, fetch<Noun>(), use<Noun>Query()
│   ├── <sub>.queries.ts         # a sub-resource's keys and hooks (plan: bugfix, line, proposal)
│   └── <noun>.writes.ts         # raw write fetchers shared by several features (machine only)
├── model/
│   ├── <noun>.ts                # <Noun>Schema + type <Noun> = z.infer<…>
│   ├── <noun>-message.ts        # Zod schemas for this noun's socket frames
│   ├── <noun>s-socket.tsx       # provider subscribing to the UI socket → realtime.md
│   ├── use-<noun>-stream.ts     # per-screen stream hooks (plan, bugfix)
│   └── <noun>-context.tsx       # a context the app reads everywhere (session, active project)
├── lib/
│   ├── <noun>-cache.ts          # patch/drop/refresh functions over the query cache
│   └── <derivation>.ts          # pure derivations (plan-state, board-column, pending-question)
├── ui/                          # presentational components for this noun
└── index.ts                     # required
```

Only the segments the noun needs. `entities/session` has no `ui/`; `entities/mcp-preset` has no
`lib/`.

## What goes where

- **Schema and type** in `model/<noun>.ts`: `export const MachineSchema = z.object({…})` and
  `export type Machine = z.infer<typeof MachineSchema>`. The schema *is* the type — never hand-write
  an interface for a backend response. See `data-layer.md` § Types.
- **Reads** in `api/<noun>.queries.ts`: a `<noun>Keys` factory, an exported `fetch<Noun>` that
  parses with the schema, and a `use<Noun>Query` hook. See `data-layer.md` § Queries.
- **Writes** do **not** live here as hooks — a write is a user verb, so its mutation hook lives in
  a `features/` slice. The one exception is a raw write fetcher several features call
  (`machine.writes.ts`: `putEnvSet`, `patchMachineCapacity`, …), exported so they don't each retype
  the request.
- **Cache patchers** in `lib/<noun>-cache.ts` (`patchPlan`, `dropPlan`, `appendPlanMessage`,
  `refreshAfterBuild`). Both the socket provider and feature mutations call these, so the rule for
  how a pushed or returned row lands in the cache is written once.
- **Pushes** in `model/`: the frame schemas and the socket provider. See `realtime.md`.

## Entity UI is presentational

`ui/` renders the noun from props — a status dot, a badge, a row card, a select field bound to a
form. Anything that mutates, opens a flow, or composes other nouns is a feature or a widget.

## Naming

- Folder is the singular noun (`machine`, `plan`); file prefix matches it (`machine.queries.ts`).
- Key factory `<noun>Keys` camelCase (`machineKeys`, `planKeys`, `needsYouKeys`).
- Fetchers `fetch<Noun>` / `fetch<Noun>s`; hooks `use<Noun>Query` / `use<Noun>sQuery`.
- Schemas `<Name>Schema` PascalCase; types the same name without the suffix.

## Imports

`shared/` **only**. Peer entities never import each other — `eslint-plugin-boundaries` allows an
entity nothing but `shared`, with two named exceptions in `FSD_POLICIES` (`machine → repository`,
`plan → machine`). When one noun refers to another, carry the id and let the feature, widget or view
that needs both compose them.

## Barrel

`index.ts` is required: explicit named exports, no `export *`. Export schemas as well as types when
another slice parses with them (a feature parsing its mutation response with `PlanSchema`).

```ts
// app/entities/session/index.ts
export { SessionProvider, useSession } from './model/session-context'
export type { Session, SessionState } from './model/session'
export { MeSchema, type Me } from './model/session'
export { fetchMe, meKeys, useMeQuery } from './api/me.queries'
```

## Cross-references

- Fetchers, keys, parsing, the client, auth and the project header: **`data-layer.md`**.
- Socket providers, frame schemas and cache patching: **`realtime.md`**.
