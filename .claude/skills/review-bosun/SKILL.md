---
name: review-bosun
description: Review the pending Bosun branch changes for plan conformance, code-convention compliance, dead code left behind, and a clean preflight. Verifies EVERY acceptance criterion and design-plan rule the change touches is actually met, that agent/, be/ and fe/ conventions are honored, that the change orphaned no code, and that typecheck + lint + tests pass — then reports critical issues concisely. Code review only: the browser pass belongs to the separate ui-test skill. Use to review a diff, a branch, or a plan slice's implementation before merge.
allowed-tools: Bash, Read, Grep, Glob, Skill
---

# Bosun Code Review Task

Review the pending changes on the current branch and give **concise, focused feedback**. Four checks, in priority order:

1. **Product requirements** — every acceptance criterion of the driving plan, and every rule in the governing `plans/*.md` design plan, that this change touches is fully met. **This is the most important check.**
2. **Code conventions** — the change honors the Bosun `agent/`, `be/` and `fe/` conventions.
3. **Preflight** — typecheck, lint, tests and the duplication check are clean.
4. **Dead code** — the change left nothing orphaned: no code it replaced, no export/file/dep/DB column/route/frame type it stopped using. **MANDATORY on every review**, via the `find-dead-code` skill scoped to the touched area.
**This skill does not drive the browser.** The `ui-test` skill owns that pass and runs separately, so the two never duplicate each other. Review the code; assume the UI is being driven elsewhere.

**Keep it brief** — only mention what's important, skip trivial changes. Do not invent issues.

## Step 1: Get the changes

- `git diff main...HEAD --name-status` — list all changed files
- `git diff main...HEAD` — full diff
- `git log main..HEAD --format='%s%n%b'` — commit messages. Bosun plan branches are `bosun/plan/<n>-<slug>` and their commits `<Plan title> — slice <k>: <slice title>` — capture the plan number `<n>` and title; they point at the requirements this branch is meant to satisfy.

## Step 2: Establish the requirements (the plan contract)

Do NOT review in a vacuum — first find what the change was *supposed* to do, then check the diff against it.

1. **Pull the driving plan.** `gh pr list --head <branch> --state all --json number,body` — the PR body links the plan in bosun and carries its `## Acceptance criteria` and `## Decisions taken` (the AC list there may be truncated: "…and N more, on the plan"). If a GitHub `plan` issue covers it, `gh issue view <m> --json title,body` plus its sub-issues. Capture the **Acceptance criteria** checklist and the plan's `_Refs:` line. If none of that resolves, infer the touched feature area from the diff instead, and say the criteria were inferred.
2. **Read the governing design plans.** Bosun has no single spec: the product source of truth is the `plans/NNN-*.md` design plans plus the plan issues. Read the plans named by the `_Refs:` line; if none is given, locate them by feature area (e.g. `002` identity, `004` machine lifecycle, `005` planning, `006` projects and roles, `008` machine onboarding, `009` the line). Read the full governing sections — `## Acceptance criteria`, `## Architecture`, `## Key decisions`, `## Non-goals` — not just headings. Also read the engineering docs (`<module>.md`, `README.md`) beside every module the diff touches; their invariants are requirements too.
3. **Extract the concrete requirements** — every rule, invariant, permission (leader / developer / app owner), status transition, wire-protocol contract, and edge case in those sources that the diff is responsible for.

## Step 3: Read the changed files

Read each changed file to understand what was added/modified, its intent, and how it fits the codebase. Cross-reference against the requirements from Step 2 and the conventions below.

## Step 4: Run the mechanical checks

