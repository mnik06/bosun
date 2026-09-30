# Slice: `features/` — one folder per user action

> `architecture.md` routed you here. This file holds the rules for `features/<verb>/` only. The
> layout map, import direction, path alias and barrel rules stay in `architecture.md`.

## What it is

**A verb the user performs** — create a plan, delete a machine, connect Azure, answer a question,
edit env sets. The feature owns the mutation, the form and its schema, and the component that
triggers it (a button, a menu item, a modal, a switch). A feature owns a verb, not a screen.

This is the write side of the app: every `useMutation` lives in a feature.

## When to add

When the UI gains a new thing the user can *do*. Name the folder for the verb (`create-plan`,
`pause-machine`, `mark-notification-read`), not for the screen it first appears on. Two verbs that
share a form and a modal (connect / rotate / disconnect a GitHub PAT) stay in one feature.

## Folder shape

```
features/<verb>/
├── api/
│   └── use-<verb>.ts            # the useMutation hook (sometimes several: edit-env-sets)
├── model/
│   └── <verb>.ts                # form Zod schema + inferred type; feature-local hooks
├── lib/                         # pure helpers for this verb (parse-env-text, move-build)
├── ui/
│   ├── <verb>-modal.tsx         # the form, when there is one
│   └── <verb>-button.tsx        # or -menu-item.tsx, -switch.tsx: the trigger
└── index.ts                     # required
```

`ui/` is always present. A one-button feature whose mutation is three lines may declare the
`useMutation` inside its `ui/` component (`approve-plan`, `set-plan-modes`) — split it into `api/`
the moment a second component needs it.

## The mutation hook

```ts
// app/features/create-plan/api/use-create-plan.ts
async function createPlan (opts: { form: CreatePlanForm, proposalId: string | null }): Promise<Plan> {
	const path = opts.proposalId === null ? '/plans' : `/plans/proposals/${opts.proposalId}/start`
	const { data } = await apiClient.post<unknown>(path, opts.form)

	return PlanSchema.parse(data)
}

export function useCreatePlan () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: createPlan,
		onSuccess: (plan, { proposalId }) => {
			patchPlan(queryClient, plan)

			if (proposalId !== null) {
				refreshNeedsYou(queryClient)
			}
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not start planning', error })
		}
	})
}
```

- The response is parsed with the **entity's** schema — the feature never redeclares a noun's shape.
- `onSuccess` lands the result in the cache through the **entity's** `lib/<noun>-cache.ts` helpers,
  or invalidates the entity's keys. Never inline a key.
- `onError` always calls `notifyError`. Navigation and closing a modal go in the call-site
  `mutate(values, { onSuccess })`, not in the hook.

Full rules in `data-layer.md` § Mutations.

## Forms

Schema in `model/<verb>.ts`, form in the `ui/` modal, submit through the feature's own mutation. See
`data-layer.md` § Form-to-mutation.

## Destructive actions

Confirm through `confirmAction` from `~/shared/lib`, and say in the body what cannot be undone
(`features/delete-machine/ui/delete-menu-item.tsx`). Use `color="red"` on the trigger.

## Imports

`shared/` and `entities/`. **No peer features, widgets or views** — enforced by
`eslint-plugin-boundaries`. When a panel needs two features side by side, that panel is a widget.

## Barrel

`index.ts` is required: explicit named exports — usually the trigger component, sometimes the hook
for a caller that renders its own trigger.

```ts
// app/features/auth/index.ts
export { useSignIn } from './api/use-sign-in'
export { useSignOut } from './api/use-sign-out'
export { SignInSchema } from './model/credentials'
export { CredentialsForm } from './ui/credentials-form'
```
