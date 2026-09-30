---
name: plan-me
description: Grill the user relentlessly about a task — the product decisions, then the screen layout, then the architecture — then publish a lean GitHub plan issue plus its final verify sub-issue. The plan carries acceptance criteria, the architecture, and the decisions behind them; implementation inside high-level modules is left to the build. Use when the user hands over a task/feature description and wants it grilled into a plan, or says "plan me", "grill me then plan it", or "turn this into a plan".
---

# Plan Me

Take a task description or ticket, **grill the user** until every **product** and **architecture** decision is resolved, then publish the plan to GitHub.

**Grey box is the governing principle.** The plan settles *what the feature must do* and *how it is put together*. It does not settle how a high-level module is written inside. A build session is trusted to pick its components, hooks, file layout, and internal helpers.

| Plan decides — 100% | Plan does NOT decide |
|---|---|
| Product behaviour, rules, roles, states, edge cases | Which components/hooks a screen is built from |
| Acceptance criteria — the binding checklist | File layout, file names, function names |
| DB schema and migrations | Internal helpers, local state shape |
| API endpoints, wire frames and their payload contracts | Ordered build steps |
| Low-level and shared modules that other code depends on | Unit-test lists |
| New libraries and new approaches | Anything reversible inside one module |

Input: a **task description**, a **GitHub issue** (number or URL), or a **design plan** in `plans/NNN-*.md` to take further. Thin input → grill harder; never invent requirements. **If the input contradicts the truth sources, stop and ask before grilling.**

**Everything lands on GitHub.** GitHub issues are the only store.

## What it produces

```
#N   master plan                      label: plan
└─ #N.v  Verify the whole feature     label: verify        (empty by design)
```

Build slices are filed later as sub-issues between them. Labels are the contract — a build session's type is selected from them, not from issue order.

**There is no test-case document.** The plan's `## Acceptance criteria` *are* the test script: each criterion is driven in a browser — by the build slice that owns it, and by the `verify` sub-issue over the whole feature. A criterion that cannot be checked that way is not observable enough — rewrite it until it is.

**Unit tests are not planned here.** They are mandatory in the session that writes the code, which decides what to cover. The plan never lists them.

**The verify sub-issue is automatic:** the feature touches a screen → publish it; no screen at all (migration, agent-only change, tooling) → don't. Say which, don't ask.

## Truth sources — consult before asking

Never ask the user something these already answer:

1. **The codebase** — current architecture, patterns, integration layers, what already exists, across `agent/`, `be/` and `fe/`.
2. **`plans/*.md`** — the design plans (`NNN-<slug>.md`, each with Overview, Acceptance criteria, Architecture, Key decisions, Non-goals). Bosun has no single spec: these plus the GitHub plan issues are the product source of truth. Ground behavior/rules/roles here. The engineering docs beside modules (`<module>.md`, `README.md`) and `be/CLAUDE.md` / `fe/CLAUDE.md` hold the invariants the code already commits to.
3. **The shipped UI** — the nearest existing screens and the primitives in `fe/app/shared/ui/`, with tokens from `fe/app/theme.ts`, are the design for anything that exists. There is no design prototype: a screen that does not exist yet is proposed from the nearest existing ones.
4. **`.bosun/project.yaml`** — how the stack starts and the test account (a **leader**, secrets `TEST_LEADER_EMAIL` / `TEST_LEADER_PASSWORD`; reference the names, never inline a value).

They inform the plan; they never override the user's stated intent. If they don't settle it, ask.

## Id scheme

`AC-n` — acceptance criterion, the binding checklist, and the only id the plan carries. Everything the ticket asks for is expressed as a criterion; nothing else is tracked.

## Phase 0 — Intake

**GitHub issue** → `gh issue view <n> --json title,body,comments`. Read the whole description, acceptance criteria, and **all comments** — don't skim. **Design plan** → read `plans/NNN-*.md` in full. Then:

1. **Enumerate every acceptance criterion the input states**, verbatim, into a working list. Nothing may be dropped — **every one MUST end up as an `AC-n` in the plan.**
2. Note every behavior the input asks for that its criteria do **not** cover — those become the first grill questions and turn into criteria of their own.
3. **Classify:** **feature** (defines product behavior) → every round that applies. **Plain task / tech ticket** (scoped implementation, no new product behavior) → skip round A, go to round B.
4. Carry the issue number or plan file forward — it appears in the plan's refs line.

**Plain text** → the task is the text.

### Blockers & dependencies — capture whenever referenced

Any time the user says this work is **blocked by**, **depends on**, or **waits for** another issue (GitHub number/URL, a design plan, or described work), record **what** it blocks on and **why** (e.g. "Rotation needs the `github_pat_connections` table from #13"). Each one lands in `## Blockers & dependencies` and, when it's a GitHub issue in this repo, is wired as a **native blocked-by dependency** at publish. Don't invent blockers.

