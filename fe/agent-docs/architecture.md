# Architecture — capped FSD (router)

The frontend uses **capped Feature-Sliced Design**: five layers under `app/`, imports flowing one way
only. "Capped" means a slice is added when a real need appears, not ahead of it. Two deviations from
canonical FSD:

- There is **no FSD `app` layer**. Application setup is a handful of root files — `root.tsx`,
  `routes.ts`, `entry.client.tsx`, `theme.ts`, `app.css` (see `app-setup.md`).
- The FSD `pages` layer is named **`views/`**, and a view file **is** the route component (see
  `routing.md`).

## How to use this doc

This file is the **router**, not the manual. It carries the rules that span every slice — the
layout map, import direction, path alias, barrels — and points at the one slice doc with the rules
for what you are actually building.

1. Work out **which layer** the code belongs to (table below).
2. **Open that layer's `slice-*.md`** and follow it.
3. Come back here only for the cross-slice rules.

A change usually touches several layers — a new action is a `features/` slice that reads an
`entities/` slice and is dropped into a `widgets/` block. Open each slice doc before touching that
part.

## Which slice am I building?

| What you're adding | Layer | Open |
|---|---|---|
| Code with no domain owner — the API client, the socket, generic hooks, UI primitives wrapping Mantine, pure helpers | `shared/` | `slice-shared.md` |
| A backend noun — its Zod schema and type, query keys and fetchers, cache patchers, its socket subscriber, small components that render *that* noun | `entities/` | `slice-entities.md` |
| A user action — the mutation, its form and schema, the button/modal/menu item that triggers it | `features/` | `slice-features.md` |
| A composed block that combines entities and features into something a page drops in whole | `widgets/` | `slice-widgets.md` |
| A route — a page or a layout | `views/` | `slice-views.md` |

Not sure? Ask, in order:

1. Is it a route (page or layout)? → **view**.
2. Is it a verb the user performs — anything that writes? → **feature**.
3. Is it the shape, the reads or the pushes of one backend noun? → **entity**.
4. Does it assemble several entities/features into one panel? → **widget**.
5. Generic and domain-less? → **shared**.

## Directory layout

```
app/
├── shared/                  # owned by nobody                                → slice-shared.md
│   ├── api/                 # apiClient, supabase, active project, UI socket   → data-layer.md, realtime.md
│   ├── hooks/               # generic use-*.ts
│   ├── lib/                 # pure helpers + notifyError / confirmAction / refetchQuery
│   └── ui/                  # generic components (AppModal, Page, QueryErrorAlert, …)
├── entities/<noun>/         # machine, plan, project, repository, session, … → slice-entities.md
│   ├── api/                 # <noun>.queries.ts (keys, fetchers, useXQuery), <noun>.writes.ts
│   ├── model/               # Zod schemas + types, contexts, socket providers, stream hooks
│   ├── lib/                 # pure helpers, <noun>-cache.ts patchers
│   ├── ui/                  # presentational components for this noun
│   └── index.ts
├── features/<verb>/         # create-plan, delete-machine, edit-env-sets, … → slice-features.md
│   ├── api/                 # use-<verb>.ts mutation
│   ├── model/               # form schema, feature-local hooks
│   ├── lib/                 # pure helpers
│   ├── ui/                  # the trigger: button, modal, menu item, form
│   └── index.ts
├── widgets/<block>/         # plan-board, machine-detail, app-nav, …       → slice-widgets.md
│   ├── ui/
│   ├── lib/                 # optional: pure derivations for the block
│   ├── model/               # rare: a hook composing several entity queries
│   └── index.ts
├── views/<view>/            # one folder per route, flat, no barrel           → slice-views.md
│   └── <view>-page.tsx | <name>-layout.tsx
├── root.tsx                 # Layout scaffold + providers + ErrorBoundary     → app-setup.md
├── routes.ts                # route config                                    → routing.md
├── entry.client.tsx         # hydration + service worker wiring               → app-setup.md
├── theme.ts                 # Mantine theme (source of tokens)                → styling.md
├── theme.css                # GENERATED from theme.ts — never edit
└── app.css                  # layer order, fonts, the few global element rules
```

