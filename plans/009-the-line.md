# Plan: The line — approve a plan; bosun builds, verifies and integrates it

_Bosun plan #009 · depends on 007, 008_

## Overview

Getting plans built today makes the user the scheduler, the dependency analyst and the merge resolver.
They confirm a plan, create a queue on a machine, push the plan to it, and — to run plans side by side
— create more queues, decide which plans go where, and press "Prepare for parallel work", which runs a
second grill, rewrites the selected plans, clears their sign-off, and has to be followed by confirming
and pushing each of them again.

The protection that buys does not hold. A blocker stops holding a plan the moment the blocker's queue
item is `done` (`queues/shared/blockers.ts`), which `advanceQueue` writes when the last bullet lands —
before its pull request is even opened — and the waiting plan's branch is cut from `origin/<base>`
(`execution/commit.ts`), which does not contain the blocker's work until somebody merges it. Nothing in
bosun learns when a pull request merges. And the conflicts nobody predicted — two migrations numbered
`0013`, two routes added at the same line, a lockfile — are found in review, by a person.

This plan makes bosun the scheduler and the integrator:

- **Approve is the last thing a person does before review.** An approved plan joins its repository's
  line. There are no queues.
- **Capacity is memory.** A machine builds as many plans as its memory budget admits, and verifies one
  plan at a time in a lane of its own.
- **Dependencies are detected, not arranged by hand.** A plan publishes what each of its bullets will
  change. Bosun compares plans at approval, stacks a plan on the one it needs, and waits for that plan's
  foundation bullet rather than the whole plan.
- **Integration is bosun's job.** A finished branch is merged with its base, generated files such as
  migrations are regenerated instead of merged, real conflicts are resolved with both plans' intent, and
  every open pull request is kept mergeable as the others land.

**Success in one sentence:** two engineers approve five plans on one machine, nobody creates a queue or
presses Prepare, and every pull request that reaches review is mergeable with its migrations in order.

## Acceptance criteria

**The line**

- [ ] **AC-1** — Approving a ready plan puts it in its repository's line; nothing else has to happen before it runs.
- [ ] **AC-2** — The Plans page is a board showing each plan as drafting, needs approval, scheduled, building, verifying, in review or merged — or held, needs you, failed — and every waiting plan says what it is waiting for. The board is read-only except for dragging scheduled plans into a new order.
- [ ] **AC-3** — From a plan's page a person can move it to the front, hold it, release it and cancel it.
- [ ] **AC-4** — A change bosun makes to a plan — a dependency amendment, a merge of its base, a regenerated file — does not clear its approval. A revision by a person or a session does.

**Capacity**

- [ ] **AC-5** — How many plans build on a machine is decided by the memory budget; `MAX_RUNNING_PER_MACHINE` is gone, and a leader can set a lower cap per machine.
- [ ] **AC-6** — A machine never leaves build memory idle while a runnable plan waits.
- [ ] **AC-7** — Freed capacity goes, in order, to integration work, to a plan another plan waits on, then by line position.
- [ ] **AC-8** — A plan holds its build slot from its first build bullet to its last, and gives it up before verify.
- [ ] **AC-9** — A plan waiting on a question keeps its slot for 10 minutes, then gives it up. Answering puts it at the front, and its bullet restarts with the answer in its prompt.
- [ ] **AC-10** — Planning sessions take no build slot.

**Dependencies**

- [ ] **AC-11** — `publish_plan` requires a footprint for every bullet — schema changes with their definitions, API contracts, modules created and modules changed — and refuses a plan whose shared pieces are not all in its first bullet, marked as the foundation.
- [ ] **AC-11b** — `publish_plan` refuses a plan with more than six build bullets, telling the session to split it into plans.
- [ ] **AC-12** — A planning session sees the footprints of every approved, unmerged plan in its repository, and can record that its plan consumes a piece of one.
- [ ] **AC-13** — At approval, a plan creating a table, column or module that an earlier-approved plan creates with an identical definition is amended to consume it, depends on that plan's foundation bullet, and asks nobody anything.
- [ ] **AC-14** — The same collision with a different definition stops the later plan on a decision: use the earlier definition, change it (offered only while its foundation is unbuilt), or rename.
- [ ] **AC-15** — A plan that uses or changes something another plan changes depends on the bullet that makes that change.
- [ ] **AC-16** — Two plans that only touch the same files do not depend on each other.
- [ ] **AC-17** — A dependency on a foundation bullet releases when that bullet lands; a dependency on a whole feature releases when that plan finishes building.
- [ ] **AC-18** — A person can remove any detected dependency with "Run anyway".

