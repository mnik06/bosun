# Preparing plans for parallel work

## The problem it solves

Every plan a queue runs gets a branch cut fresh from `baseRef`. Five plans that each need a column on
the same table therefore build that column five times, on five branches, and collide at merge — and
because two migrations adding the same column merge *cleanly*, nothing catches it until the schema is
wrong.

`preparePlans` takes that work out of them once. It creates one ordinary plan — the **preparation
plan** — and hands the session that writes it the complete text of every selected plan. That session
does three things in one turn: publishes the shared foundation, republishes each selected plan with
the shared work removed, and records itself as a blocker on each of them.

## Why one session does all three

It is the only moment one reader has every plan in front of it. Split across sessions — write the
preparation plan now, fix the others when it merges — the second session re-derives days later, from
a diff, what this one already knew.

The selected plans are rewritten **immediately** rather than flagged, for the same reason: a plan that
still says "create the table" is a plan whose next bullet finds the table already there and has to
decide what that means.

## Order is load-bearing

Blockers are recorded **last**, after every republish. A session that runs out of room half way then
leaves plans that are merely unblocked rather than plans that are blocked *and* still describing work
somebody else now owns. The first is a plan that runs too early; the second is a stalled queue
holding a plan that duplicates the thing it is waiting for.

## Authorization for rewriting someone else's plan

`POST /agent/plans/:id/publish` accepts a `preparedBy` naming a preparation plan. The backend does not
believe it: it loads that plan, and refuses unless it is on the same machine, still `planning`, and
carries `:id` in `plans.prepares_plan_ids`.

`prepares_plan_ids` is written **only** by `preparePlans`, from the ids a project member selected. A
session cannot name its own scope, and the window closes on its own when the preparation session ends
and the plan leaves `planning`. Without `preparedBy` the route behaves exactly as it did, so ordinary
and revision sessions are unaffected.

The residual is the pre-existing one: a machine key can already publish any plan on its own machine.
This change narrows nothing there and widens nothing either.

## Failure modes

- **The plans share nothing.** The session calls `abandon_preparation`, which reaches the backend as
  `plan.error` and fails the preparation plan with the reason it gave. An empty preparation plan
  would be worse: it is a merge everybody waits for.
- **The session dies mid-run.** Some plans are rewritten and some are not, none is blocked, and every
  rewritten one has lost its sign-off — so all of them are re-read before they run.
- **The machine goes offline before the frame lands.** The plan is failed the way `startPlan` fails
  one, rather than left in `planning` forever.
- **The selection spans two machines, or holds an unconfirmed plan.** Refused before anything is
  written. A queue runs in a worktree of one machine, so a foundation shared across two has nowhere
  common to be built.

## Blocking had to cross queues first

`blockedPlanIds` in `queues/advance-queue.ts` used to wait only for blockers **in the same queue**.
The preparation plan is queued somewhere else on purpose, so that rule answered the wrong question.
The rule now lives in `queues/shared/blockers.ts`: a blocker holds a plan when it is queued anywhere
in the project and has not landed.

A blocker queued nowhere — never pushed, or pushed and then failed or cancelled — still holds nothing
back. That is what keeps the old protection: nothing would ever complete a dependency nobody pushed,
so waiting on one stalls a queue for good.

**This changed dispatch for every project, not only ones using the button.** A blocker sitting in a
queue nobody is running now holds a plan that used to run in push order. That is the intended
behaviour and it will be reported as a regression; `getQueueDetail` computes the same rule per item
so the queue says what it is waiting for rather than reading as idle.
