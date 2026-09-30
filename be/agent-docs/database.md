# Database

Postgres via Drizzle ORM (`drizzle-orm/postgres-js` over the `postgres` driver). Schema in
`src/services/drizzle/schema.ts`. Migrations in `drizzle-out/`, managed by `drizzle-kit`. Nothing but
this service talks to the database.

## Connection

`getDb({ databaseUrl, logsEnabled })` in `src/services/drizzle/drizzle.service.ts` builds the client
and is decorated as `fastify.db` in `build-server.ts`:

```ts
drizzle({
	casing: 'snake_case',
	logger: opts.logsEnabled,                                   // on when NODE_ENV is local
	client: postgres(opts.databaseUrl, { prepare: false, max: 5 })
});
```

- The connection string is the validated `DATABASE_URL`
- The same file exports `Db` and `DbOrTx` — the type repos are built against, so one repo serves a
  plain call and a transactional one ([repos.md](./repos.md))
- Repos receive `db` or a `tx` through their factory; nothing else builds a client

## Schema conventions

Every table is a `pgTable` exported from `schema.ts` under its plural camelCase name (`machines`,
`projectMembers`, `planMessages`). Follow the existing tables:

```ts
export const machines = pgTable(
	'machines',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		status: text().$type<MachineStatus>().notNull().default('pending'),
		capabilities: jsonb().$type<PreflightCheck[]>(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('machines_project_id_idx').on(table.projectId)]
);
```

- **`casing: 'snake_case'`** is set in both `drizzle.config.ts` and `getDb`. Columns are camelCase in
  TS, snake_case in the database — never pass explicit column-name strings
- **Ids are `text` primary keys minted by `idService`** with a per-entity prefix (`m_`, `prj_`,
  `bld_` …, `src/services/ids/id.service.ts`). No database-generated UUIDs; a new table gets a new
  `create<Entity>Id` there. (`users.subId` is a `uuid` only because it is Supabase's id)
- **Status/role/kind columns are `text().$type<Union>()`**, never `pgEnum`. The union comes from the
  domain schema in `src/types/` (`MachineStatus`, `ProjectRole`), so extending it is a Zod change,
  not a migration. The `$type` import is the one place `schema.ts` depends on `src/types/`
- **jsonb** columns carry `.$type<T>()` of the domain type, and the repo re-parses them through Zod
- **Timestamps** are `timestamp({ withTimezone: true })`; `createdAt` is `.notNull().defaultNow()`
- **Ownership lives in foreign keys** — a project-owned table references `projects.id` with
  `onDelete: 'cascade'`. Add a `<table>_project_id_idx` when the `*Owned*` queries filter on it
  (`machines_project_id_idx`)
- **Invariants go in the schema when the database can hold them.** A partial unique index is the
  guard, not a check in code: `builds_live_plan_key` allows one live build per plan,
  `bugfix_sessions_running_build_key` one running session per build
- **Never store a plaintext credential.** Machine keys and webhook secrets are stored as hashes, PATs
  encrypted (`pat-encryption.service.ts`), GitHub installation tokens not at all. Env-set values and
  session secrets stay on the machine — the columns hold key names only
- Keep the table in step with its Zod schema in `src/types/` — the repo parses rows through it
- Explain a non-obvious table or column with a short why-comment above it; `schema.ts` already does
  this for ownership and design decisions

## Migrations

Config in `drizzle.config.ts` (output `./drizzle-out`, credentials `DIRECT_URL || DATABASE_URL`).

| Command | Purpose |
| --- | --- |
| `pnpm db:migration:generate` | Generate SQL from schema changes |
| `pnpm db:migration:run` | Apply pending migrations |
| `pnpm db:migration:studio` | Open Drizzle Studio |

- **Always generate** — never hand-write migration SQL. If the output is wrong, fix `schema.ts` and
  regenerate
- **Apply what you generated** with `pnpm db:migration:run`. A generated-but-unapplied migration
  leaves every later session running against a schema that does not match the code
- **Never `drizzle-kit push`**, and never edit or delete a migration that has already been applied
- Commit the generated `.sql` and its `meta/` snapshot and journal alongside the schema change
- Connect on the **direct** port, not a transaction-mode pooler — `drizzle-kit migrate` fails against
  pgbouncer in transaction mode. `DIRECT_URL`, when set, is what `drizzle.config.ts` migrates with
- Production migrations are applied from your machine before a deploy, by `pnpm deploy` — see
  CLAUDE.md § Deployment