## Phase 1 — Recon

Dispatch **one** `Explore` agent — the only broad sweep worth delegating:

> "For the feature `<summary>`: map the current architecture in the areas it touches, across agent/, be/ and fe/. Return: existing modules/routes/components/wire frames that already do part of this, the patterns and conventions in force there, the data-layer shape, the concrete type/schema names and signatures I would have to honor, and anything already implemented that would make part of this task a no-op. `file:line` refs. No suggestions, no fixes."

What it returns about **what already exists** goes into `### Reuse — do not reimplement`, by symbol and path. This is the section that stops a second implementation of something you already own: GitHub PAT support was built beside the existing Azure DevOps PAT support and grew its own rate-limit cooldown guard, branch-head diff and connection actions menu, which the verify pass then had to merge (`createRateLimitCooldownGuard`, `diffBranchHeads`, `ConnectionActionsMenu`) — because nothing in its plan named what it was supposed to consume.

Read the governing **`plans/*.md`** yourself, inline, plus the nearest existing screens when the feature adds a screen that does not exist yet. Note every place the input **conflicts** with a design plan, quoting both sides.

## Phase 2 — The grill: three rounds

Ask **exactly ONE question at a time**. **IMPORTANT — use `AskUserQuestion` for every question to the user, from the first one.** Before each, verify the answer isn't already in the recon, the design plans, or the code.

Question format:

- **Context:** why this matters.
- **Question:** the specific uncertainty.
- **Recommendation:** your preferred answer, given the current stack.
- **Tradeoff:** what we give up by choosing it.

### Round A — product (skip only for a plain tech ticket)

Resolve, in this order:

- **Uncovered behavior** — anything the input asks for that no concrete, observable criterion states yet.
- **Vague acceptance criteria** — any criterion that can't be objectively checked as done. Rewrite it with the user until it can be.
- **Plan mismatches** — the input contradicts a `plans/*.md` design plan or an engineering doc's invariant. State both sides; ask which wins and whether the design plan needs updating.
- **Gaps** — behavior left unspecified (states, roles — leader / developer / app owner — edge cases, empty/error paths, machine offline).
- **Ambiguities** — wording admitting more than one product reading.

Round A exits when every behavior the input asks for is stated as a criterion and no criterion is ambiguous.

### Round B — screen layout (only when the feature adds or reworks a screen)

**Read the nearest existing screens first.** They are the opening proposal for what the screen is
meant to be — regions, hierarchy, which controls exist and how they group. Never skip straight to
your own invention; propose the layout from what the app already does so the user doesn't have to
describe the page from scratch.

Then **align it with the user, for this feature specifically.** Walk them through the proposal and
settle:

- **Regions** — what the page is made of and how they stack: header, summary, tabs, list or board,
  side or detail panel, drawer, footer.
- **What leads** — the primary object on screen, and what is secondary or behind a click.
- **List vs panel vs modal vs drawer** — where each piece of information and each action lives.
- **Actions** — which controls sit in the page header, and which are per-row or per-card.
- **Entry point** — where the screen is reached from (Plans · Machines · Members · Settings), who
  sees it (leader / developer), and what it does with no data.
- **Where the existing screens are wrong for this feature** — the nearest screen is a precedent,
  not a mandate. Say so, propose the change, get the ruling.

**Do not align on how it looks.** Components, tokens, type scale, spacing, color, density, states —
all of that is settled by `fe/app/shared/ui/` and `fe/app/theme.ts`, and the plan names the pieces
the layout uses rather than describing an appearance. A styling question is never a grill question.

Round B exits when the user has signed off on the regions and what lives in each. The result is
written into the plan as `### Screen layout` and, for anything observable, as `AC-n`.

### Round C — architecture

Lay out the branches first, then resolve each. Mark ones already settled by recon so they're not re-litigated. Prioritize by blast radius:

- **Data model** — tables, columns, constraints, migrations, what the grain is, which project owns a row.
- **API surface** — endpoints, payload shapes, who may call them (member / leader / app owner).
- **Wire protocol** — frames between `be/` and the agent, and pushes to the browser over the UI socket; what an agent on the previous version does with a new frame.
- **Low-level and shared modules** — anything other code will depend on; where the logic lives (FE vs BE vs agent on the machine).
- **New libraries / new approaches** — anything not already in the stack, and why the stack can't do it.
- **Control flow** — the path a request, a session or a build takes end to end, including failure paths: machine offline, socket dropped, session outliving the tab, backend redeployed.

**Align, don't decide, on anything with more than one viable architecture.** Lay out the concrete approach (schema, endpoints, frames, flow, key libs), name the credible alternatives and why you'd reject them, and get **explicit sign-off**.

**Do not grill implementation inside a high-level module.** Which component, which hook, which file, how a screen is decomposed — not a question for the user. Decide it silently or leave it to the build.

