# Repos

Repositories are the **only** layer that touches the database. Drizzle ORM only. Each repo is a
**factory** that closes over a `db` (or transaction) handle and returns an object of query methods.
All of them are assembled in `src/repos/index.ts`.

References: `src/services/drizzle/schema.ts` (tables), `src/services/drizzle/drizzle.service.ts`
(`Db`, `DbOrTx`), `src/types/<Entity>Schema.ts` (row schemas)

## The factory pattern

`src/repos/<domain>/<entity>.repo.ts` (domains today: `azure`, `builds`, `github`, `machines`,
`notifications`, `onboarding`, `plans`, `projects`, `quick-fixes`, `users`) exports `getXRepo(db)`
and the type `XRepo = ReturnType<typeof getXRepo>`. There is no separate interface file — the
factory's return type **is** the contract, and consumers import the type from the repo file.

```ts
// src/repos/notifications/push-subscription.repo.ts
const columns = {
	id: pushSubscriptions.id,
	userId: pushSubscriptions.userId,
	endpoint: pushSubscriptions.endpoint,
	…
};

export function getPushSubscriptionRepo(db: DbOrTx) {
	return {
		async deleteByEndpoint(opts: { userId: string; endpoint: string }): Promise<boolean> {
			const rows = await db
				.delete(pushSubscriptions)
				.where(and(eq(pushSubscriptions.userId, opts.userId), eq(pushSubscriptions.endpoint, opts.endpoint)))
				.returning({ id: pushSubscriptions.id });

			return rows.length > 0;
		},

		async listByUserIds(userIds: string[]): Promise<PushSubscription[]> {
			if (userIds.length === 0) {
				return [];
			}

			const rows = await db.select(columns).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));

			return rows.map((row) => PushSubscriptionSchema.parse(row));
		}
	};
}

export type PushSubscriptionRepo = ReturnType<typeof getPushSubscriptionRepo>;
```

Because the object literal is the type, **annotate every method's params and return type** — there
is no interface to infer them from.

## Registration & access

`src/repos/index.ts` builds every factory in `getRepos(db)` and exports `Repos`.

- **Request scope** — `build-server.ts` decorates `fastify.repos = getRepos(db)`. Routes read
  `fastify.repos.machineRepo` and inject it; deps builders like `lineDeps(fastify)` do the same
- **Transaction scope** — inside `db.transaction(async (tx) => …)` the controller builds just the
  repos it needs from `tx` (`getProjectMemberRepo(tx)`). See [controllers.md](./controllers.md)

## Hard Rules

### Type the handle `DbOrTx` so the repo can run in a transaction

`DbOrTx` (from `drizzle.service.ts`) accepts both the pool client and a transaction handle. Every
repo takes it except `machine.repo.ts` and `project.repo.ts`, which take `Db` and so cannot be built
from a `tx` yet — widen one to `DbOrTx` the first time a transaction needs it.

### One method = one query

A method issues exactly one statement. Read-then-write, delete-then-insert or branching across
queries is orchestration and belongs in a controller, inside a transaction. An empty-input guard
that returns early without querying (`listByUserIds([])`) is fine — `inArray` with an empty list and
`insert().values([])` both fail.

### Parse every returned row through its Zod schema

`XSchema.parse(row)` for one, `rows.map((row) => XSchema.parse(row))` for many. This catches drift
between `schema.ts`, the `$type<...>()` on a jsonb column and the domain schema at the boundary, so
callers can trust the type. Skip it only for scalars (a boolean "did it delete", a count, a
`{ id }` returning).

### Select an explicit column map, not the whole row

Each repo declares its projection once (`columns`, `publicColumns`) and uses it for
`.select(columns)` and `.returning(columns)`. The reason is secrets: `machines` carries
`enrollmentToken` and `machineKeyHash`, which `publicColumns` leaves out, so no read of a machine can
leak them by accident. A method that genuinely needs a secret column selects it in its own narrow
projection with its own return type (`findAuthByKeyHash`).

### Return the row from mutations, never re-read

Insert/update/delete use `.returning(columns)` and return the parsed row, `null` when nothing
matched, or a boolean. A controller never chains a `SELECT` after a write. `null` becomes a `404` in
the controller (`orNotFound`).

### Put project scope in the query

A browser-reachable read or write takes `projectId` and filters on it in the `where` — the `*Owned*`
methods (`machineRepo.getOwnedById`, `deleteOwned`, `listOwned`). The scope is part of the query, not
a check the controller might forget. An unscoped method (`machineRepo.getById`) exists only for a
caller whose ownership is established elsewhere and says so in a comment.

### Method names are verbs on the repo, not repeated entity names

The repo is always called through its name (`machineRepo.create`, `planRepo.getOwnedById`), so
methods are `create`, `listOwned`, `markOnline` — not `createMachine`. Suffix the scoping or the
condition when it matters: `getOwnedById` vs `getById`, `clearRepositoryIf`, `markClonedIf`.

### Push conditions into SQL

When a write must only happen in a state, make the `where` say so rather than reading first.
`machineRepo.consumeEnrollmentToken` puts "unused and unexpired" in its `where`, so two racing
enrollments cannot both win; `reachabilityStatus` leaves a `paused` row paused inside the `update`
itself.
`sql\`...\`` is fine for what Drizzle helpers cannot express; prefer `eq`, `and`, `inArray`, `isNull`,
`gt` otherwise.

### Batch reads with `inArray`

Provide a list method (`listByUserIds`) rather than making callers loop a by-id lookup.

### Repos import only declarations and services

`eslint-plugin-boundaries` allows a repo to import `src/types`, `src/utils`, `src/api/errors` and
`src/services` (for `schema.ts` and the `Db` types). Never a controller or a route, and never a
route schema — a repo's types come from `src/types/`.

### Register new repos

Add every factory to `getRepos` in `src/repos/index.ts` (the only file at the `src/repos/` root) so
it reaches `fastify.repos`. If the line or onboarding needs it, add it to `LineDeps` /
`OnboardingDeps` too.

### No tests for repos

Per the test gate in CLAUDE.md, a repo test mostly re-asserts Drizzle. Don't write one.
