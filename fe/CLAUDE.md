# Bosun Frontend

React Router v7 (framework mode, **SPA** — `ssr: false`, no server runtime), Mantine v9, Tailwind v4,
TanStack Query v5, Mantine Form + Zod, axios. Architecture: capped Feature-Sliced Design, path alias
`~/*` → `./app/*`. Dev server on **127.0.0.1:5373**.

There is no client-side database and no client-side auth. Everything the UI shows comes from the
bosun backend at `VITE_API_URL` (**127.0.0.1:1506** locally, and it must be `127.0.0.1`, not
`localhost`), read over REST and — once plan 001 lands — pushed over a WebSocket that patches the
React Query cache instead of polling.

## Architecture — where code goes

Five slices under `app/`, imports flowing one way only. A slice may import from the slices below it
and never from the ones above; siblings within a layer never import each other.

```
views → widgets → features → entities → shared
```

- **`app/shared/`** — owned by nobody, usable by everyone: the API client, generic hooks, UI
  primitives that wrap Mantine, and pure helpers. No domain knowledge
- **`app/entities/`** — one folder per backend noun. Its type, its query keys and fetchers, and the
  small components that render *that* noun (a status dot, a name cell). No orchestration
- **`app/features/`** — one folder per user action. The mutation, its form, its schema, and the
  component that triggers it. A feature owns a verb, not a screen
- **`app/widgets/`** — composed blocks that combine features and entities into something a page drops
  in whole (a list panel, a detail header). No routing
- **`app/views/`** — one folder per route. Assembles widgets, owns page layout and page-level state.
  The only slice a route file imports from

Inside a slice: `ui/` for components, `model/` for hooks and state, `api/` for queries and mutations,
`lib/` for helpers local to that slice. Each slice folder exposes its public surface through an
`index.ts` barrel and importers use only that — never reach past it into a slice's internals.

`entities/`, `features/`, `widgets/`, `views/` and `shared/` are currently empty placeholders. The
first file in each follows the layout above; it does not invent a new one.

## App setup

- `app/root.tsx` is the only place providers are mounted, in this order: `QueryProvider` →
  `MantineProvider` → `ModalsProvider` + `<Notifications />`. Add a new provider here, not in a view
- `app/routes.ts` is the route config. Every route points at a file under `app/views/`; route
  components import their generated types from `./+types/<route>` and nowhere else
- `app/theme.ts` is the Mantine theme and the source of design tokens. `app/theme.css` is
  **generated** from it by the vite plugin — never edit it by hand
- `app/app.css` holds the global layer order, the self-hosted fonts, and the handful of global
  element rules. It is not a dumping ground for component styles

## Data layer

- Every read is a TanStack Query hook, every write a mutation, both living in the owning slice's
  `api/`. Components never call axios directly
- Query keys are declared once beside the fetcher, never inlined at a call site — a key typed twice
  is a cache that invalidates half the time
- After a mutation, invalidate the affected keys explicitly. Where the backend already pushes the new
  state, patch the cache from that push instead of refetching
- Surface failures. A caught error at a mutation boundary either renders in the UI or raises a
  notification — never swallowed into a silent no-op

## Styling

- **Tailwind first.** Reach for a utility class before a Mantine `style` prop, and before either,
  check whether the Mantine component already has a prop for it
- Promote a recurring value to a theme token in `app/theme.ts` before inlining it a third time
- Mantine components are the building blocks. Never fork one to change its behaviour — wrap it in
  `app/shared/` and add the prop

## Conventions

- **Object params over positional** when two or more params share a type:

  ```ts
  // BAD
  const linkMachineToUser = (machineId: string, userId: string) => {}
  // GOOD
  const linkMachineToUser = (opts: { machineId: string; userId: string }) => {}
  ```

- **Generic helpers live in `app/shared/`, never beside the caller.** A pure helper typed only in
  primitives/generics goes in shared utils and is exported through its barrel — not as a
  module-private function next to the first business logic that needs it. A helper that depends on a
  slice's own convention belongs in that slice's `lib/`
