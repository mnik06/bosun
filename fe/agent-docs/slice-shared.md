# Slice: `shared/` — owned by nobody

> `architecture.md` routed you here. This file holds the rules for `shared/` only. The layout map,
> import direction, path alias and barrel rules stay in `architecture.md`.

## What it is

Code with **no domain knowledge**, usable by every layer: the transport (`api/`), generic hooks,
pure helpers, and UI primitives that wrap Mantine. It is the bottom of the graph.

## When to add

When the code would read the same in any product: it names no bosun noun (machine, plan, project,
repository …) and imports no slice. A helper that only makes sense for one noun belongs in that
entity's `lib/`; one that depends on a feature's own convention belongs in that feature's `lib/`.

## Generic helpers go here — never beside the caller

A pure helper typed only in primitives/generics (`string`, `number`, arrays, `Record`, `Blob`, …)
goes in `shared/lib/<name>.ts` and is exported through `shared/lib/index.ts` — **not** as a
module-private function next to the first business logic that needs it. A private helper is
invisible to the next slice, so it gets retyped.

Before writing one, read `shared/lib/index.ts` — it already has `formatRelativeTime`,
`formatFileSize`, `toErrorMessage`, `trimmedOrNull`/`typed`, `base64ToBytes`, `readBlobAsDataUrl`,
`saveBlob`, `submitOnEnter`, `normalizeRelativePath`, `admitFiles`, `seal`, and more. There is no
lodash in this app; do not add it for one function.

## Folder shape

```
shared/
├── api/        # apiClient, supabase, active project store, UI socket + ticket, ws url
│               #   → data-layer.md, realtime.md; engineering doc: api/ui-socket.md
├── hooks/      # use-*.ts — useNow, usePendingFiles, useWindowFileIntake, useKeyFingerprint
├── lib/        # pure helpers, plus the thin Mantine/Query side-effect helpers:
│               #   notifyError, confirmAction, refetchQuery
└── ui/         # generic components: AppModal, Page, QueryErrorAlert, SectionLoader,
                #   FullPageLoader, MarkdownBlock, ChatComposer, InlineEdit, StatusCard, …
```

There is no `shared/config/`, `shared/providers/` or `shared/types/`: providers are mounted in
`root.tsx`, the theme is `app/theme.ts`, and types live beside the Zod schema that defines them.

## The helpers every slice leans on

- **`notifyError({ title, error })`** — the red toast for a failed mutation; the message comes from
  `toErrorMessage`, which reads the backend's `{ message }` body.
- **`confirmAction({ title, body, confirmLabel, color, onConfirm })`** — the confirm dialog for a
  destructive action. Do not hand-roll a confirm modal.
- **`refetchQuery(queryClient, key)`** — fire-and-forget invalidate that swallows a failed refetch
  (the next push recovers). Used by every cache patcher.
- **`AppModal`** — every modal. It goes full-screen below `sm`; never render Mantine `Modal`
  directly.
- **`Page`** — the standard page container, title row and actions slot. Full-height screens
  (plan detail, plan draft) size against `--app-content-height` instead.
- **`QueryErrorAlert` / `SectionLoader` / `FullPageLoader`** — the error and loading states of a
  query.

## Naming

- Files `kebab-case`, one exported thing per file named after it (`format-relative-time.ts` →
  `formatRelativeTime`, `query-error-alert.tsx` → `QueryErrorAlert`).
- Hooks `use-<name>.ts`.
- No `app-` prefix convention — `AppModal` is the one wrapper named after the Mantine component
  it wraps.

## Imports

Third-party only. `shared/` never imports from `entities/`, `features/`, `widgets/` or `views/` —
`eslint-plugin-boundaries` fails it. That constraint is why the active project id lives in
`shared/api/active-project.ts` rather than in `entities/project`: the axios interceptor and the
socket both need it and neither may import upward.

## Barrel

One per group, explicit named exports:

```ts
import { apiClient, getActiveProjectId, subscribeToUiSocket } from '~/shared/api'
import { notifyError, refetchQuery } from '~/shared/lib'
import { useNow } from '~/shared/hooks'
import { AppModal, Page, QueryErrorAlert } from '~/shared/ui'
```

## Cross-references

- `shared/api/` — the client, auth, project header: **`data-layer.md`**. The socket:
  **`realtime.md`** and `app/shared/api/ui-socket.md`.
- UI primitives and styling rules: **`styling.md`**.
