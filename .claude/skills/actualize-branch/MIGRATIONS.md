# Drizzle migration collisions

Both main and the branch generate migrations from the same counter, so both claim `0040`, `0041`, … The journal and the snapshot chain conflict, and `drizzle-kit` fails quietly on a broken chain — it does not shout.

In bosun a migration is a **generated artifact**: `pnpm db:migration:generate` writes it from `be/src/services/drizzle/schema.ts`, and it is never hand-written (`be/CLAUDE.md`). So a collision is not renumbered by hand — the branch's migration is thrown away and regenerated on top of main's, which is exactly what `.bosun/project.yaml`'s `regenerate:` entry for `be/drizzle-out/**` does when bosun integrates main into a plan branch.

## Safety gate — run first

**Never discard a migration that has already been applied to any database.** Drizzle records every applied migration in `drizzle.__drizzle_migrations`; a regenerated migration carries a new tag and a new hash, so a database that already ran the old one runs the DDL a second time and fails on "already exists" — or, with a destructive statement, destroys data.

For every branch migration that collides, establish applied-vs-unapplied before touching it:

```bash
# if a DB is reachable (be/.env's DATABASE_URL — the direct port, not the transaction pooler):
psql "$DATABASE_URL" -c 'select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 20;'
```

If you cannot reach a database, **ask the user** which of the colliding migrations have been applied anywhere (local, or the database `pnpm deploy` migrates). Applied ones are not regenerated — they need a follow-up migration instead, which is the user's call, not yours. A migration applied only to the user's local database is still their call: resetting that database is an option only they can pick.

## Detect

```bash
BP=$(git merge-base HEAD origin/main)
git diff --name-only $BP origin/main -- be/drizzle-out   # main's new migrations
git diff --name-only $BP HEAD        -- be/drizzle-out   # branch's new migrations
ls be/drizzle-out/*.sql | tail -5
```

A collision is the same `NNNN` prefix used by a main migration and a branch migration with different content. Main's migrations are authoritative — they stay byte-for-byte; the branch's are regenerated.

## Regenerate

1. **Resolve `schema.ts` first.** `be/src/services/drizzle/schema.ts` must hold both sides' tables and columns before anything is generated — a generate against a half-resolved schema produces a migration that drops the other side's work.
2. **Take main's migration history** — `git checkout origin/main -- be/drizzle-out`. That restores main's SQL files, `meta/NNNN_snapshot.json` files and `meta/_journal.json` exactly.
3. **Drop the branch's own migrations** — the SQL and snapshot files that exist only on the branch (`git diff --name-only --diff-filter=A origin/main -- be/drizzle-out`). Keep a copy of their SQL in the scratchpad for step 5.
4. **Generate** — `cd be && pnpm db:migration:generate`. It writes one migration numbered after main's last, with a fresh snapshot and journal entry. If `drizzle-kit` stops to ask whether a column or table was **renamed or created**, that is a semantic question: stop and ask the user, never pick.
5. **Compare** the new SQL with the branch's old SQL, ignoring the file name. It must contain every statement the branch's migration had, and nothing of main's. A statement of main's in it means `schema.ts` lost main's change; a branch statement missing means `schema.ts` lost the branch's. Either one → go back to step 1.

Never hand-edit `_journal.json` or a snapshot's `id`/`prevId` chain to "fix" a collision — regenerate instead.

## Content conflicts inside a migration

Two migrations altering the same table are a **semantic** conflict, not a numbering one: the branch's schema change was written against the pre-main schema. Read main's migration, then check whether the branch's change still makes sense (a column it adds may now exist, a type it alters may have changed, a constraint may now reject existing rows). Ask before resolving `schema.ts` — the generated DDL follows from it, and that is how data gets lost.

## After regenerating

```bash
cd be && pnpm typecheck
```

State in the report which tag moved (`0040_mature_nicolaos → 0041_<new>`) and that the migration was **not** run — `pnpm db:migration:run` is the user's step.