**Stacking**

- [ ] **AC-19** — A plan with an unmerged provider is cut from the provider's branch at its landed commit, never from `origin/<base>`. With two unmerged providers, both branches are merged into its starting point.
- [ ] **AC-20** — Before each bullet, a stacked plan merges in whatever its provider's branch gained since.
- [ ] **AC-21** — A stacked plan's pull request targets its provider's branch, and is retargeted to the default branch and brought up to date when the provider merges.
- [ ] **AC-22** — "Ship foundation alone" opens a pull request holding only a provider's foundation commits, so its dependents are not held by the provider's review.
- [ ] **AC-23** — A provider that fails after its foundation landed leaves the foundation to its dependents; one that fails before sends each dependent to needs you, with retry and revise.

**Integration**

- [ ] **AC-24** — Bosun learns of pushes and merges from signed GitHub webhooks, and reconciles pull request state on a timer in case one is missed.
- [ ] **AC-25** — Integration runs when a plan finishes building, and again whenever its base or its provider moves while it is unmerged.
- [ ] **AC-26** — Files matching a `regenerate` rule that the branch added or changed are discarded during the merge and produced again by the rule's command; they never conflict.
- [ ] **AC-27** — Two unmerged plans that each add a migration both end up mergeable with sequentially numbered migrations, whichever lands first.
- [ ] **AC-28** — A conflict outside `regenerate` paths is resolved by a session given the criteria of every plan involved, when the repository allows it. Otherwise — or when the checks are still red after one repair — the plan goes to needs you and nothing else stops.
- [ ] **AC-29** — Integration never pushes a branch whose checks are red.
- [ ] **AC-30** — The pull request lists every integration: what was merged, what was regenerated, and the diff of every conflict bosun resolved.

**Verify**

- [ ] **AC-31** — A machine verifies one plan at a time by default, configurable per machine.
- [ ] **AC-32** — The verify lane's memory runs build bullets while nothing waits to verify; once a plan waits, no new build bullet starts in it, and no running bullet is stopped.
- [ ] **AC-33** — A plan verifies only after every plan it depends on has verified.
- [ ] **AC-34** — Verify is two sessions: a drive session in the lane that starts the stack, drives every criterion and records findings, committing nothing; and a fix session in a build slot that reviews the branch, fixes the findings, runs the checks and commits.
- [ ] **AC-35** — Criteria the fix session repaired are driven again in the lane before the pull request opens, except on a hands-off plan.
- [ ] **AC-35b** — A criterion that still fails at re-check stops the plan on needs you with Fix again, Accept as a known gap, or Cancel. Accepting marks it blocked with the reproduction and who accepted it, and the pull request lists it under Known gaps.
- [ ] **AC-36** — Only the lane applies migrations to a machine's dev database, resetting it before each drive. Build bullets generate migrations and apply none.
- [ ] **AC-37** — An integration after verify that resolved a conflict queues the drive again; one that only regenerated files re-runs the checks.

**Hands-off and migration**

- [ ] **AC-38** — A plan's hands-off switch replaces `plans.auto` and `queues.afk`: its grill answers itself, its bullets cannot ask, and its re-check is skipped.
- [ ] **AC-39** — Queued plans become builds in the order they were queued, a confirmed plan becomes approved, and the migration refuses to run while any bullet is running.
- [ ] **AC-40** — Queues, pushing to a queue and "Prepare for parallel work" are gone from the browser and the API.

**The browser**