- Named exports everywhere except route components, which React Router requires as default exports
- Files are `kebab-case.ts`/`kebab-case.tsx`; components are `PascalCase`; hooks are `use-*.ts`
- Cross-slice imports use the `~/` alias; relative imports only within the same slice folder
- Types are imported as types (`import { type Machine }`) — the lint rule enforces the inline form
- **`any` is banned outright**, explicit or inferred. Reach for `unknown` plus a Zod parse at the
  boundary instead
- Formatting (tabs, single quotes, no semicolons, blank line before `return`) is enforced by ESLint,
  not by opinion — run `pnpm lint:fix` rather than hand-formatting

## Preflight

`pnpm preflight` runs `typecheck` → `lint:fix` → `test` → `dup` (jscpd). **Run it before you call any
piece of work done**, and leave it green — not "green except for a known failure". Individually:
`pnpm typecheck` (runs `react-router typegen` first, so generated route types are current),
`pnpm lint`, `pnpm test`, `pnpm dup`.

Lint is a **two-tier policy** documented at the top of `eslint.config.js`: complexity rules (Tier 1)
are never switched off for production code, size rules (Tier 2) are exemptible per shape. Exemptions
are granted exactly two ways — a glob in `eslint.config.js` with the reason stated, or a one-off
`// eslint-disable-next-line <rule> -- <reason>`. Silencing a Tier 1 rule instead of refactoring is
not one of them.

## Testing

- **The test gate — no test is the default.** Before writing any unit test, answer three questions
  about the code under test. **(1) Can it break on its own?** — could it fail for a reason other than
  someone deliberately editing the declaration it mirrors: a branch, a boundary, ordering, parsing,
  math, a derived value, a state transition, an async or error path, an invariant spanning two files.
  **(2) Is it fragile?** — many branches or edge cases, several callers depending on it, or rules a
  future reader would not infer from the code. **(3) Is a silent break critical?** — wrong data
  rendered or written, a credential or token path, a connection/lifecycle path, data loss. Write the
  test only when **(1) is yes AND (2) or (3) is yes**. Otherwise write none and say which question
  failed. Coverage is not a goal and "this file has no test" is not a defect. That rules out tests for
  design tokens and theme files, config and requirement tables, barrels, exact UI copy, thin wrappers,
  and components that only render their props. When you meet such a test, delete it rather than
  update it
- **Never weaken a test to make it pass.** A red test is a finding. Do not loosen an assertion, widen
  an expected range, stub out the thing under test, `.skip` it, or delete it because it is in the way —
  fix the code, or explain why the test's expectation was wrong and change it deliberately. Deleting a
  test is legitimate in exactly one case: it fails the gate above and never should have been written
- Tests live beside the code as `<file>.test.ts` and run under Vitest (`pnpm test`)

## Engineering docs

When you create a module a reader cannot understand from the code alone — a state machine, a reducer,
a reconnect/subscription flow, a multi-step async flow, a non-obvious invariant — write a
`<module>.md` beside it, or a `README.md` for a folder that only makes sense as a whole. Cover **why
it is shaped this way, the invariants that must hold, what breaks if you change them, how its failure
modes surface, and what was tried and rejected**. Never restate the API: the signatures are the API,
and a doc that paraphrases them rots on the first refactor while looking authoritative. Update the
doc in the **same commit** as the change that invalidates it — a stale engineering doc is worse than
none, because it gets believed.

## HARD RULES

- **NEVER LEAVE A COMMENT THAT NARRATES THE CODE** — no restating what a line plainly does, no section
  banners, no changelog or attribution notes, no commented-out code, no TODOs. The single exception: a
  short comment explaining WHY a non-obvious guard or defensive check exists, when a reader could not
  recover that from the code alone
- **NEVER PUT ANY CO-AUTHORS WHEN COMMITTING CODE - DO IT LIKE THE ENGINEER WOULD DO IT BY THEMSELVES**
- **WHEN REPORTING INFORMATION TO ME, BE EXTREMELY CONCISE AND SACRIFICE GRAMMAR FOR THE SAKE OF CONCISION**
