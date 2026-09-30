# Bosun Frontend — Agent Orchestrator

React Router v7 (framework mode, **SPA** — `ssr: false`, no server runtime), Mantine v9, Tailwind v4,
TanStack Query v5, Mantine Form + Zod, axios. Architecture: capped Feature-Sliced Design, path alias
`~/*` → `./app/*`. Dev server on **127.0.0.1:5373**.

There is no client-side database. Everything the UI shows comes from the bosun backend at
`VITE_API_URL` (**127.0.0.1:1506** locally, and it must be `127.0.0.1`, not `localhost`), read over
REST and pushed over a WebSocket that patches the React Query cache instead of polling.

Authentication is the one exception. `supabase-js` owns the whole session lifecycle — sign-in,
storage and silent refresh — and `app/shared/api/supabase.ts` is the only module that creates the
client; only sign-in/out, the session listener and the axios interceptor call it. There is no
sign-up: accounts exist because a project leader created them, so the app has a login screen and
nothing else. Every REST call carries the access token via an axios request interceptor, and the
WebSocket is opened with a single-use ticket fetched over REST. Nothing else reads or writes a
token, and supabase-js is never used for data.

Everything the app reads belongs to a **project**, and the active one travels in the `X-Project-Id`
header set by the same interceptor (`app/shared/api/active-project.ts`). Every project-scoped query
key carries that project id, so switching project cannot serve the previous one's rows out of cache.
A membership is `leader` or `developer`; `useActiveProject().isLeader` is what hides machine
management, and the backend refuses it regardless. `isAppOwner` (from `/me`) gates the projects
screen the same way.

## Read before you build (proactive disclosure)

The detail lives in `agent-docs/`. This file is the index, not the manual: **before working in an
area, open the matching doc and follow it** — don't infer the rules from the summary above, and
don't preload docs you don't need. When a task spans several areas, read each relevant doc before
touching that part.

| If the task touches… | Read first |
|---|---|
| Building anything — where code goes, layers, import direction, barrels; **routes you to the right slice file** | `agent-docs/architecture.md` |
| Then, per slice you're building | `agent-docs/slice-{shared,entities,features,widgets,views}.md` (opened via `architecture.md`) |
| Fetching or mutating data, the axios client, Zod parsing, query keys, auth, the active project, forms | `agent-docs/data-layer.md` |
| Anything pushed over the socket — socket providers, frame schemas, patching the cache from a push | `agent-docs/realtime.md`, then `app/shared/api/ui-socket.md` / `app/entities/plan/model/plan-stream.md` |
| Routes, layouts and guards, `+types/` imports, nav links | `agent-docs/routing.md` |
| `root.tsx`, providers, `entry.client.tsx`, the service worker, build/test config | `agent-docs/app-setup.md` |
| Any visual or UI work — Mantine vs Tailwind, tokens, colors, toasts, mobile | `agent-docs/styling.md` |
| Naming, params, exports, imports, TypeScript, formatting, React, state | `agent-docs/conventions.md` |

## Always-on rules

- **FSD import direction and barrel-only imports are enforced by lint.** `eslint-plugin-boundaries`
  in `eslint.config.js` allows `views → widgets → features → entities → shared` only — never upward,
  never between two slices of the same layer (bar two named entity pairs stated in `FSD_POLICIES`)
  — and a cross-slice import must go through the target slice's `index.ts` (tests are exempt from
  the barrel rule, not the direction rule). A boundaries error means the code is in the wrong layer;
  move it, don't silence it. Details in `agent-docs/architecture.md`.
- **Object params over positional** when two or more params share a type:

  ```ts
  // BAD
  const linkMachineToUser = (machineId: string, userId: string) => {}
  // GOOD
  const linkMachineToUser = (opts: { machineId: string, userId: string }) => {}
  ```

- **Generic helpers live in `app/shared/lib/`, never beside the caller.** A pure helper typed only in
  primitives/generics goes in `app/shared/lib/<name>.ts` and is exported through
  `app/shared/lib/index.ts` — not as a module-private function next to the first business logic that
  needs it. Read that barrel before writing one; it probably exists. A helper that depends on a
  slice's own convention belongs in that slice's `lib/`. Full rule in `agent-docs/slice-shared.md`.
