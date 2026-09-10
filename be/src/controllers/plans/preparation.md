# Preparing plans for parallel work

## The problem it solves

Every plan a queue runs gets a branch cut fresh from `baseRef`. Five plans that each need a column on
the same table therefore build that column five times, on five branches, and collide at merge — and
because two migrations adding the same column merge *cleanly*, nothing catches it until the schema is
wrong.

`preparePlans` answers that once. It creates one ordinary plan — the **preparation plan** — and hands
the session that writes it the complete text of every selected plan. That session recons the
repository, builds a dependency map, gets the map confirmed by the person who pressed the button,
and only then publishes, republishes and records blockers.

## The question the session is asked

**"What has to exist, and be merged, before these plans can be built at the same time?"** — not "what
do these plans have in common". The first version of this prompt asked the similarity question, and
it failed in the two ways that framing guarantees:

- It proposed building something the repository already had, because "shared" is decidable from the
  plans alone while "absent" is not.
- It missed a plain one-way dependency between two selected plans, because a plan that needs what
  another builds shares nothing with it and never surfaces in a similarity search.

A third failure showed up once the first two were fixed: two selected plans where one already blocked
the other came out of the session blocked by **both** the preparation plan and each other. Two causes,
one in each layer.

- `artifacts()` resolved blocker plan numbers against the selection only, so a blocker *outside* it
  came back as `undefined` and was dropped. The session was told "blocked by nothing", re-declared
  the list, and `set_blockers` — which replaces wholesale — silently retracted a real dependency. The
  frame now carries every blocker with a `selected` flag saying which side of the selection it is on.
- The prompt told the session to carry forward "every blocker it already had". Mechanically correct
  for a blocker outside the selection; exactly wrong for an edge *between two selected plans*, which
  is the thing the session was called to remove. Somebody selects two plans because they want them
  running at the same time; an edge between them is a declaration that they cannot.

So an edge between two selected plans is now on trial for the whole session: Phase 2 opens with it,
Phase 3 puts the cost of keeping it to the person ("keep #7 waiting on #4 — in which case preparing
this pair buys nothing"), and Phase 6 admits it back only if they said keep. Phase 6 also forbids
transitive edges — an edge is justified by something in the plan's own text, never by a chain through
another plan — and the session abandons rather than publishes when no pair was actually freed, because
a preparation plan that removes no edge is one more thing to merge and wait for.

The prompt sorts every stated need into five buckets — already exists / a selected plan builds it
/ a plan outside the selection builds it / nobody builds it and two or more need it / nobody builds
it and one needs it — and only the fourth is preparation work. The others are a reuse line, a
blocker, a blocker, and nothing at all.

## The session grills

The preparation plan is created with `auto: false`. The session is reasoning from plans rather than
from implementations, so the person who selected them is the only one who can say that the shape it
inferred from a bullet is not the shape they meant — and by the time it is wrong, five plans have
been rewritten against it. The map is confirmed before anything is published; publishing itself is
not put to them.

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

- **Nothing is left to build once.** The session records whatever ordering it found with
  `set_plan_blockers` first, then calls `abandon_preparation`, which reaches the backend as
  `plan.error` and fails the preparation plan with the reason it gave. "They share no foundation" and
  "they can run at the same time" are different answers, and the blockers are the second one. An
  empty preparation plan would be worse than none: it is a merge everybody waits for.
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
