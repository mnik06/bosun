# Plan: Parallel work — the preparation plan

_Bosun plan #007 · depends on 005_

## Overview

Five features that each need a column on the same table do not have five problems. They have one
problem, once, and then five features. Today bosun has no way to say that: every plan's branch is cut
fresh from `baseRef`, so five plans queued anywhere — including in the same queue — each build the
shared piece independently and collide on it.

This plan adds one action. Select the plans you want to run side by side, and bosun writes a
**preparation plan**: the shared foundation, built and merged once, with the selected plans rewritten
to consume it rather than build it and blocked until it lands.

Nothing about execution changes. A preparation plan is an ordinary plan — queued, executed, reviewed
and merged like any other. What is new is who writes it and what happens to the plans it was written
for.

**Success in one sentence:** select five plans, press one button, and once the plan that appears has
landed, the five can go to five queues and none of them builds the same table twice.

## Acceptance criteria

- [ ] **AC-1** — Selecting two or more confirmed plans on the same machine offers "Prepare for parallel work".
- [ ] **AC-2** — The action creates exactly one new plan on that machine, and the session writing it is given the full body, criteria and bullets of every selected plan.
- [ ] **AC-3** — The preparation plan contains only what more than one selected plan needs.
- [ ] **AC-4** — In the same session, every selected plan is republished with the shared work removed, so it consumes what the preparation plan builds rather than building it.
- [ ] **AC-5** — Every selected plan is recorded as blocked by the preparation plan.
- [ ] **AC-6** — A plan waits for a blocker queued **anywhere in the project**, not only in its own queue.
- [ ] **AC-7** — A blocker queued nowhere still holds nothing back, exactly as today.
- [ ] **AC-8** — A queue whose head is waiting on a blocker in another queue says what it is waiting for, rather than looking idle.
- [ ] **AC-9** — Republishing clears each selected plan's sign-off, so all of them are re-read before they run.
- [ ] **AC-10** — Selecting plans across two machines is refused, with the reason.

## Architecture

### One session does all of it

The preparation session is handed the complete text of every selected plan and does three things
before it finishes:

1. Publishes its own plan — the shared foundation.
2. Republishes each selected plan with the shared work taken out.
3. Records itself as a blocker on each of them.

All three in one session, because that is the only moment when one reader has all of the plans in
front of it. Splitting it — write the preparation plan now, fix the others when it merges — means a
second session re-deriving what this one already knew, days later, from a diff.

This is also why the selected plans are rewritten **immediately** rather than flagged for later. A
plan that still says "create the table" is a plan whose next bullet will find the table already there
and have to decide what that means. Rewriting them now costs one session; leaving them costs a
confused bullet per plan and a flag somebody has to act on.

Republishing clears `confirmedAt` — that is existing behaviour and it is wanted here. Five plans were
just rewritten by something that is not you, and re-reading them is the point.

### What a preparation plan may contain

Schema and migrations, enums and shared types, API contracts, and anything else the repository
numbers in sequence. These are the pieces where two branches produce a merge that is clean and wrong.

**Shared UI components too — and shared hooks, services, mutations and the endpoints behind them.**
The test is not what kind of thing a piece is, it is whether more than one selected plan needs it and
nobody builds it. This started as the opposite rule, "never shared UI", on the grounds that a
component designed for consumers that do not exist yet is an abstraction built from guesses. The
grounds are real; the rule was wrong. A foundation that carries the schema and leaves the picker in
one of the plans leaves those two plans shipping in order, which is the one thing pressing the button
was meant to avoid — and the same argument, applied honestly, excludes the shared behaviour too and
leaves nothing to prepare.

What a lifted component does carry is that risk: nothing errors when a component's shape is wrong the
way a migration errors. That is what the **"Who consumes this"** section is for, and it is binding —
every lifted piece names its consumers by plan number and by the criterion that consumes them. A
piece with one consumer is that plan's own work; a piece whose consumers had to be invented is not
lifted; where two consumers want different shapes, only what they share moves.

If the selected plans turn out to share nothing, the session says so and writes no plan. An empty
preparation plan is worse than none: it is a merge everybody waits for.