- **Zod is the type for backend data.** Every response is fetched as `unknown` and parsed with the
  owning entity's schema; the type is `z.infer` of that schema. Never hand-write a response shape.
  **`any` is banned outright**, explicit or inferred. Full rule in `agent-docs/data-layer.md`.
- **Query keys are declared once**, in the entity's `<noun>Keys` factory, never inlined at a call
  site — a key typed twice is a cache that invalidates half the time. After a mutation, update the
  affected keys explicitly; where the backend pushes the new state, patch the cache from the push
  instead of polling.
- **Surface failures.** A caught error at a mutation boundary either renders in the UI or raises a
  notification (`notifyError`) — never swallowed into a silent no-op.
- **Tailwind first** for layout and spacing, after checking whether the Mantine component already
  has a prop for it. Promote a recurring value to a token in `app/theme.ts` before inlining it a
  third time. Never fork a Mantine component to change its behaviour — wrap it in `app/shared/ui/`
  and add the prop. Every screen must work on a phone. Full rules in `agent-docs/styling.md`.
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
  update it. Tests live beside the code as `<file>.test.ts` and run under Vitest (`pnpm test`).
- **Never weaken a test to make it pass.** A red test is a finding. Do not loosen an assertion, widen
  an expected range, stub out the thing under test, `.skip` it, or delete it because it is in the way —
  fix the code, or explain why the test's expectation was wrong and change it deliberately. Deleting a
  test is legitimate in exactly one case: it fails the gate above and never should have been written.
- **Engineering docs for what the code cannot say.** When you create a module a reader cannot
  understand from the code alone — a state machine, a reducer, a reconnect/subscription flow, a
  multi-step async flow, a non-obvious invariant — write a `<module>.md` beside it, or a `README.md`
  for a folder that only makes sense as a whole. Cover **why it is shaped this way, the invariants
  that must hold, what breaks if you change them, how its failure modes surface, and what was tried
  and rejected**. Never restate the API: the signatures are the API, and a doc that paraphrases them
  rots on the first refactor while looking authoritative. Update the doc in the **same commit** as the
  change that invalidates it — a stale engineering doc is worse than none, because it gets believed.
  The same goes for `agent-docs/`: a change that makes one of them wrong updates it in that commit.
- Formatting (tabs, single quotes, no semicolons, blank line before `return`) is enforced by ESLint,
  not by opinion — run `pnpm lint:fix` rather than hand-formatting.

## Preflight

`pnpm preflight` runs `typecheck` → `lint:fix` → `test` → `dup` (jscpd). **Run it before you call any
piece of work done**, and leave it green — not "green except for a known failure". Individually:
`pnpm typecheck` (runs `react-router typegen` first, so generated route types are current),
`pnpm lint`, `pnpm test`, `pnpm dup`.

Lint is a **two-tier policy** documented at the top of `eslint.config.js`: complexity rules (Tier 1)
are never switched off for production code, size rules (Tier 2) are exemptible per shape. Exemptions
are granted exactly two ways — a glob in `eslint.config.js` with the reason stated, or a one-off
`// eslint-disable-next-line <rule> -- <reason>`. Silencing a Tier 1 rule instead of refactoring is
not one of them, and neither is silencing a boundaries rule.

## HARD RULES

- **NEVER LEAVE A COMMENT THAT NARRATES THE CODE** — no restating what a line plainly does, no section
  banners, no changelog or attribution notes, no commented-out code, no TODOs. The single exception: a
  short comment explaining WHY a non-obvious guard or defensive check exists, when a reader could not
  recover that from the code alone
- **NEVER PUT ANY CO-AUTHORS WHEN COMMITTING CODE - DO IT LIKE THE ENGINEER WOULD DO IT BY THEMSELVES**
- **WHEN REPORTING INFORMATION TO ME, BE EXTREMELY CONCISE AND SACRIFICE GRAMMAR FOR THE SAKE OF CONCISION**