- [ ] **AC-41** — Every tab of a plan's page carries the plan's state, the actions that state allows, and any open question or overlap decision, answerable from whichever tab is open.
- [ ] **AC-42** — A plan's page has Chat, Plan, Execution, Changes and Verification tabs. Each appears once it has something to show, and the page opens on the tab the plan's state makes relevant.
- [ ] **AC-43** — Stop on a building or verifying plan cancels its session, puts the bullet back to pending and holds the plan; Release continues from the last commit. Cancel removes the build and keeps its branch.
- [ ] **AC-44** — Changes shows the change map, the pull request and its state, and every integration with its resolved diffs. Verification shows a verdict and its evidence for every criterion, every finding with its status, and the check and re-check results.
- [ ] **AC-45** — A "Needs you" count in the app header lists every open question, overlap decision and unresolved integration in the project, each linking to its plan.
- [ ] **AC-46** — The Plans page's History view lists merged, failed and cancelled plans, searchable by number and title.

## Architecture

### How it works

```
ready ─Approve─► scheduled ──slot──► building ──► integrating ──► waiting to verify
                  ▲   │                                                  │ lane
               release hold                                              ▼
                  └── held          in review ◄── integrating ◄── fixing ◄── driving
                                        │  ▲                        │
                                        │  └── base or provider ────┘ re-check (lane)
                                        ▼      moved: integrate
                                     merged

needs you ◄── an overlap decision, an unresolved conflict, red checks after repair, a failed provider
```

A **build** is one attempt at building a plan: its branch, its worktree, its place in the line. It
replaces the queue item, and the queue with it. A queue was a scheduling decision a person had to make
before having the information to make it well — which plans conflict, how much the machine holds — and
bosun has both.

### The scheduler

One function, `schedule(machineId)`, runs on every event that can free or claim capacity: approval, a
bullet or phase settling, an integration settling, a webhook, hold, release, an answer. It admits work
through the existing `admitBullet`, in this order:

1. **Integration jobs** — build-sized. A finished branch kept mergeable is worth more than a new start.
2. **The verify lane** — the head of the verify line whose providers have all verified, admitted as a
   drive into the lane's reserved memory.
3. **Plans already building** — their next bullet, and fix sessions.
4. **Scheduled plans that are runnable** — every dependency released — by priority: a plan another plan
   waits on first, then line position.

Memory decides the rest. `BULLET_BYTES` is already measured at 3 GiB for a build bullet and 6 GiB for a
verify bullet running its loop beside its stack. The lane reserves one drive's worth per lane; while the
verify line is empty that reservation admits build bullets like any other memory, and the moment a plan
joins the line the scheduler stops starting build bullets in it. Nothing running is ever stopped, so the
wait is at most one bullet. A drive (stack and browser, no loop) and a fix session (loop, no stack) start
at the verify and build figures and are measured down.

A plan keeps its build memory between its own bullets. Switching plans between bullets would spread
every pull request out without finishing any sooner, and the worktree's installed dependencies and
generated files stay warm.

**Questions.** A bullet asking a question holds its slot for `QUESTION_HOLD_MS` (10 minutes). Past that,
the session is cancelled, the run is reclaimed as `reclaimRun` already does, and the answer — when it
comes — is stored on the run and rendered into the restarted bullet's prompt. The build goes to the front
of its priority class. One question stops one plan; a queue marked `blocked` no longer exists to stop the
others.

### Footprints

`publish_plan` gains a footprint per bullet and a `foundation` flag on the first:

```ts
footprint: {
  schema:    { op: 'create_table' | 'add_column' | 'alter_column' | 'drop', table, column?, definition }[]
  contracts: { op: 'create' | 'change', method, path, shape }[]
  modules:   { op: 'create' | 'change', path, symbol? }[]
  consumes:  { planNumber, item }[]      // pieces of another approved plan this bullet uses
}
```

The planning prompt already makes a plan decide its schema and contracts completely; this records them
as data. Two rules are enforced on publish, not suggested:

- **The foundation comes first.** Every piece another plan could consume — schema, contracts, shared
  types, a created shared module — is in bullet 1, and bullet 1 is marked `foundation`. The execution
  prompt already builds the data layer first, so this names an order the sessions follow anyway, and
  gives bosun a commit to stack on.
- **At most six build bullets**, plus the verify bullet. Today the prompt asks for three or four and the
  API takes any number — `AgentPublishReqSchema` has a `.min(1)` and no `.max`. A plan holds its build
  slot to its last bullet, so a twelve-bullet plan holds one for most of a day, and every plan waiting on
  its whole feature waits with it. Six leaves room for a foundation bullet on top of the prompt's four.
  Past it the API refuses with "this is more than one feature — split it into plans", and the session
  re-cuts or splits. The prompt still asks for three or four.