### Blocking has to cross queues

`blockedPlanIds` holds a plan only for blockers **in its own queue**, reasoning that "a dependency
nobody queued is a planning mistake, and stalling a queue forever over it is worse than running in
push order". Sound, and it answers the wrong question here: the preparation plan is queued somewhere
else on purpose, and the whole feature depends on that gate holding.

The rule becomes: a plan waits for a blocker queued **anywhere in the project** and not finished. A
blocker queued nowhere still holds nothing back, so the protection against a permanently stalled
queue survives — what changes is that "queued" stops meaning "queued here".

### No schema changes

`plan_blockers` already exists and already models this. `set_blockers` already writes it. A
preparation plan is a row in `plans` like any other. The work is a prompt, a tool that lets one
session republish another plan, one widened query, and a button.

### API contract

| Route | Gate |
| --- | --- |
| `POST /plans/prepare` — `{ planIds: string[] }`, returns the new plan | member |
| `POST /agent/plans/:id/publish` — existing, now callable for a plan other than the session's own | machine key |

The second is the only sharp edge: a session that can publish any plan can rewrite work it was not
asked to touch. It is scoped to the plan ids the preparation session was created with, checked
backend-side, not trusted from the session.

## Key decisions

- **One session, three outputs.** The only moment all five plans are in one context
- **The selected plans are rewritten now, not flagged for later.** A flag nobody must act on is a flag
  nobody acts on, and the information needed to act is freshest here
- **Anything in bucket D lifts, shared UI and shared behaviour included.** The alternative is a
  foundation that still leaves plans blocked on each other, which is not a foundation. The guard is
  named consumers, not a banned category
- **No new tables.** If this needed schema, it would be a sign the existing blocker model was wrong,
  and it is not
- **Refuse rather than guess** when the selection spans two machines: a queue runs in a worktree of
  one machine's repository, so the plans have nowhere common to run

## Non-goals

- Detecting collisions between plans nobody prepared. Without the preparation step two plans can
  still both add a migration and conflict at merge; this plan gives you a way to avoid that, not a
  guard against it. Named here because it is the obvious next question
- Automatic merging of the preparation plan — it is reviewed like any other work
- Automatically queueing the prepared plans once it lands
- Re-preparing after the preparation plan is itself revised
- Sharing or isolating databases between queues

## Blockers & dependencies

- Cross-queue blocking changes dispatch for **every** project, not only ones using this feature
- The preparation session needs the selected plans' full text, which means a tool that returns more
  than `list_plans` does today

## Slices

### Phase 1 — Blocking across queues

`blockedPlanIds` widened from queue to project, never-queued case preserved, and the waiting reason
surfaced on the queue. Small, independently useful, and the gate everything else relies on.

### Phase 2 — The preparation plan

`POST /plans/prepare`, the prep prompt, the tool that reads the selected plans in full, and the
scoped ability to republish them.

### Phase 3 — The button

Selection on the plans list, the refusal for a mixed-machine selection, and the blocked-by badges the
plan list already knows how to draw.

## Risks

- **The session is reasoning from five plans, not five implementations.** Constraining it to schema
  and contracts is what keeps that from being fatal; widening the scope later removes that protection
- **Rewriting five plans in one session is a lot of output**, and a session that runs out of room
  half way leaves some rewritten and some not. It should record blockers *last*, so a partial run
  leaves plans that are merely unblocked rather than plans that are blocked and unrewritten
- **Cross-queue blocking changes dispatch for every project.** A blocker sitting in a queue nobody is
  running will stall a plan that used to run. Correct, and it will be reported as a regression
- **Nothing stops the unprepared case.** Two plans that both add a migration still collide if you
  never press the button

## Verification

- Five plans sharing a table: one preparation plan appears, all five show blocked by it, all five have
  lost their sign-off, and none of them still describes building the table
- The preparation plan runs, merges, and the five then dispatch from five queues without touching the
  same migration
- Two plans that share nothing: the session writes no preparation plan and says why
- A selection spanning two machines is refused before anything is created
- A project that never uses the button behaves as it does today, except that a blocker queued in
  another queue now holds
