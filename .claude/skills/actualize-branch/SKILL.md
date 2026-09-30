---
name: actualize-branch
description: Bring the checked-out feature branch up to date with main as if it had been cut from today's main — merge origin/main in, resolve the conflicts, regenerate colliding drizzle migrations, port fixes main gained after the branch point, adopt main's renames/API moves, unify code the branch duplicated, drop what the merge orphaned, then get preflight green and commit. Use when a bosun/plan/* branch has fallen behind main, when a branch is full of merge conflicts, or when the user asks to actualize, refresh, catch up, sync, or update a branch from main before merging it.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Skill, AskUserQuestion
---

# Actualize a branch against main

The user reviews and merges bosun's plan branches (`bosun/plan/<n>-<slug>`) one at a time. The last branch in the queue is stale: it conflicts with main, misses fixes the user made while reviewing the earlier branches, re-implements things main now has, and still calls APIs main renamed. This skill makes it look like it was cut from today's main.

**Core rule: never resolve an ambiguity silently.** Mechanical merges are yours to make; anything where both sides carry real intent goes to the user through `AskUserQuestion` before a line is written. A wrong guess here is a silent regression in someone else's reviewed feature.

## Step 1 — Preconditions and ledger

```bash
git status --porcelain            # must be empty; if not, STOP and ask (stash / commit / abort)
git rev-parse --abbrev-ref HEAD   # feature branch, never main
git fetch origin
BP=$(git merge-base HEAD origin/main)
git log --oneline $BP..origin/main            # what main gained since the branch point
git diff --name-status $BP..origin/main       # main-side file set
git diff --name-status $BP..HEAD              # branch-side file set
git log --oneline $BP..HEAD                   # what this branch is
```

The **union** of the two file sets is the sweep scope for Steps 4–7. Record it — every later step is scoped to it, not to conflicts alone and not to the whole repo.

Read the branch's driving plan. Its commits are `<Plan title> — slice <k>: <slice title>`, and the branch's PR carries the plan: `gh pr list --head <branch> --state all --json number,title,body` — the body links the plan in bosun and lists its `## Acceptance criteria` and `## Decisions taken`. If a GitHub `plan` issue or a `plans/NNN-*.md` design plan covers the feature, read that too. You need its intent to judge conflicts.

## Step 2 — Merge

```bash
git merge origin/main            # no --squash, no rebase; a merge commit is wanted
git diff --name-only --diff-filter=U
```

If the merge is clean, still do Steps 4–7 — a clean textual merge is exactly where semantic drift hides.

## Step 3 — Resolve conflicts

Per-file, with both sides read in full. See [RESOLUTION.md](RESOLUTION.md) for the classification (mechanical → resolve; semantic → ask) and the ask protocol. Never `--ours`/`--theirs` a whole file.

## Step 4 — Drizzle migration collisions

If `be/drizzle-out/**` appears in either diff, follow [MIGRATIONS.md](MIGRATIONS.md). Migrations are generated artifacts here: take main's `be/drizzle-out/`, drop the branch's own migration, and regenerate it from the merged `be/src/services/drizzle/schema.ts` with `pnpm db:migration:generate`. Ask before applying — and never discard a migration already applied to any database.

## Step 5 — Port fixes main gained after the branch point

For each commit in `$BP..origin/main` that touches a file, module, or pattern this branch also touches: read the commit, state what defect it fixed, then check whether the branch's *new* code carries the same defect. The build session wrote that code before the fix existed, so it usually does.

Apply the same fix to the branch's code. Evidence-driven only — a commit you cannot tie to concrete branch code is not a finding. If the fix's correct shape in the branch's context is not obvious, ask.

## Step 6 — Adopt main's renames and API moves

Where main renamed or moved a symbol, file, route, schema, frame type, or prop that the branch still uses under the old name, rewrite the branch's callers. Grep the union scope — across `agent/`, `be/` and `fe/` — for every old identifier main deleted; a name that survives only inside branch-authored code is a compile-time or run-time break waiting for you. Wire-protocol names (`be/src/types/*-frames.ts`, `protocol.ts` and their `agent/src/` mirrors) are matched by string at run time, so a stale one will not fail typecheck. Mechanical rename → apply. Rename that also changed the signature's meaning → ask.

## Step 7 — Unify duplicates, then drop the dead

**Duplicates:** build sessions grow helpers main also grew. Compare branch-added exports against main-added exports in the union scope for same-purpose pairs (same behaviour, different name/location) — check `be/src/utils/general.ts`, `fe/app/shared/lib/`, `fe/app/shared/ui/` and `agent/src/utils.ts` first. Collapse to main's version and repoint the branch's callers — main's copy is the reviewed one. Non-identical behaviour → ask which wins.

**Dead code:** run the `find-dead-code` skill scoped to the union set. It reports, never deletes. Delete only what the merge itself orphaned: code this branch replaced, code main deleted that only branch code referenced, exports left with no caller after Steps 5–7. Pre-existing dead code that neither side touched is out of scope — report it, leave it.

## Step 8 — Preflight

Only for the package(s) the merged result touches. Node 24.15 (each package's `.nvmrc`) + pnpm 11.8.

```bash
cd be && nvm use && pnpm preflight      # typecheck + lint:fix + vitest + jscpd
cd fe && nvm use && pnpm preflight      # typecheck (react-router typegen) + lint:fix + vitest + jscpd
cd agent && nvm use && pnpm preflight   # typecheck + vitest + build
```

Fix until clean. Never skip, comment out, or weaken a test to get green — fix the code, or fix the test and say which. Tests main added that the branch's code now breaks are Step 5 findings, not test bugs.

**Agent version.** If the merged result differs from `origin/main` under `agent/`, `agent/package.json` `version` must be a patch above main's — machines only pick up agent changes through a new version. Set it to main's version + 1 patch.

## Step 9 — Commit

Commit the merge — do **not** push, the user reviews first.

```bash
git add -A
git commit   # merge commit; see message shape below
```

Message shape — no `Co-Authored-By` trailer (`be/CLAUDE.md` / `fe/CLAUDE.md` hard rule):

```
Integrate main into <branch>: actualize

Conflicts resolved: <n> files. Migrations regenerated: <old → new tag, or none>.
Ported from main: <one line per fix>. Renames adopted: <symbols>.
Unified: <duplicate → survivor>. Removed: <orphaned code>. Agent: <old → new version, or untouched>.
```

## Step 10 — Report

Tell the user, briefly:

1. **Judgement calls** — every ambiguity, what they chose, what was applied.
2. **Silent-drift catches** — Step 5/6/7 changes made outside any conflict. These are what they cannot see in a conflict diff, so name each one with its file.
3. **Preflight** — pass, or the exact failures verbatim.
4. **Left alone** — anything deliberately untouched, with the reason.
5. `git diff origin/main...HEAD --stat` — the branch's net contribution, so they can sanity-check the size.