`list_plans` returns the footprints of every approved, unmerged plan in the repository, so a plan written
second can say `consumes` instead of building a second copy.

When a bullet's run lands, the files it changed are written to `slices.changed_files`. That is the actual
footprint; the declared one stays the source for schema and contracts, which a file list cannot express.

### Detecting dependencies at approval

Deterministic, over declared footprints — a model resolves conflicts in this plan, it never decides a
dependency. Approving plan B compares it against every approved, unmerged plan A:

| B against A | Result |
|---|---|
| B `consumes` a piece of A | Dependency on the bullet of A that creates it |
| Both create the same table, column, contract or module, definitions equal after normalising | B is amended to consume A's; dependency on A's foundation. No question |
| Both create it, definitions differ | B is held on an **overlap decision**: use A's definition · change A's (only while A's foundation is unbuilt) · rename B's |
| B uses or changes something A changes | Dependency on the bullet of A that changes it |
| B needs A's whole feature (declared in planning) | Dependency on all of A |
| Only the same files | Nothing. Integration handles it |

An amendment is a row in `plan_amendments`, rendered on the plan page and into every execution prompt
for that plan ("`users.timezone` comes from #7 — use it, do not create it"). It does not clear approval:
what the plan delivers is unchanged.

Whichever plan was approved first owns a contested piece. "Run anyway" removes a detected dependency and
records who removed it.

### Stacking

A plan's starting point is decided when it takes its first slot:

- no unmerged provider → `origin/<default branch>`, as today;
- one → the provider's branch at the commit that satisfied the dependency;
- several → a fresh branch from the default branch with each provider's branch merged in; a conflict
  there goes to integration like any other.

**Branches are pushed after every bullet**, not only at the end. A provider's foundation on the remote is
what lets a dependent start on a different machine, and it is what `cleanTree`'s existing
`syncWithRemote` pulls into a stacked plan before each of its bullets.

A stacked plan's pull request targets its provider's branch. When the provider merges, the webhook
retargets it to the default branch and queues an integration. "Ship foundation alone" creates a branch at
the provider's foundation commit and opens a pull request for it through the App, so a slow review of
the provider does not hold every plan stacked on its first bullet.

### Integration

An integration is a job for the agent, run in a build slot, on one build:

1. Fetch; resolve `onto` — the provider's branch while stacked, otherwise the default branch.
2. For every `regenerate` rule, take `onto`'s version of every path the rule matches that the branch
   added or changed.
3. `git merge onto`. Merged rather than rebased, for the reason `commit.ts` already gives: each bullet's
   sha is recorded against its slice.
4. A conflict left outside `regenerate` paths goes to a **conflict session** when
   `repositories.auto_resolve_conflicts` is on: a `claude` session in the mid-merge worktree, given the
   plan's criteria and the criteria of every bosun plan whose commits it conflicts with (found from their
   `bosun/plan/…` branch names), with `Read`, `Edit` and `Bash`. It resolves, or calls `give_up` with the
   reason.
5. Run each `regenerate` command, in order. Commit.
6. Run the project's `checks`. Red gets one repair from the conflict session; still red is needs you.
7. Push. Record what was merged, regenerated and resolved; the pull request body lists every
   integration with the resolved diffs.

`.bosun/project.yaml` gains:

```yaml
regenerate:
  - name: migrations
    cwd: be
    paths: [be/drizzle-out/**]
    run: pnpm db:migration:generate
  - name: lockfile
    cwd: fe
    paths: [fe/pnpm-lock.yaml]
    run: pnpm install --lockfile-only

verify:
  resetDatabase:
    cwd: be
    run: pnpm db:reset
```

Onboarding (008) proposes both. A migration numbered at generation time is only a guess about what will
be on the default branch when it lands; regenerating on every integration makes the number true at the
moment it matters, which is why two plans can both generate `0013` and still land as `0013` and `0014`.

**Triggers:** a plan finishing its build bullets (before verify, so verify drives integrated code); a
`push` to the default branch while the build is unmerged; a push to its provider's branch; its
provider merging. Webhooks (`push`, `pull_request`) are verified with `X-Hub-Signature-256`. A five-minute
reconcile reads the state of every open bosun pull request, because a webhook delivery can be missed and
a missed merge would leave its dependents waiting forever.