**Risk-budget every round.** Interview only high-blast-radius branches. Batch everything low-stakes and reversible into ONE *"Decisions I made — object now"* block.

Exit when every criterion and every architecture branch is resolved, or the user says "stop" / "plan now" / "draft it".

## Phase 3 — Draft the plan

Write it yourself, inline, per `<plan-template>`. No drafting sub-agent — you hold the decisions.

**Apply the standing AC blocks.** Read [ac-library.md](ac-library.md) and decide which surface types this feature builds — list/table screen, board, form, wizard, repeated-record list, machine-run work, detail page. **Paste** every criterion from each applicable block into `## Acceptance criteria` with real `AC-n` ids, tagged `(standing: <block>)`. Announce which blocks you applied; don't ask. Dropping a criterion is allowed and must be recorded under `## Non-goals` with a reason.

**Never write "inherited from #N".** A plan may not defer behaviour to another issue, another plan, or a shared component. Nothing in `shared/ui` is automatic — every affordance is an opt-in prop — so behaviour that is referenced instead of restated ships as an absence. If shared behaviour applies here, it becomes explicit `AC-n` in *this* plan.

**`## Architecture` is the depth lever, and it is bounded.** Write:

- **How it works** — the end-to-end flow in prose, 10–20 lines. Which layer (and which package) owns what, what happens on the failure path. No component trees, no file lists, no module inventories.
- **Screen layout** — for a feature with a screen: the regions round B settled and the `shared/ui` pieces they use. Placement, never appearance.
- **Schema changes** — the real tables, columns, types, constraints, migration.
- **API contract** — the real endpoint signatures and payload shapes, **using the type and field names recon returned**, pasted as code. A described contract is worthless; a pasted one makes the build converge.
- **Wire protocol** — the real frames added, changed or removed, pasted as code, when there are any.
- **New libs / approaches** — only when there are any.
- **Reuse — do not reimplement** — the symbols and paths this feature consumes.

If any of those can't be written without a decision, that decision isn't resolved — go back to round C. Everything *below* that line — internal helpers, file names, component choices — stays out of the plan on purpose.

## Phase 4 — check the criteria are drivable

Walk your own `## Acceptance criteria` once and ask of each: **could an agent with a browser, this sentence, and nothing else decide whether it holds?**

- Not observable from the screen → rewrite it until it is, or drop it with a `## Non-goals` line.
- Needs state nobody can reach → say how the state is reached, in the criterion (an online machine, a second member with the developer role, a connected repository).
- Two readings → pick one with the user.

Every hole this surfaces patches the plan and gets noted in `## Key decisions`. (Skip for a feature with no screen at all.)

## Phase 5 — Self-check, then preview — **the only gate**

Before showing anything, verify mechanically:

- every acceptance criterion the input stated appears as an `AC-n`, and every behavior it asks for is covered by one
- every `AC-n` is observable — a build agent can tell whether it holds
- every applicable standing AC block is pasted in full, and every omission is recorded under `## Non-goals`
- the plan contains no "inherited from", "as in #N", or "not restated here" clause for behaviour
- `## Architecture` states schema, API contract, wire frames and flow concretely — nothing marked TBD
- `### Reuse — do not reimplement` names what this feature consumes rather than rebuilds
- a feature with a screen carries a `### Screen layout` the user signed off on, naming the `shared/ui` pieces it uses
- every captured blocker appears in `## Blockers & dependencies`
- the plan lists no build steps, no file paths to create, and no unit tests

Then run the **unknowns hunter**: one `general-purpose` sub-agent, clean context, handed the plan draft and the recon output.

> "Here is a build plan and the codebase recon behind it. List every **product or architecture** decision this plan leaves open — unspecified behaviour, a role or state nobody defined, an acceptance criterion that admits two readings, an undecided data-model, API or wire-frame shape, a shared/low-level module whose ownership or signature is undecided, an existing component the plan neither consumes nor replaces, a new dependency introduced without justification. **Ignore implementation detail inside a module** — component choice, file layout, naming, internal helpers and test structure are deliberately left to the build session; do not report them. Return ONLY the list, one line each, most load-bearing first. Do NOT answer any of them, do not propose designs, do not review the plan's quality."

Every item it returns is grilled with the user via `AskUserQuestion`, one at a time, exactly like a Phase 2 question. Resolve each into the plan before the preview. This exists because build sessions make architectural decisions mid-flight whenever the plan left the fork open — the cheapest place to catch that is here.

Add what's missing; **never drop**. Then show the user the **full plan inline, exactly as it will be published**. Invite edits. **Do not publish until the user approves.** Apply changes, re-show the affected parts, then publish.

## Phase 6 — Publish

Write every body to a file under the scratchpad and pass `--body-file` — inline `--body` mangles Markdown.

