# Data layer

There is no client-side database. Everything the UI shows comes from the bosun backend at
`VITE_API_URL` (**127.0.0.1:1506** locally — `127.0.0.1`, not `localhost`), read over REST with
axios and kept live by pushes over one WebSocket that patch the React Query cache (`realtime.md`).
Supabase is **auth only**.

## `shared/api/`

```
shared/api/
├── api-client.ts      # the axios instance + its two interceptors
├── supabase.ts        # the supabase-js client — session lifecycle only
├── active-project.ts  # the active project id store (memory + localStorage)
├── ui-socket.ts       # the one WebSocket → realtime.md, ui-socket.md
├── ui-ticket.ts       # POST /ui/ticket — the socket's single-use credential
├── ws-url.ts          # VITE_API_URL → ws(s):// url
└── index.ts
```

Domain code never lives here: every fetcher, key and hook belongs to an entity or a feature.

## `apiClient`

One axios instance, `baseURL: import.meta.env.VITE_API_URL`. Its interceptors are the only code that
touches a token or the project header:

- **Request** — `supabase.auth.getSession()` (which refreshes an expired token before returning it)
  → `Authorization: Bearer <access_token>`; then `X-Project-Id` from `getActiveProjectId()`. No call
  site sets either header, and none may.
- **Response error** — on `401` the backend has said the token belongs to nobody (deleted or revoked
  account), so the interceptor signs out locally, which flips the app to the login screen. Every
  error is re-thrown; the interceptor shows nothing.

There is no response unwrapping and no generated OpenAPI typing: callers destructure `{ data }` and
parse it.

## Types: Zod at the boundary

Every response is fetched as `unknown` and parsed with the owning entity's schema. The schema is the
single source of the type.

```ts
// app/entities/machine/model/machine.ts
export const MachineSchema = z.object({
	id: z.string(),
	status: MachineStatusSchema,
	lastSeenAt: z.iso.datetime().nullable(),
	// Nullish, not nullable: a backend that predates env sets omits the field,
	// and failing the whole machine parse over it would blank the page.
	envSets: z.array(EnvSetSummarySchema).nullish(),
	…
})

export type Machine = z.infer<typeof MachineSchema>
```

- `apiClient.get<unknown>(…)` then `Schema.parse(data)` — never pass a concrete type argument to
  axios and trust it.
- Response envelopes are a local schema beside the fetcher (`NotificationListRespSchema`).
- A field an older backend may still omit is `.nullish()`, with the reason stated — a failed parse
  blanks the whole screen.
- Derive sub-types from the schema (`z.infer`, `Extract<UiMsg, …>`); never re-declare a literal
  union the schema already has.
- `any` is banned; `unknown` + parse is the answer.

## Query keys

One factory per noun, `<noun>Keys`, in `entities/<noun>/api/<noun>.queries.ts`. Keys are stable
identifiers, not API paths, and are **never inlined at a call site** — a key typed twice is a cache
that invalidates half the time.

```ts
// Every key carries the active project. Without it a switch shows the previous
// project's rows out of cache until the refetch lands.
export const machineKeys = {
	all: () => ['machines', getActiveProjectId()] as const,
	list: () => [...machineKeys.all(), 'list'] as const,
	detail: (id: string) => [...machineKeys.all(), 'detail', id] as const
}
```

- **Project-scoped keys start with the project id**, and `all` is a function so the id is read at
  call time. Only keys for data that is not per-project (`projectKeys`, `meKeys`) are constants.
- `all()` is the broadest invalidation target; variants extend it.

## Queries

```ts
export async function fetchMachine (id: string): Promise<Machine> {
	const { data } = await apiClient.get<unknown>(`/machines/${id}`)

	return MachineSchema.parse(data)
}

export function useMachineQuery (id: string) {
	return useQuery({ queryKey: machineKeys.detail(id), queryFn: async () => fetchMachine(id) })
}
```