**After verify.** An integration that resolved a real conflict sends the build back to the verify line for
a drive; one that only regenerated files runs the checks and stays in review.

### The verify lane

**Order.** The verify line is ordered by: every provider verified (a plan never verifies against a
provider whose own verify could still change it), then the order plans finished building, then manual
reordering.

**Drive** — in the lane. `verify.resetDatabase`, then each app's `migrate` (where the machine's policy
allows it), `stack_up`, and one pass through every criterion — today's Agent A, now the whole session.
Tools: `mark_ac_verified`, `mark_ac_blocked`, `report_finding`. `stack_down`, exit. It commits nothing.
Findings — a failed criterion, a console error, a failed request, a visual defect — are rows with a
written reproduction.

**Fix** — in a build slot. Given the findings, it runs the review, dead-code and duplication agents
(today's B, C and D, which never needed the stack), groups and fixes, runs the loop at most twice,
resolves each finding as fixed or left with a reason, and commits.

Today's verify session already hands off between these halves: it never looks at the browser itself, it
reads Agent A's report and fixes from that. The split makes the handoff a table, and gives the lane back
the moment the browser pass is over.

**Re-check** — in the lane, only when a finding tied to a criterion was fixed, and never on a hands-off
plan: reset, stack up, drive those criteria, stack down. "Fixed" then means watched working rather than
checks green.

**A criterion that still fails at re-check** sends the build to needs you, carrying the re-check's
reproduction and three choices:

- **Fix again** — a fix session given only the still-failing criteria's findings, then another re-check.
  Never automatic: a fix-and-re-check loop nobody chose is how a verify runs all afternoon.
- **Accept as a known gap** — the criterion is marked blocked with "failed re-check" and the reproduction,
  recorded against whoever accepted it. The gate passes, and the pull request lists it under Known gaps.
- **Cancel** — the build is cancelled and its branch kept.

A hands-off plan has no re-check, so it never stops here: a finding its fix session left is in the pull
request with the reason.

**The database belongs to the lane.** Every worktree gets the same env today, so concurrent plans share
one database and verify against each other's unmerged schema. The lane runs one plan at a time, so it can
own the database outright and reset it per plan. Build bullets generate migrations and run the checks, and
apply nothing: the execution prompt stops telling them to apply migrations and to run tests that need a
database. The machine's `applyMigrations` policy from 008 now governs only the lane.

### Schema changes

```
plans
  ~ confirmed_at   → approved_at
  ~ auto           → hands_off
  + repository_id  text not null → repositories.id        (machine_id stays: where it was planned)

slices
  + foundation     boolean not null default false
  + footprint      jsonb not null default '{}'
  + changed_files  jsonb null

plan_blockers    → plan_dependencies
  + provider_slice_id  text null → slices.id  on delete set null     null = the whole feature
  + source             text not null   'planned' | 'detected' | 'manual'
  + reason             text not null
  + overridden_by_user_id  text null → users.id,  overridden_at timestamptz null

plan_amendments                    (new)
    id, plan_id → plans.id, source_plan_id null → plans.id, text, created_at

overlap_decisions                  (new)
    id, plan_id, provider_plan_id, item jsonb, options jsonb,
    chosen text null, decided_by_user_id null, decided_at null

queues, queue_items                (dropped)

builds                             (new)
    id               text pk        bld_<nanoid12>
    plan_id          text not null → plans.id on delete cascade
    repository_id    text not null → repositories.id on delete cascade
    machine_id       text null     → machines.id on delete set null
    position         integer not null
    status           text not null  'scheduled' | 'held' | 'building' | 'waiting_answer' | 'integrating'
                                    | 'waiting_verify' | 'driving' | 'fixing' | 'rechecking' | 'in_review'
                                    | 'merged' | 'needs_you' | 'failed' | 'cancelled'
    needs_you_reason text null
    branch, base_branch, worktree_path   text null
    port_base        integer null
    pr_number        integer null,  pr_url text null
    failure_reason   text null
    created_at, started_at, finished_at, merged_at

slice_runs
  ~ queue_item_id  → build_id
  + phase          text null      'drive' | 'fix' | 'recheck' on a verify slice
  + answer         jsonb null     waiting for a restarted bullet

verify_findings                    (new)
    id, build_id, run_id, ac_code null, kind 'criterion' | 'console' | 'network' | 'visual',
    reproduction text, severity text, status 'open' | 'fixed' | 'left' | 'accepted', note text null,
    accepted_by_user_id text null → users.id on delete set null, created_at

integrations                       (new)
    id, build_id, trigger 'built' | 'base_moved' | 'provider_moved' | 'retarget', onto text,
    status 'pending' | 'running' | 'done' | 'needs_you', regenerated jsonb, resolved jsonb,
    checks text null, created_at, finished_at

queue_messages   → repository_messages  (repository_id)

repositories  + auto_resolve_conflicts boolean not null default true
machines      + verify_lanes integer not null default 1,  + build_cap integer null
```

### API contract

```ts
// browser, member
GET    /line?repositoryId=…                         -> { builds, capacity }
POST   /plans/:id/approve                           -> { build }           // 409 carries an overlap decision
POST   /builds/:id/hold | /release | /cancel | /front | /retry   // hold on a running build is Stop
PUT    /line/order          { repositoryId, buildIds }
POST   /builds/:id/dependencies/:dependencyId/override
POST   /overlap-decisions/:id          { chosen }
POST   /builds/:id/ship-foundation                  -> { prUrl }
POST   /builds/:id/fix-again | /accept-gaps         // a criterion that failed its re-check
POST   /runs/:id/answer                { questionId, answers }

// browser, leader
PATCH  /repositories/:id               { autoResolveConflicts }
PATCH  /machines/:id                   { verifyLanes, buildCap }

// GitHub
POST   /github/webhook                 X-Hub-Signature-256

// removed
/queues/**   POST /plans/prepare   POST /plans/:id/confirm
```

### Wire protocol

```ts
// BE -> agent
{ type: 'build.worktree.ensure', buildId, slug, branch, startFrom, mergeIn: string[] }
{ type: 'build.push',            buildId, branch }
{ type: 'build.worktree.remove', buildId }
{ type: 'integrate.start',       integrationId, buildId, onto, regenerate, autoResolve, criteria }
{ type: 'exec.start', …, buildId, phase?, findings?, answer?, amendments }

// agent -> BE
{ type: 'build.pushed',          buildId, sha }
{ type: 'integrate.done',        integrationId, regenerated, resolved, checks }
{ type: 'integrate.needs_you',   integrationId, reason }

// removed: queue.worktree.*, queue.publish — the backend opens pull requests through the App (008)
```

### Screen layout

Navigation becomes **Plans · Machines · Members**. The Plans page is the board; there is no Queues page.
Every action on a plan happens on that plan's page, and the board only shows where everything stands.

**The plan page.** One header sits above every tab. A question or a Stop button one tab away is one that
gets missed — `queue-detail.tsx` already keeps its question above the panes for exactly that reason.

```
← Plans   #4 Comments on tasks                                [Stop]  [⋯]
● Building · bullet 2 of 3 · vps-1 · uses #3's foundation ✓
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠ Bullet 2 asks: "Show deleted comments as placeholders?"   [Answer] │
└──────────────────────────────────────────────────────────────────────┘
 Chat   Plan   Execution ●   Changes   Verification
```

The header's actions follow the state; `⋯` holds the rest:

| State | Header | `⋯` |
|---|---|---|
| Planning | — | Discard |
| Needs approval | **Approve** | Discard |
| Scheduled | Hold | Move to front, Cancel |
| Held | **Release** | Move to front, Cancel |
| Building, verifying | **Stop** | Cancel |
| Needs you | the question or decision, inline | Cancel |
| In review | Open pull request | — |

**Stop is a pause.** The running session is cancelled, its bullet goes back to pending, the branch and
every committed bullet stay, and the plan is held — what pausing a queue does today in
`control-queue.ts`. Release continues from the last commit. **Cancel** is the destructive one, in the menu:
the build is removed and its branch kept for inspection.

| Tab | Holds | Appears |
|---|---|---|
| **Chat** | The grill's transcript | always |
| **Plan** | Body; criteria with implemented and verified ticks; bullets, the foundation marked; footprint; dependencies ("uses `users.timezone` from #7"); amendments bosun made | once published |
| **Execution** | `Build → Integrate → Verify → Review`; every bullet with its live activity and report; what it waits for; questions asked and answered; retry | once approved |
| **Changes** | The change map; the pull request and its state; every integration — what was merged, `0013 → 0014` renumbered, each resolved conflict with its diff | once a bullet commits |
| **Verification** | Every criterion's verdict — verified, blocked, failed then fixed, accepted as a known gap and by whom — with its reproduction; console, network and visual findings with their status; the review agents' findings; check and re-check results | once a drive starts |

The page opens on Chat while planning, Plan while it needs approval, Execution while building or
verifying, and Verification once in review. The integration log sits in Changes rather than Execution
because it is read with the diff, by the reviewer, after the work is done.

**The board.**

```
Plans                                          Board | History      [New plan]
vps-1  build ▓▓▓▓▓▓░░ 9 / 14.5 GiB   verify lane: #2 driving
──────────────────────────────────────────────────────────────────────────────
Drafting    Needs approval  Scheduled         Building        Verifying     In review
#6 Anna     #5 Resend       #4 after #3's     #3 bullet 2/3   #2 driving    #1 PR #203
 grilling    Ben             foundation        Anna            Ben           conflict
                            #7 ⚠ needs you                                   resolved
```

- A card carries its number, title, owner and one reason line — `after #3's foundation`, `2nd to verify`,
  `migration renumbered 0013 → 0014` — and opens its plan on the tab its state makes relevant.
- Dragging within Scheduled is the only thing the board does: line order is a property of the line, so
  it has no plan page to live on.
- A needs-you card links to its plan, where the decision is made. An overlap decision belongs to the plan
  being approved, not to the one it collides with.
- The capacity strip shows, per machine, build memory in use and what holds the verify lane.
- **History** lists merged, failed and cancelled plans. It replaces today's plans list, which would
  otherwise show the same rows as the board.
- Repository chat — today's queue chat — opens as a drawer from the board.

**Needs you.** A count in the app header of every open question, overlap decision and unresolved
integration in the project, each linking to its plan. With actions only on plan pages, this is what
brings a person to the one that is waiting.

**Phones.** Plan tabs scroll sideways, and the board's columns become collapsible sections with counts.

### Removed

`fe/app/features/{create-queue,push-to-queue,enqueue-plans,prepare-parallel,control-queue,kill-queue,toggle-afk,confirm-plan}`,
`fe/app/views/{queues,queue-detail}`, `fe/app/widgets/{queues-panel,queue-detail,plans-list}` (the
plans list becomes the board's History view),
`be/src/controllers/queues/**` (replaced by `be/src/controllers/line/**`),
`be/src/controllers/plans/prepare-plans.ts` and `preparation.md`, `agent/src/prompts/preparation.ts` and
`prepare()` in `agent/src/planning/session.ts`.

## Key decisions

- **No queues.** The information a queue asked a person for — what conflicts, what fits — is information
  bosun holds.
- **Memory decides capacity.** The budget is already measured; a count of queues was a proxy for it.
- **A foundation bullet, not a foundation plan.** The shared piece is built once, inside the plan that
  first needs it, and dependents wait one bullet. No second grill, no rewritten plans, no lost sign-off.
- **Dependencies from declared footprints, deterministically.** A model resolves conflicts; it never
  decides what waits for what, because a dependency invented or missed by a model is invisible until it
  costs a day.
- **Stack; do not wait for merge.** Waiting for human review serialises everything behind the slowest
  reviewer.
- **Regenerate ordered artifacts; never merge them.** A migration number is only right relative to what
  it lands on.
- **Integrate before verify.** Verify drives the code that will be reviewed, not the code the branch
  happened to start from.
- **One lane, drive and fix apart.** Verify is the heaviest thing a machine does and only the browser
  pass needs the stack. Serialising only that part keeps the database honest without turning parallel
  builds back into a line.
- **The lane owns the database.** Cheaper than a database per slot, and a verify that passed against
  another plan's schema proves nothing.
- **Approval survives bosun's own changes.** Re-approving after every merge of the base would make
  approval a formality.

## Non-goals

- Dependencies across repositories
- Semantic conflicts no footprint expresses and no check catches
- Merging pull requests automatically
- Renumbering migrations without a generator; a repository with hand-written migrations supplies its
  own `regenerate` command
- A database per slot
- Stopping a running bullet to make room
- Duration estimates on the board

## Blockers & dependencies

- Plan 008: repositories, the GitHub App, `.bosun/project.yaml`, `stack_up`. The App gains `push` and
  `pull_request` webhook events and `GITHUB_WEBHOOK_SECRET` in `EnvSchema`
- Every running bullet drained before the migration; it refuses otherwise
- Drive and fix memory budgets measured on an 8 GB machine before the lane's reservation is trusted

## Slices

### Phase 1 — Dependents start from their blocker

On today's queues, first, because the bug is live: a plan with an unfinished-review blocker is cut from
the blocker's branch (or from a merge of several) instead of `origin/<base>`, and pushes after every
bullet. Small, and it makes preparation plans do what they claim.

### Phase 2 — Builds replace queues

`builds`, the scheduler on memory, the board, approve/hold/order, questions that release their slot,
hands-off, the migration. "Prepare for parallel work" stays until phase 3 replaces it.

### Phase 3 — Footprints and dependencies

Footprints, the foundation rule and the six-bullet cap in `publish_plan`, footprints in `list_plans`, detection at approval,
amendments, overlap decisions, "Run anyway", stacking, retargeting, "Ship foundation alone". Preparation
removed.

### Phase 4 — Integration

Webhooks and the reconcile, `integrations`, `regenerate`, the conflict session, checks, the pull request
section, re-verify after a resolved conflict.

### Phase 5 — The verify lane

Lane scheduling and lending, provider-verified ordering, the drive and fix split, findings, the re-check and the needs-you stop for one that fails,
the lane-owned database, and the execution prompt's migration rule.

## Risks

- **A footprint is only as good as its plan.** A schema change the plan never declared is found at
  integration — as a conflict or a red check — not at approval
- **A conflict session can resolve wrongly and pass the checks.** The resolved diff is in the pull
  request, and the switch is per repository
- **Stacked plans inherit their provider's review.** Every change requested on the provider is merged into
  its dependents and can re-queue their verify
- **The lane is the bottleneck when plans finish together.** The split, lending and `verify_lanes`
  soften it; a second machine is a second lane
- **Generators differ.** One that needs a database to generate (`prisma migrate dev`) breaks the rule that
  build bullets touch no database
- **Build bullets lose database-backed tests**, which move to the lane
- **Branches pushed after every bullet** put unfinished work on the remote
- **The migration is one-way** and changes how every project runs, not only those with parallel work

## Verification

- Two engineers approve the five plans from this plan's discussion — Invites, Dark mode, Avatars,
  Comments (uses `<Avatar>`), Resend expired invites (needs all of Invites) — on one 16 GB machine.
  Comments starts once Avatars' foundation lands; Resend starts once Invites finishes building; only one
  plan drives at a time; no queue exists
- Two plans each add `users.timezone` identically: approving the second amends it, with no question; with
  different definitions, the second waits on an overlap decision
- Three plans each generate `0013`: they merge in any order, and `main` ends at `0015` with no manual edit
- Two plans add a route at the same line of `users.routes.ts`: the second's pull request shows the resolved
  diff and green checks
- A question unanswered for 10 minutes frees its slot for the next plan; answering restarts that bullet
  with the answer
- A plan joins the verify line while four build bullets run: no new build bullet starts in the lane's
  memory, and the drive starts when one finishes
- A drive finds two broken criteria; the fix session repairs them; the re-check drives only those two
- Avatars merges: Comments' pull request is retargeted to `main` and integrated without anybody touching
  it
- "Ship foundation alone" on Avatars opens a pull request with only its first bullet's commit
- A missed `pull_request` webhook is caught by the reconcile within five minutes
- A bullet asks a question while its plan's Changes tab is open: the question is answerable from that
  tab, and the header count shows it on every other page
- Stop on a building plan leaves it held with its committed bullets; Release runs the bullet that was
  stopped, not the first one
- A session publishing seven build bullets is refused, and republishes with six or fewer or splits the
  plan
- A criterion still failing at re-check stops the plan on needs you; accepting it opens the pull request
  with that criterion under Known gaps and the name of whoever accepted it
