---
name: find-dead-code
description: Finds removable code in the Bosun agent/ + be/ + fe/ packages — unused exports, orphan files, unused deps, unreachable and vestigial code, dead DB columns/tables, always-null fields that are plumbed through every layer but never written, API routes with no caller, wire frames nobody sends or handles, MCP tools no prompt names, and stale assets/config/scripts. Every candidate must pass tooling + a repo-wide grep + a dataflow check + a written reason before it is reported; nothing is ever deleted. Use when the user asks to find dead code, unused code, orphan files, unused exports or dependencies, dead columns or fields, "what can we delete", or wants a cleanup report before a refactor.
---

# Find dead code (Bosun)

Report-only. **Never delete, never edit.** Output is a ranked report the user acts on.

## Quick start

```bash
S=.claude/skills/find-dead-code/scripts
OUT_DIR=<session-scratchpad>/dead-code bash $S/scan.sh        # all three packages
OUT_DIR=<session-scratchpad>/dead-code bash $S/scan.sh be     # one package (agent|be|fe)
bash $S/verify-symbol.sh <name> [<name>...]                   # gate 2 (symbols)
python3 $S/dead-fields.py                                     # gate 2b (fields)
```

`scan.sh` runs knip via `pnpm dlx` (no install; ~1–3 min first run) and writes
`knip-agent.md`, `knip-be.md`, `knip-fe.md`, `dead-fields.txt`, `sweeps.txt` to `OUT_DIR`
(default `/tmp/dead-code`). The dataflow pass takes several minutes. Read those files — they are
the input to triage, not the answer. **`dead-fields.txt` section A is the highest-value output of
the whole scan** and knip can never produce it: those fields are referenced in every layer.

## Workflow

1. **Scope.** Ask the user only if unclear: whole repo, one package, or one directory.
   Default = whole repo.
2. **Machine pass** — run `scripts/scan.sh`. It runs knip (agent + be + fe) with repo-tuned
   configs, the dataflow pass, plus the grep sweeps tooling can't do (wire frames, MCP tools,
   routes, scripts). Read the raw output; do NOT report it verbatim.
3. **Verify every candidate — 3 gates, all required.** No gate → no report line.
   - **Gate 1 — tool or grep hit** put it on the list.
   - **Gate 2 — repo-wide grep** for the identifier, including string usage:
     `bash scripts/verify-symbol.sh <name>`. Zero hits outside its own declaration/barrel
     re-export = candidate survives. Any dynamic/string/DB-value/frame-literal hit = drop it.
   - **Gate 2b — dataflow, for every *field*** (DB column, payload key, frame field, response
     property, object property). Reference count does not decide a field's fate: a
     field is dead when nothing ever writes it a real value, no matter how many
     places name it. Read `dead-fields.txt`, and for any field you are judging ask
     **"who writes a non-constant value here?"** — never "how many hits does it have?"
     A field whose every producer is `null` / `[]` / `{}` / omitted from the insert — and that no
     agent frame or fe request ever supplies — is dead even with dozens of references across every
     layer. See [REFERENCE.md § always-null plumbing](REFERENCE.md#always-null-plumbing).
   - **Gate 3 — stated reason.** One sentence naming *why* nothing can reach it
     ("only importer was `x.tsx`, deleted in 9c587e5"). Can't write it → drop it.
4. **Semantic pass** (tooling is blind here) — walk the five categories in
   [REFERENCE.md](REFERENCE.md#categories): unused exports/files/deps, unreachable +
   vestigial code, dead DB/API/wire surface, **always-null plumbing**, dead
   assets/config/scripts.
5. **Check the trap list** in [REFERENCE.md](REFERENCE.md#false-positive-traps) before
   writing each finding. Autoloaded routes, react-router string routes, wire-frame schemas matched
   by string, MCP tools called by name, drizzle migrations, generated `theme.css` and the agent's
   commander commands look dead and are not.
6. **Report** in the format below, tier 1 first.

## Confidence tiers

| Tier | Meaning | Bar |
|---|---|---|
| 1 | Safe to delete | Zero refs repo-wide, not an entrypoint, not framework-discovered, not matched by string |
| 2 | Probably dead, needs a human call | Only refs are barrels/tests/itself, or last touched long ago |
| 3 | Suspicious, do not delete blind | Reachable in principle (route, frame, MCP tool, exported API, DB column) but no live caller found |

An always-null field (gate 2b) is **tier 2 for its code chain** — the repo/zod/type/FE
layers are provably unreachable branches — and **tier 3 for the DB column itself**,
because dropping it needs a migration and a data check. Report it as one finding, not
one per layer.

A frame handler whose frame nothing in the current code sends is **tier 3**, never lower: an agent
still running an older version on some machine may send it until that machine upgrades.

## Report format

```
## Tier 1 — safe to delete (N)
- `fe/app/features/<verb>/lib/<file>.ts:<line>` — `<symbol>()` — no importers; last caller removed in <sha>. Risk: none.

## Tier 2 — needs a call (N)
- `be/src/repos/<domain>/<entity>.repo.ts:<line>` — `<method>()` — only ref is the barrel. Risk: low; check <feature>.

## Tier 3 — suspicious (N)
- `be/src/services/drizzle/schema.ts:<line>` — `<table>.<column>` column — no read/write in agent/, be/ or fe/. Risk: drop needs a migration + data check.

## Checked and NOT dead (N)  — one line each, so it isn't re-flagged next run
```

An always-null field is reported as **one finding listing the whole chain**, because
deleting the column alone leaves the dead branches behind:

```
- `be/src/services/drizzle/schema.ts:<line>` — `<table>.<column>` — always NULL: every producer
  writes the literal `null` (<file:line>, <file:line>), no agent frame carries it, the fe never
  sends it, and there is no UPDATE anywhere. <n> references are all plumbing. Dead with it: the
  repo `columns` projection, the entity schema in `be/src/types/`, the route response schema, the fe
  model field in `fe/app/entities/<noun>/model/`, <n> render sites. Risk: column drop needs a
  migration; the code chain is inert today.
```

Always include the "checked and NOT dead" section for anything a tool flagged that a trap
explains. It is the part that stops the next run repeating the same noise.

## Hard rules

- No deletions, no edits, no migrations. Report only.
- Never flag anything in `be/drizzle-out/` — migrations are history.
- Never flag `fe/app/theme.css` — generated from `fe/app/theme.ts` by the vite plugin.
- A finding with no `path:line` is not a finding.
- If a category yields nothing, say so explicitly. Don't pad.
- **Never clear a field on reference count alone.** "60 hits, so it's live" is the mistake this
  skill exists to prevent. For fields, the question is who *writes* a real value — run gate 2b
  before you decide anything about a column, payload key, frame field, or response property.
- Never report an always-null field as a bare column. Report the chain (§ Report format).
- A removal under `agent/` also needs the patch bump in `agent/package.json` — say so in the finding.

Details, commands, and the full trap list: [REFERENCE.md](REFERENCE.md).