## Slice anatomy

Segments inside a slice, each flat (no nested folders, no nested barrels):

- **`api/`** — anything that talks to the backend: fetchers, query hooks, mutation hooks.
- **`model/`** — Zod schemas and inferred types, React contexts/providers, stateful hooks.
- **`lib/`** — pure functions (the only code that usually earns a unit test, see the test gate).
- **`ui/`** — React components.

Only create the segments a slice needs. What each layer typically has:

| Layer | `api/` | `model/` | `lib/` | `ui/` | `index.ts` |
|---|---|---|---|---|---|
| `shared/` | `shared/api/` group | — | `shared/lib/` group | `shared/ui/` group | one per group |
| `entities/<x>/` | usually | usually | when needed | when needed | required |
| `features/<x>/` | usually | when it has a form | when needed | always | required |
| `widgets/<x>/` | never | rare | when needed | always | required |
| `views/<x>/` | — flat route files only — | | | | **none** |

## Import direction

```
routes.ts / root.tsx / entry.client.tsx  →  views → widgets → features → entities → shared
```

A slice may import from the layers below it and never from its own layer or above: **peer slices
never import each other**. When two entities relate, carry the id and let a higher layer compose
them; when two widgets need each other, the view passes one into the other as a render prop.

| Layer | May import | Never |
|---|---|---|
| `shared/` | third-party only | any project layer |
| `entities/` | `shared/` | peer entities, anything above |
| `features/` | `shared/`, `entities/` | peer features, widgets, views |
| `widgets/` | `shared/`, `entities/`, `features/` | peer widgets, views |
| `views/` | everything below | peer views (nothing imports a view) |
| root files | anything | — |

**This is enforced mechanically**, not by review: `eslint-plugin-boundaries` in `eslint.config.js`
(`FSD_ELEMENTS` / `FSD_POLICIES`) fails lint on an upward or sideways import. Do not silence it — a
boundaries error means the code is in the wrong layer.

The policy has exactly two peer allowances, each a named slice pair with its reason beside it:
`entities/machine → entities/repository` (the machine socket provider patches repository caches
from the same frames) and `entities/plan → entities/machine` (bugfix admission is a rule over a
machine). Adding a third is a design decision stated in `FSD_POLICIES`, not a workaround.

## Path alias

`~/*` → `./app/*` (tsconfig `paths`, and the same alias in `vitest.config.ts`). The codebase uses
`~/` for nearly every import, including between files of the same slice:

```ts
// inside entities/machine — straight to the file, never through its own barrel
import { MachineSchema } from '~/entities/machine/model/machine'

// from another slice — only through the barrel
import { useMachinesQuery, type Machine } from '~/entities/machine'
import { notifyError } from '~/shared/lib'
```

Relative imports remain for a route's `./+types/<file>`, a test importing its subject, and a few
siblings inside `shared/`.

## Barrels

- **Every entity, feature and widget has an `index.ts`** — its public API. Explicit named exports
  only, no `export *`; types exported inline (`type Machine`) or via `export type { … }`. Anything
  not listed is private.
- **Cross-slice imports go through that barrel and nowhere else.** Reaching into
  `~/entities/plan/lib/...` from outside the plan slice fails the boundaries barrel policy.
  **Tests are exempt** from the barrel rule (they may import a slice's internals directly); the
  direction rules still apply to them.
- **Inside a slice, never import your own barrel** — go to the file. Importing the barrel from
  within is a cycle.
- **`shared/` has one barrel per group**: `~/shared/api`, `~/shared/lib`, `~/shared/hooks`,
  `~/shared/ui`.
- **Views have no barrel.** `routes.ts` references view files by path.

```ts
// app/features/create-plan/index.ts
export { useCreatePlan } from './api/use-create-plan'
export { NewPlanModal } from './ui/new-plan-modal'
export { PlanDraft } from './ui/plan-draft'
```