**Preflight** (parallel): `gh auth status`, `gh repo view --json nameWithOwner` (expect `mnik06/bosun`).

**Ensure labels exist** — `gh issue create` fails on a missing label:

```bash
gh label create plan   --color 5319e7 --description "Master plan issue (plan-me)"                 2>/dev/null || true
gh label create verify --color d93f0b --description "Full-feature verify + fixes; opens the PR"   2>/dev/null || true
```

**Create in this order:**

1. **Master** — `gh issue create --label plan --title "<feature>" --body-file …`.
2. **Verify** (only when the feature touches a screen) — `--label verify`, title `Verify: <feature>`, body per `<verify-template>`. Created **empty by design**: it runs last, after every build slice, and it opens the plan's PR.

**Attach the sub-issue to the master.** The endpoint takes the child's **REST database id** — not the issue number, not the GraphQL node id:

```bash
childId=$(gh api repos/<owner>/<repo>/issues/<childNo> --jq .id)
gh api -X POST repos/<owner>/<repo>/issues/<parentNo>/sub_issues -f sub_issue_id=$childId
```

Falls back to `gh api graphql` `addSubIssue` (parent + child node ids). If neither works, **abort this step and list which links failed** — never silently drop the hierarchy or fake it with a label.

**Wire blocked-by links** for every captured blocker that is a GitHub issue in this repo:

```bash
gh api repos/<owner>/<repo>/issues/<masterNo>/dependencies/blocked_by -f issue_id=<blocker-node-id>
```

(resolve with `gh issue view <blocker> --json id -q .id`). A blocker that is a design plan in `plans/` or lives outside this repo stays as prose — say so.

**Report:** master URL, verify URL (or why there is none), and any link that couldn't be applied.

---

<plan-template>
# Plan: <Feature Name>

_Refs: <GitHub issue #n, or none> · `plans/<NNN>-<slug>.md` · nearest screen <route>_

## Overview

One or two sentences on what this delivers and why.

## Acceptance criteria

**The source of truth for this plan.** The checklist the build is measured against — the feature is done when every box is ticked. Each states an observable condition that must hold, not what to build. Covers everything the input asks for plus the criteria derived during the grill.

- [ ] **AC-<n>** — <observable condition that must hold>
- [ ] **AC-<n>** (standing: <block>) — <criterion pasted verbatim from ac-library.md>

## Architecture

### How it works

10–20 lines of prose: the end-to-end flow, which layer and package owns what, what happens on the failure path. Grey box — no component trees, no file lists, no module inventories.

### Screen layout

Only when the feature has a screen. The regions the user signed off on in round B and what lives in
each, plus the `shared/ui` pieces they are built from. Placement only — never an appearance. Omit the
subsection for a feature with no screen.

- `<region>` — <what it holds> · built from `<shared/ui component>`

### Schema changes

Tables, columns, types, constraints, migrations, indexes, enums. "None" if untouched.

- `<table.column>` — <change, type, constraint>

### API contract

The real endpoint signatures and payload shapes, pasted — real type names and field names from the codebase. "None" if no endpoint changes.

```ts
// METHOD /path — purpose, roles
// request / response shapes
```

### Wire protocol

Frames added, changed or removed between `be/` and the agent, or pushed to the browser. Omit the subsection when there are none.

```ts
// BE -> agent
// agent -> BE
```

### New libs / approaches

Anything not already in the stack, with the reason the stack can't do it. Omit the subsection when there are none.

- `<lib>` — <why>

### Reuse — do not reimplement

What this feature **consumes** rather than rebuilds, from recon. A second implementation of anything listed here is a defect, not a design choice.

- `<exported symbol>` (`path/to/file`) — <what it already provides>

## Key decisions

The product and architecture choices this plan commits to, each with a one-line rationale — the ones the user signed off on and the executive ones made on their behalf.

- **<decision>** — <why>

## Non-goals

Explicitly out of scope — stops scope drift in the slices. Every standing criterion dropped from a pasted block is recorded here with its reason.

- <non-goal>

## Blockers & dependencies

Wired as native blocked-by links on publish. "None" if there are no blockers.

- **Blocked by #<n>** (`<title>`) — <what it provides and why this needs it>

## Decisions taken

Empty at publish. Build sessions append here whenever they resolve a fork this plan left open. The PR body carries this section verbatim, so it is the first thing the reviewer reads.

_(populated during the build)_
</plan-template>

<verify-template>
> Parent: #<master> — <Feature Name>

**This issue is empty by design.** It runs after every build slice is closed.

Its session is an orchestrator: a fresh sub-agent drives the plan's **entire**
`## Acceptance criteria` list in a browser, blind to the diff; a second reviews the whole branch;
then one fix agent per finding. It opens the plan's PR.

Findings land here as comments before anything is fixed.
</verify-template>
