# The line

A repository's approved plans, built, verified and integrated by bosun. Plan 009 replaced queues
with it: a queue asked a person which plans conflict and how much a machine holds, and bosun has
both facts.

## A build, and the one job it does at a time

A **build** is one attempt at building a plan — its branch, its worktree, its place in the line. At
most one per plan is live (`builds_live_plan_key`: not merged, not cancelled). Its work is rows:
`slice_runs` (build bullets, then the verify slice's `drive`, `fix` and `recheck` phases) and
`integrations`.

A build runs **one job at a time in its worktree** — a bullet, a verify phase or an integration.
`slice_runs.claim` and `integrations.claim` both refuse while anything else of the build is running;
that SQL, not the scheduler's reading of it, is what stops two sessions writing one tree.

What a build does next follows from its pending work (`shared/next-job.ts`), not from its status: a
pending integration first, then the earliest pending run. Status says what the build **holds**:

| Holds | Statuses |
|---|---|
| a build slot | `building` (between its own bullets too), `integrating`, `fixing` |
| a lane | `driving`, `rechecking` |
| nothing, waiting for admission | `scheduled`, `waiting_verify`, `in_review` (with a pending integration) |
| nothing, waiting for a person | `held`, `waiting_answer`, `needs_you`, `failed` |

```
scheduled ─slot─► building ─last bullet─► integrating ─► waiting_verify ─lane─► driving
                                                              ▲                     │
                                                              │ recheck             ▼
                  in_review ◄── (no recheck / recheck passes) ── fixing ◄── waiting_verify
                     │  ▲
      base/provider  │  └─ integration (resolved conflict after verify → drive again)
         moved       ▼
                  merged
```

`settleBuild` is the only place a finished job moves a build on. A build a person moved in the
meantime (held, cancelled) is left where they put it.

## The scheduler

`scheduleMachine` is the only thing that starts work. It runs on every event that can free or claim
capacity, serialized per machine by `line-lock.service.ts` — two passes reading the same memory each
admit a build, which is two builds against memory that holds one. Each pass reads the repository
fresh (`line-snapshot.ts`), takes **one** action, and reads again.

Order of a pass:

1. A scheduled build whose provider stopped before releasing it goes to `needs_you`.
2. A holder with nothing running carries on without asking for memory again.
3. Admission: integrations, then the verify lane's head, then fix sessions, then the line — a plan
   another plan waits on first, then position.

**Memory decides capacity** (`memory-budget.ts`). A lane reserves a drive's memory; while nothing
waits to verify, builds borrow it. The moment a plan waits, a build admission must leave the lane's
unheld reservation free — no new bullet starts in it and nothing running is stopped, so the wait is
at most one bullet. A machine running nothing always takes a job.

**The verify line** is ordered by every provider verified, then `built_at`, then position. A plan
never drives against a provider whose own verify could still change it.

## Dependencies and stacking

Dependencies are rows (`plan_dependencies`), from three sources: `planned` (a session declared a
whole feature), `detected` (footprints compared at approval, `shared/detect-dependencies.ts`) and
`manual`. Detection is deterministic; a model never decides what waits for what. A foundation
dependency releases when that bullet's run is done; a whole-feature one at `built_at`; a merge or
"Run anyway" releases anything.

The starting point is decided at the first slot (`startingPoint`): the default branch with no
unmerged provider; the provider's branch **at the satisfying commit** with one — never
`origin/<base>`, which does not contain it until somebody merges; the default branch with every
provider merged in with several. Every bullet merges its providers' branches first. Branches are
pushed after every bullet, which is what lets a dependent start on another machine.

`build.base_branch` is the pull request's base and every integration's `onto`. When a provider
merges, `markMerged` retargets its stacked dependents to the default branch and queues a `retarget`
integration.

## Integration

Triggers: the last bullet (`built`), a push to the default branch (`base_moved`), a push to a
provider's branch (`provider_moved`), a provider merging (`retarget`). One pending integration per
build — a push and its webhook are one integration. Webhooks are the fast path; the five-minute
reconcile (`github/reconcile-pull-requests.ts`) is what catches a missed merge, because a missed
merge leaves every dependent waiting forever.

After verify, an integration that resolved a conflict sends the build back for a drive; one that
only regenerated files was proven by the checks it ran and stays in review.

## Questions

A question holds its slot for `QUESTION_HOLD_MS`. Past it the session is cancelled and the run put
back with the question still on it (`waiting_answer`, holding nothing). The answer is stored on the
run and the build goes to the front; the restarted bullet reads it in its prompt.

## Failure modes

- **A build sits in `building` with no worktree** — the ensure never reached the agent. `hello`
  re-sends it (`resendWorktrees`).
- **Held with "the connection dropped / the agent restarted / ran out of memory"** — `hello` found a
  job the agent no longer held (`stall-machine-builds.ts`). Release continues from the last commit.
- **`needs_you: provider_failed`** — the provider failed or was cancelled before releasing the
  dependency. Retry when it runs again, revise, or override the dependency.
- **A stacked plan's pull request still targets a merged branch** — the retarget call failed; the
  reason is on the build, and the next integration's publish sets the base again.

## Rejected

- **Waiting for a provider to merge.** Serialises every plan behind the slowest reviewer; stacking
  on the provider's branch does not.
- **Switching plans between bullets.** Spreads every pull request out without finishing any sooner,
  and throws away a warm worktree.
- **Stopping a running bullet to make room.** The cost of a lost bullet is always more than the wait.
