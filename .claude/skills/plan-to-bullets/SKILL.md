---
name: plan-to-bullets
description: Take a published plan issue and split it into 3–4 vertical build slices, filed as GitHub sub-issues under the plan. Each slice carries its acceptance criteria verbatim and points back at the plan for architecture. Invents nothing — it only cuts a finished plan. Use when the user has a plan issue and says "break it into tracer bullets", "slice this plan", or "turn the plan into sub-issues".
---

# Plan to Bullets

Split an **already-finished plan issue** into **3–4 vertical slices** and file them as sub-issues. That's the whole job.

**Hard cap: 4 slices. Target 3.** More than that is over-cutting — merge until it fits. Fewer is fine: a small plan can be 1 or 2. A slice is a thin vertical cut through every layer it touches (schema → API → agent → UI), demoable on its own. Never a horizontal layer slice ("all the backend", "all the UI").

**This skill invents nothing.** No new requirements, no new scope, no new architecture, no grilling. The plan is the complete input. If the plan is missing something needed to cut it, **ask the user** — don't fill the gap.

**GitHub only.**

```
#N   master plan                      label: plan
├─ #N.1  Phase 1: <slice>             (no label)            ← created here
├─ #N.k  Phase k: <slice>             (no label)            ← created here
└─ #N.v  Verify the whole feature     label: verify         (already exists, empty)
```

Labels are the contract — a build session's type is selected from them, not from issue order. Build slices get **no label**.

## 1. Read the plan

`gh issue view <N> --json number,title,body,url` plus `gh api repos/<owner>/<repo>/issues/<N>/sub_issues` to see what already exists.

You cut along the plan's `## Architecture` — its flow, schema changes and API contract tell you where the natural vertical seams are. You **carry** its `## Acceptance criteria`: capture the full list, because every `AC-n` has to land in exactly one slice.

**Standing ACs are ACs.** A criterion tagged `(standing: list)` is assigned like any other — the slice that builds that surface owns it. They ship as absences when nobody owns them, so an unassigned standing AC is the same failure as an unassigned feature AC.

If the issue clearly isn't a finished plan, say so and stop.

## 2. Cut 3–4 slices

<slice-rules>
- 4 maximum, 3 is the target. Merge before you exceed it.
- Each slice is vertical: it touches every layer it needs and is demoable or verifiable alone.
- Order them so each builds on the last — the first slice usually carries the schema and the narrowest end-to-end path.
- Slices only re-express the plan. Never add work the plan doesn't call for.
- Don't bake in file or function names. DO carry durable facts from the plan: route paths, table names, payload shapes, wire frame types.
- Every `AC-n` is assigned to exactly one slice — none left behind, none duplicated. An `AC-n` whose path crosses slices goes to the **last** slice that completes it; never hand a build session a criterion it cannot yet reach.
- Unit tests are not assigned here. The session that writes the code writes them.
</slice-rules>

## 3. Approve the shape — **the only gate**

Present the cut as a numbered list: **Title · What it delivers · AC ids**. State that every `AC-n` is assigned and name any orphan rather than dropping it. Merge/split until approved, staying inside the cap. Once approved, file immediately — no second review.

## 4. File the sub-issues

Write every body to a scratchpad file and pass `--body-file` — inline `--body` mangles Markdown.

**Preflight** (parallel): `gh auth status`, `gh repo view --json nameWithOwner`.

**Create each slice** — title `Phase <n>: <Title>`, **no label**, body per `<slice-template>`:

```
gh issue create --title "Phase <n>: <Title>" --body-file <phase-body-file>
```

**Attach each slice under the master.** The sub-issue endpoint takes the child's **REST database id** — NOT the issue number, NOT the GraphQL node id:

```bash
childId=$(gh api repos/<owner>/<repo>/issues/<childNo> --jq .id)
gh api -X POST repos/<owner>/<repo>/issues/<parentNo>/sub_issues -f sub_issue_id=$childId
```

Falls back to `gh api graphql` `addSubIssue` (parent + child node ids). If neither works, **abort this step and list which `(parent ← phase)` links failed** — never silently drop the hierarchy or fake it with a label.

**Update the master body** — append a `## Slices` checklist linking each sub-issue in order (`- [ ] Phase <n>: <Title> (#<number>)`) via `gh issue edit <parentNo> --body-file`.

**Report** the master URL, every slice URL in order, and any link that couldn't be applied.

<slice-template>
> Parent: #<master> — <Feature Name>

## What to build

2–4 lines: the end-to-end behavior this slice delivers, across every layer it touches.

## Acceptance criteria

The plan's `AC-n` for this slice, **verbatim** — every box must be ticked before the slice is closed.

- [ ] **AC-<n>** — <observable condition, verbatim from the plan>

Architecture, key decisions and reuse: see plan #<master>.
</slice-template>
