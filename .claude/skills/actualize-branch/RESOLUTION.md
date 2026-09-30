# Conflict resolution — classification and ask protocol

## Read before deciding

For every conflicted file:

```bash
git log --oneline $BP..origin/main -- <file>   # why main changed it
git log --oneline $BP..HEAD -- <file>          # why the branch changed it
git diff $BP origin/main -- <file>
git diff $BP HEAD -- <file>
```

A conflict hunk is unreadable without both intents. Never resolve from the marker block alone, and never `git checkout --ours/--theirs <file>` — that discards one side wholesale, which is the exact failure this skill exists to prevent.

## Mechanical — resolve yourself

Both sides' intent survives intact in the result:

- **Disjoint additions in one region** — both added imports, both added a case to a `Record`, both appended a route/column/enum member/frame schema. Keep both, in the file's existing order (alphabetical if that's the convention).
- **Main reformatted / renamed, branch edited the body** — apply the branch's body change under main's new name and formatting.
- **Lockfiles** — each package has its own (`be/pnpm-lock.yaml`, `fe/pnpm-lock.yaml`, `agent/pnpm-lock.yaml`). Take main's, then re-resolve against the merged `package.json`: `git checkout origin/main -- <pkg>/pnpm-lock.yaml && (cd <pkg> && pnpm install --lockfile-only)`. Never hand-merge a lockfile.
- **Generated files** — `be/drizzle-out/**` follows [MIGRATIONS.md](MIGRATIONS.md). `fe/app/theme.css` is generated from `fe/app/theme.ts` by the vite plugin: resolve `theme.ts`, then regenerate (`cd fe && pnpm build`) rather than merging the CSS. Say in the report that you regenerated.
- **`agent/package.json` `version`** — both sides bumped it. Take main's and add one patch when the merged result still differs from main under `agent/`; the version is the only way a machine is offered the change.
- **Pure whitespace / import ordering** — lint fixes it in preflight; take either and move on.
- **One side deleted a file the other only reformatted** — deletion wins.

## Semantic — ask, always

Both sides changed the same behaviour and the results are not composable. Symptoms:

- Same function, same lines, different logic on each side.
- Main deleted or moved something the branch built on top of.
- Both sides changed the same constant, threshold, default, permission (leader vs developer), status transition, or validation rule to different values.
- The branch's feature depends on a contract main changed (schema field renamed, response shape reshaped, hook signature changed, a WebSocket frame reshaped).
- A wire schema conflicted on one side of a mirrored pair (`be/src/types/*-frames.ts` ↔ `agent/src/*-frames.ts`, `protocol.ts` ↔ `protocol.ts`) — whatever you pick must be applied to both sides identically.
- Either side's change looks like it was driven by a plan's acceptance criterion or key decision, a verify fix, or a memory ruling — a wrong pick here quietly reverts reviewed work.
- Resolving would drop a test, an error code, a migration, or an engineering-doc update (`<module>.md` / `README.md`) from either side.

## Ask protocol

Batch related hunks into one `AskUserQuestion` — do not interrupt per marker. Per question:

- **Header** — the file (short).
- **Question** — what the two sides each want, in one sentence each.
- **Options** — `Take main's`, `Take the branch's`, `Combine (<how>)` when a real combination exists. Put the recommended one first, labelled `(Recommended)`, with a one-line reason.
- **Preview** — the actual resolved code for that option, so the user compares code, not prose.

Apply exactly what they pick. If they pick "Other" and describe something, restate it in one line before applying. Record every answer for the Step 10 report.

## After the file is resolved

```bash
git add <file>
```

Then re-read the resolved region once as whole code, not as a merge result: does the file still compile in your head, are both features still reachable, did an import go missing? Conflicted files are the top source of Step 5–7 findings — carry anything suspicious forward rather than fixing it half-way here.
