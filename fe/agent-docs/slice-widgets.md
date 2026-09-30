# Slice: `widgets/` — composed blocks a page drops in whole

> `architecture.md` routed you here. This file holds the rules for `widgets/<block>/` only. The
> layout map, import direction, path alias and barrel rules stay in `architecture.md`.

## What it is

A **composed block** that combines entities and features into something a view drops in whole: a
list panel (`machines-list`, `plan-list`), a board (`plan-board`), a detail panel
(`machine-detail`), a tab body (`plan-chat`, `plan-execution`), the shell chrome (`app-header`,
`app-nav`). It reads through entity query hooks, renders loading/error/empty states, and places
feature triggers. No routing, no writes of its own.

A widget does **not** need a second consumer to exist — most are used by one view. What makes it a
widget is that it composes; a view file stays a thin assembly of widgets.

## When to add

When a view would otherwise hold a block of composition logic — a query, its three states, and the
features wired into the rows. Extract it so the view reads as a list of blocks.

## Folder shape

```
widgets/<block>/
├── ui/
│   ├── <block>.tsx              # the exported block
│   └── <part>.tsx               # its sub-components
├── lib/                         # optional: pure derivations (checklist, display-steps, verdict)
├── model/                       # rare: a hook composing several entity queries (use-checklist)
└── index.ts                     # required
```

## The shape of a block

```tsx
// app/widgets/machines-list/ui/machines-list.tsx
export function MachinesList ({ renderBadge }: { renderBadge?: (machine: Machine) => ReactNode }) {
	const { data, isPending, error } = useMachinesQuery()

	if (isPending) {
		return <SectionLoader />
	}

	if (error) {
		return <QueryErrorAlert title="Could not load machines" error={error} />
	}

	if (data.length === 0) {
		return <Text c="dimmed" size="sm">No machines yet. Add one to get an enrollment command.</Text>
	}

	return (
		<Stack gap="sm">
			{data.map((machine) => (
				<MachineCard key={machine.id} machine={machine} badge={renderBadge?.(machine)} />
			))}
		</Stack>
	)
}
```

## Composing two widgets: render props

Widgets never import each other. When one block must show another, it takes a render prop and the
view supplies it:

```tsx
// app/views/machine-detail/machine-detail-page.tsx
<MachineDetail
	machineId={params.machineId}
	renderSetup={(machine) => <SetupChecklist machine={machine} />}
	renderOnboarding={(machine) => <OnboardingReport machine={machine} />}
/>
```

Shell slots work the same way — `AppHeader` takes `projectSwitcher` and `needsYou` as nodes.

## Imports

`shared/`, `entities/`, `features/`. **No peer widgets and no views** — enforced by
`eslint-plugin-boundaries`.

## Barrel

`index.ts` is required: explicit named exports.

```ts
// app/widgets/setup-checklist/index.ts
export { setupChecklist, setupProgress, type ChecklistRow } from './lib/checklist'
export { SetupChecklist } from './ui/setup-checklist'
export { SetupProgressBadge } from './ui/setup-progress-badge'
```