Run `preflight` for whichever package(s) the diff touches. Node 24.15 (each package's `.nvmrc`) + pnpm 11.8. Report exact failures verbatim.

```bash
cd be && nvm use && pnpm preflight      # typecheck + lint:fix + vitest + jscpd
cd fe && nvm use && pnpm preflight      # typecheck (react-router typegen) + lint:fix + vitest + jscpd
cd agent && nvm use && pnpm preflight   # typecheck + vitest + build
```

`lint:fix` rewrites files — if it changed anything, say so and name the files rather than leaving the tree silently modified.

If a command can't run in this environment, say so and review the types/lint concerns by reading instead — do not claim a check passed that you didn't run.

**Unit tests are checked in both directions.** Missing: a finding only when the diff adds or changes logic that is **fragile or critical** — a scheduler, state machine, reducer, resolver, parser, comparison, validation rule, frame router, or anything deciding what gets written to the database or sent to a machine — and no `vitest` test covers its branches. Name the behavior that went uncovered. Absent coverage on a Zod schema, repo, config table, thin wrapper, pass-through controller or a component that only renders props is **not** a finding; the test gate in `be/CLAUDE.md` / `fe/CLAUDE.md` says not to write those. Present but worthless: a new test that only mirrors a declaration is a finding — say to delete it. A test that was skipped, commented out, or weakened to make the suite pass is a blocker.

## Step 5: Check code conventions

Compare the diff against the Bosun conventions. Read the relevant convention doc before judging — don't rely on general knowledge:

- **Frontend:** `fe/CLAUDE.md`, plus the lint policy at the top of `fe/eslint.config.js`. Watch for: FSD import direction `views → widgets → features → entities → shared`, siblings never importing each other (the only exceptions are the ones `fe/eslint.config.js` names with a reason); slices consumed only through their `index.ts` barrel; `~/*` alias for cross-slice imports; every read a TanStack Query hook and every write a mutation in the slice's `api/`; query keys declared once and carrying the active project id; socket pushes patch the cache instead of refetching; failures surfaced (rendered, or `notifyError`), never swallowed; `supabase-js` touched only by `app/shared/api/supabase.ts` and never for data; Tailwind first, tokens in `app/theme.ts` (never hand-edit `theme.css`); Mantine wrapped in `app/shared/`, never forked; object params when ≥2 args share a type; `any` banned; inline `type` imports; named exports except route components; kebab-case files.
- **Backend:** `be/CLAUDE.md`, plus the lint policy at the top of `be/eslint.config.mjs`. Watch for: the layer direction `route → controller → repo → db`; route handlers hold zero business logic; controllers receive deps as an injected object param and never import global `repos` or touch the DB; one repo method = one Drizzle query, result parsed through its Zod entity schema; validation in the route `schema`, not the handler; every inbound WebSocket frame parsed with its Zod schema, log-and-drop on failure; `HttpError` for client-facing failures, no `try/catch` in a route just to convert; multi-step writes in one controller-level transaction, no external I/O (HTTP, socket send) inside `db.transaction`; batch reads with `inArray` (no `Promise.all(ids.map(getById))`); independent reads in `Promise.all`; project scoping via `requireMembership` / `requireLeader` (another project's row answers 404, a missing role 403); generic helpers in `src/utils/general.ts`, not module-private; migrations only via `pnpm db:migration:generate`, never hand-written SQL; a new env var in `EnvSchema.ts` **and** `.env.example`; secrets never logged; object param when ≥2 args share a type.
- **Agent:** no CLAUDE.md of its own — follow `README.md` and the engineering docs under `agent/src/`. Watch for: **any change under `agent/` bumps the patch `version` in `agent/package.json`** (a missing bump is a blocker — machines are only offered a change through a new version); a wire frame changed in `agent/src/*-frames.ts` / `protocol.ts` changed identically in its `be/src/types/` mirror, and vice versa; inbound frames parsed with Zod before acting.
- **Everywhere:** no comment that narrates the code (the only allowed comment explains *why* a non-obvious guard exists); a Tier 1 lint rule silenced instead of refactored is a finding; a module whose `<module>.md` / `README.md` the change invalidated must update it in the same change.

Flag only real violations, not style preferences already allowed by the docs.

## Step 6: Hunt the dead code this change left behind (MANDATORY)

A change that adds a replacement without removing what it replaced is incomplete. Invoke the `find-dead-code` skill and follow it — do not hand-roll a substitute scan:

```
Skill(skill: "find-dead-code", args: "<the packages/directories this diff touches>")
```

**Scope it to the diff, not the whole repo.** Pass the touched package(s) (`agent`, `be`, `fe`, or several) and name the touched feature directories in the args, e.g. `be — controllers/github + repos/github, fe — features/connect-github-pat, focus on what this branch orphaned`. A whole-repo scan is out of scope for a code review; pre-existing dead code elsewhere is not this branch's blocker.

That skill owns the method (3 verification gates, the false-positive trap list, confidence tiers) — obey its hard rules verbatim, especially: **report only, never delete or edit anything**. If the user wants the deletions made, that is a separate task after the review.

When triaging its output for this review, split findings two ways:

- **Orphaned by this branch** — a symbol/file/dep/DB column/route/frame type that the diff itself stopped using (its last caller was deleted or rewritten in this diff), or an old implementation left in place beside its new replacement. **This is a blocker** — the diff is incomplete. Cite `path:line` plus the diff hunk that orphaned it.
- **Pre-existing** — dead before this branch. Report at most a short "while you're here" list under optional improvements. Never block on it.

Also flag the reverse case the scan can't see: code the diff *added* that nothing reaches yet (an exported helper with no caller, a frame type nobody sends, an MCP tool no prompt names, a flag never read). Confirm it's wired before accepting it.

If `find-dead-code` cannot run in this environment, say so and fall back to a grep of the identifiers the diff deleted or renamed — do not claim the check was done.

## Step 7: Provide feedback

### 1. Overview

Summarize what changed in 2-3 sentences and its purpose/goal.

### 2. Requirements conformance (most important)

For the requirements from Step 2, state plainly whether the implementation meets them:

- ✅ Met — the requirement is satisfied by the diff (name it).
- ❌ **Missing / wrong** — an acceptance criterion or plan rule is unmet, partially met, or contradicted. Cite the source (`AC-<n>`, or `plans/NNN-<slug>.md § <heading>`) and the offending `file:line`. **These are blockers.**
- ⚠️ Unclear — cannot tell from the diff whether a requirement is met; say what's needed to confirm.

Do not pass a change that typechecks but violates the plan.

### 3. Conventions & mechanical checks

- Preflight per package: pass/fail (quote failures).
- Convention violations: `file:line` + the rule broken, one line each. Skip if clean.

### 4. Dead code (from Step 6)

- **Orphaned by this branch** — `path:line` + which diff hunk stopped using it, one line each. **Blockers.** Say "none" if clean.
- **Added but unreachable** — anything the diff introduced that nothing calls yet.
- **Pre-existing dead code** — a short optional list, clearly marked as out of this branch's scope. Omit if empty.
- If the scan didn't run, say so and what you did instead.

### 5. Critical issues check

Only obvious, critical problems — logic errors, type mismatches, missing error handling in critical paths, security holes (a route missing its project/role guard, a secret logged or stored in plaintext), breaking changes (a wire frame an already-deployed agent still sends), clearly-bad performance, incorrect UI states/flows. **Skip** style nitpicks, minor optimizations, subjective tweaks, comment/doc quibbles.

### 6. Summary

- Verdict: good to merge, or not?
- Blockers that must be fixed (unmet acceptance criteria or plan rules, failing preflight, code this branch orphaned, a missing agent version bump, critical bugs).
- Optional improvements, if any.

## Important Guidelines

- Requirements conformance outranks everything — a clean typecheck does not make an incomplete feature mergeable.
- Be concise; skip trivial changes; use `file:line` for critical issues and every requirement gap.
- If code looks good, say so quickly — don't invent issues.
- Never claim a check passed that you didn't actually run.
- **The dead-code pass (Step 6) is report-only.** Never delete or edit anything while reviewing, no matter how obviously dead — the review's job is to name it. Blame it on the branch only if the branch orphaned it.
- **Never drive the browser here.** The `ui-test` skill owns the UI pass and runs as its own agent, against the acceptance criteria. If you spot something that can only be settled by opening the screen, say so as a note for that pass rather than reviewing it from the code.
