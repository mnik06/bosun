---
name: find-duplicate-code
description: Finds duplicated code in the Bosun agent/ + be/ + fe/ packages and reports what can be extracted into a shared home — copy-paste clones, renamed twin implementations that token matching cannot see (rotate-github-pat-modal vs rotate-azure-modal, pat-connection-guard vs azure connection-guard, the record-*-frame controllers), retyped private helpers and constants, duplicated UI shells and forms, duplicated controllers/repos/zod schemas/query projections, and be <-> agent wire mirrors that have drifted. Separates real extraction candidates from by-design duplication, names a legal destination for each, and flags twins that have already diverged as bugs. Never edits. Use when the user asks to find duplicated code, DRY violations, copy-paste, clones, twin implementations, "what can be extracted into shared", or wants a dedup report before a refactor.
---

# Find duplicate code (Bosun)

Report-only. **Never refactor, never edit.** Output is a ranked report the user acts on.

## Quick start

```bash
S=.claude/skills/find-duplicate-code/scripts
OUT_DIR=<session-scratchpad>/dup-scan bash $S/scan.sh          # all three packages
OUT_DIR=<session-scratchpad>/dup-scan bash $S/scan.sh be       # one package (agent|be|fe)
python3 $S/twin-diff.py <fileA> <fileB>                        # gate 2 (drift)
python3 $S/twin-diff.py <fileA> <fileB> --raw                  # gate 2 for a be <-> agent mirror
```

`scan.sh` writes `clones-agent.txt`, `clones-be.txt`, `clones-fe.txt` (jscpd, clustered by
directory pair), `twins.txt` (rename-normalized file + symbol twins, plus cross-package mirrors)
and `sweeps.txt` to `OUT_DIR`. Read those files — they are the input to triage, not the answer.

**`twins.txt` is the highest-value output and jscpd can never produce it.** The `azure`/`github`/
`pat` and `planning`/`bugfix`/`quick-fix`/`onboarding` renames defeat token matching: jscpd scores
the whole repo under 1% while section A lists a dozen renamed twin families.

## Workflow

1. **Scope.** Ask only if unclear: whole repo, one package, or one feature pair. Default = whole repo.
2. **Machine pass** — `scripts/scan.sh`. Read the raw output; never report it verbatim.
3. **Verify every cluster — 4 gates, all required.** No gate → no report line.
   - **Gate 1 — two real sites.** Two hand-written implementations of one rule, each with a live
     caller. A template and its one instance is not duplication.
   - **Gate 2 — drift class.** Run `python3 scripts/twin-diff.py A B` and classify:
     `identical` (extract), `diverged` (**report as a bug first, refactor second**), or
     `intentional` (leave-list). A diverged twin is the finding — the dedup is the follow-up.
   - **Gate 3 — legal destination.** Name the exact target path the layering permits
     (`be/src/utils/general.ts`, `be/src/controllers/<domain>/shared/…`, `fe/app/shared/lib/…`,
     `agent/src/sessions/…`). No legal home → report as "needs a design call", never as a safe
     extraction. See [REFERENCE.md § destinations](REFERENCE.md#where-extracted-code-goes).
   - **Gate 4 — leave-list.** Check [REFERENCE.md § by-design duplication](REFERENCE.md#by-design-duplication-never-merge).
     The be <-> agent wire schemas and the fe zod models that mirror be responses are duplicated
     **on purpose** — the packages share no code. Never propose merging them; diff them for drift.
4. **Semantic pass** (tooling is blind here) — walk the seven categories in
   [REFERENCE.md](REFERENCE.md#categories): clones, renamed twins, retyped helpers,
   shape duplication, UI duplication, plumbing-vs-logic, mirror drift.
5. **Check the trap list** in [REFERENCE.md](REFERENCE.md#false-positive-traps) before writing
   each finding. Drizzle migrations, generated `theme.css`, `+types/`, route request/response
   schemas and the per-kind frame schemas look duplicated and are not.
6. **Report** — write the full ranked report to `OUT_DIR/duplication-report.md`, print the
   tier headers plus tier A in full to the terminal.

## Tiers

| Tier | Meaning | Bar |
|---|---|---|
| A | **Divergence bug** — twins or mirrors that disagree | Two implementations of one rule, behaviour differs today. Name the wrong side. |
| B | Safe extraction | Logic identical after normalization, legal destination exists, no leave-list hit |
| C | Structural duplication, needs a design call | Real duplication, but merging needs a new slice, a param, or a product ruling |

Rank by **duplicated lines × number of sites**, tier A always first — a diverged twin ships bugs
today; a clean clone only costs maintenance.

## Report format

```
## Tier A — divergence bugs (N)
- **PAT connection guard** — 2 implementations, disagree.
  `be/src/controllers/azure/shared/connection-guard.ts:<line>`,
  `be/src/controllers/github/shared/pat-connection-guard.ts:<line>`.
  Diff: <the check, field or operator one side has and the other lacks>.
  Wrong side: <which>. Dedup after fixing: `be/src/utils/general.ts` (precedent:
  `createRateLimitCooldownGuard`). Risk: med.
- **`build-frames` mirror** — `be/src/types/build-frames.ts:<line>` vs `agent/src/build-frames.ts:<line>`.
  Diff: <frame or field present on one side only>. Not an extraction — fix the lagging side. Risk: high,
  wire protocol.

## Tier B — safe extraction (N)
- **Rotate-token modal shell** — <n> dup lines × 2 sites.
  `fe/app/features/connect-azure/ui/rotate-azure-modal.tsx:<line>`,
  `fe/app/features/connect-github-pat/ui/rotate-github-pat-modal.tsx:<line>`.
  Identical after normalization. → `fe/app/shared/ui/<name>.tsx` (precedent: `ConnectionActionsMenu`). Risk: low.

## Tier C — needs a design call (N)
- **`record-*-frame` controllers** — 5 sites, jscpd-invisible.
  `be/src/controllers/line/record-build-frame.ts`, `…/plans/record-plan-frame.ts`,
  `…/plans/bugfix/record-bugfix-frame.ts`, `…/quick-fixes/record-quick-fix-frame.ts`,
  `…/onboarding/record-onboarding-frame.ts`. Merging needs a kind param + a shared recorder.
  Risk: high — behavioural, every session's persistence.

## By design — checked and NOT reported (N)   ← always include, one line each
- be <-> agent wire schemas (`*-frames.ts`, `protocol.ts`, `project-config-*.ts`) — separate packages, mirrored on purpose
```

## Hard rules

- No edits, no refactors, no migrations. Report only.
- Never report a file pair without `path:line` on **every** site.
- **A falling jscpd percentage is not evidence of dedup.** The gate rewards drift: guarding one
  twin and leaving the other unguarded removes the clone *and* keeps the bug. Never cite the
  percentage as progress.
- Never propose a `shared/` home for domain code — `fe/app/shared/` may not import an entity or
  feature, and holds no domain knowledge (`fe/CLAUDE.md`). Never propose a module shared across
  packages — `agent/`, `be/` and `fe/` share no code; the answer there is a mirror kept in sync.
- Distinguish **plumbing from logic**: identical infrastructure (a rate-limit cooldown, a branch-head
  diff, a stderr tail, a menu shell) is safely shared; provider-specific API calls and error
  classification (Azure DevOps vs GitHub) and per-session prompts stay separate on purpose.
- If a category yields nothing, say so. Don't pad.

Categories, leave-list, destinations, traps and verification recipes: [REFERENCE.md](REFERENCE.md).
