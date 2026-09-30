# Slice: `views/` — one folder per route

> `architecture.md` routed you here. This file holds the rules for `views/<view>/` only. The layout
> map, import direction, path alias and barrel rules stay in `architecture.md`.

## What it is

The FSD `pages` layer, named `views/`. A view file **is** the route component registered in
`app/routes.ts` — there is no wrapper. It assembles widgets (and the odd feature trigger), owns page
layout and page-level state, and reads route params. Layout routes that guard or frame a subtree
(`app-layout`, `leader-layout`, `app-owner-layout`, `auth-layout`) are views too.

Views stay thin — most are under 30 lines. When a view grows a query with loading/error/empty states
and wired rows, that block is a widget.

## Folder shape

```
views/<view>/
└── <view>-page.tsx      # or <name>-layout.tsx; a page-local sub-component may sit in the same file
```

Flat: one route file per folder, **no `ui/` or `lib/` segment and no `index.ts`**. A page-local
helper component that nothing else uses stays in the route file (`plan-detail/plan-page.tsx` holds
`Scrolled` and `TabBody`); anything bigger moves to a widget.

## Naming

- Registered with `layout(...)` → `<name>-layout.tsx` (`views/leader-layout/leader-layout.tsx`).
- Registered with `route(...)` / `index(...)` → `<name>-page.tsx`
  (`views/machine-detail/machine-detail-page.tsx`).
- Folder is the route's name, kebab-case.

## Exports

A **default export** — React Router requires it. Route types come from the generated sibling
`./+types/<file>`:

```tsx
// app/views/machine-detail/machine-detail-page.tsx
import type { Route } from './+types/machine-detail-page'

export default function MachineDetailPage ({ params }: Route.ComponentProps) {
	return (
		<Page>
			<MachineDetail machineId={params.machineId} renderSetup={…} />
		</Page>
	)
}
```

## Guards are layouts

Access control for a subtree is a pathless layout that renders `<Navigate replace />` or
`<Outlet />`, declared once around the routes it covers in `routes.ts` — never a check inside each
page, which a new screen can be added without. `LeaderLayout` (leader-only: machines, settings,
members) and `AppOwnerLayout` (app-owner-only: projects) are the pattern. The backend refuses the
same calls regardless; the guard is UX, not security.

## Imports

Anything below: `shared`, `entities`, `features`, `widgets`. Never another view — enforced by
`eslint-plugin-boundaries`.

## Cross-references

- Route config, the layout tree, `+types/`: **`routing.md`**.