- Export the `fetch*` function as well as the hook.
- A hook over a nullable id takes `string | null` and sets `enabled: id !== null`.
- The `QueryClient` (`root.tsx`) defaults to `staleTime: 60_000` and `refetchOnWindowFocus: false`:
  freshness comes from pushes, not from polling or focus refetches. Never add `refetchInterval` to
  keep something live — push it (`realtime.md`).
- Components render a query's states with `SectionLoader` / `FullPageLoader` and
  `QueryErrorAlert` from `~/shared/ui`.

## Mutations

Every write is a `useMutation` in a **feature** (`slice-features.md`). Components never call
`apiClient` directly outside an `api/` hook.

- Parse the response with the entity's schema.
- **`onSuccess` updates the cache explicitly.** When the response is the new row, patch it in with
  the entity's cache helper (`patchPlan(queryClient, plan)`); otherwise invalidate the entity's
  keys. When the backend will also push the change, patching from the response is still right — the
  push lands idempotently (`realtime.md`).
- **`onError` surfaces the failure**: `notifyError({ title: 'Could not …', error })`. A caught error
  at a mutation boundary either renders in the UI or raises a notification — never a silent no-op.
- `refetchQuery(queryClient, key)` from `~/shared/lib` is the fire-and-forget invalidate; use it
  where nothing awaits the refetch.

## Auth

`app/shared/api/supabase.ts` is the only module that creates a supabase-js client; supabase-js is
never used for data. There is no sign-up — accounts exist because a project leader created them.

- **Session** — `SessionProvider` / `useSession()` in `entities/session`, driven by
  `onAuthStateChange` (its `INITIAL_SESSION` event, so there is no `getSession()` to race).
  `status` is `loading | anonymous | authenticated`; `AppLayout` and `AuthLayout` redirect on it.
- **Sign in / out** — `useSignIn` / `useSignOut` mutations in `features/auth`.
- **Who the backend says you are** — `useMeQuery()` (`GET /me`, carries `isAppOwner`). The Supabase
  session says who signed in, not what they may do.
- **The socket** authenticates with a single-use ticket from `POST /ui/ticket`, never a token in the
  URL (`realtime.md`).

## The active project

Everything the app reads belongs to a project, carried in `X-Project-Id`.

- `shared/api/active-project.ts` holds the id in memory and in `localStorage`
  (`bosun.active-project-id`). It lives in `shared` because the interceptor and the socket both need
  it and neither may import upward.
- `ActiveProjectProvider` / `useActiveProject()` in `entities/project` resolves the stored id
  against the caller's memberships (falling back to the first), and exposes `role` and `isLeader`.
  A membership is `leader` or `developer`; `isLeader` is what hides machine management, and the
  backend refuses it regardless.
- **Switching is a full document load** to `projectSwitchPath(...)`, not a re-render: in-flight
  requests, detail queries and the socket's plan subscriptions all belong to the project being left.
- `AppLayout` renders nothing scoped until a project is resolved — the backend answers 400 to a
  scoped request without the header.

## Form-to-mutation

Mantine Form + Zod via `mantine-form-zod-resolver`'s `zod4Resolver`, `mode: 'uncontrolled'`. The
schema lives in the feature's `model/`, the form in its `ui/` modal, and submit calls the feature's
own mutation:

```ts
const form = useForm<CreatePlanForm>({
	mode: 'uncontrolled',
	initialValues: { machineId: '', input: '', verifyInUi: true, auto: false, afk: true },
	validate: zod4Resolver(CreatePlanFormSchema)
})

const submit = (values: CreatePlanForm) => {
	createPlan.mutate({ form: values, proposalId: proposal?.id ?? null }, {
		onSuccess: (plan) => {
			close()
			void navigate(`/plans/${plan.id}`)
		}
	})
}
```

Cache work stays in the hook's `onSuccess`; UI consequences (close, navigate, reset) in the
call-site `onSuccess`.
