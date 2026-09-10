# The read tree

## The failure it exists to stop

Every read-only session — planning, revision, preparation — used to run with its cwd set to
`config.repoPath`: the machine's own checkout, at whatever commit and on whatever branch the operator
last left it, with no fetch anywhere in the path. Nothing in the agent ever refreshed it.

So a session's recon answered questions about a tree that could be days old, and answered them with
confidence. The observed failure was a preparation session proposing to build a table that had landed
the week before — the tree it read genuinely did not have it. Every "does X already exist?" a session
asks is decided against that tree, which makes staleness the most expensive kind of wrong: it
produces work that looks correct and duplicates something already merged.

## What it does instead

`readTree()` returns a checkout of the **current default branch**, refreshed on every session:

1. `fetch()` — `git fetch --all --prune --tags` on the machine's checkout.
2. If `refs/remotes/origin/HEAD` is missing, `git remote set-head origin --auto`. A clone made with
   `--single-branch`, or one whose remote HEAD was never recorded, otherwise falls back to whatever
   branch the operator has checked out, and the whole session plans against the wrong line.
3. Resolve the base ref, then put a **detached** worktree at `~/.bosun/read-tree` on it.
4. Copy the untracked files across — `.env` and its neighbours exist only in the machine's checkout,
   and a session reading the repository to learn its conventions cannot find them anywhere else.

It is the same ref every queue cuts its branches from, so what a plan is written against is what the
work will actually be built on top of.

## Why not just refresh the machine's checkout

That checkout is the operator's. It can be dirty, mid-rebase, or parked on an unrelated branch, and
`reset --hard` on it to get a clean read destroys work bosun was never asked to touch. A
`pull --ff-only` avoids the destruction but fails on exactly the checkouts most likely to be stale,
which puts the fix back where it started.

A worktree of its own costs one directory and is always exactly right.

**Detached, not on a branch.** A branch would claim a name under `refs/heads/`, and queue slugs
already own `bosun/worktree/<slug>` and `bosun/plan/<slug>`. Detached claims nothing, collides with
nothing, and leaves no branch behind when the directory is removed.

## Invariants

- **The machine's checkout is never written to.** Only `fetch` and read-only plumbing run against
  `repoPath`. A test asserts the operator's branch and uncommitted file survive a `readTree()`.
- **A failure degrades, it does not throw.** Every failure path returns the machine's checkout with
  `fresh: false` and the reason. A session still runs; `prompts/shared.ts` renders the reason so it
  knows it is reading a tree of unknown age and says so rather than reporting "X does not exist" as a
  fact.
- **The tree is only moved when the target commit differs.** Two sessions reading the same commit
  never move it under each other. Two sessions on different commits mean the second one moves it
  forward, which is at worst the first session seeing newer code — and far better than either seeing
  stale code.
- **Sessions that write are not part of this.** Execution runs in the queue's worktree on the plan's
  branch, and `execution/commit.ts` `startBranch` does its own fetch when it cuts the branch. A later
  bullet must stay where the earlier ones committed, so it fetches nothing.

## Where it is called

- `planning/session.ts` — `start`, `say` and `prepare` each resolve a tree before spawning, and its
  path becomes the session's cwd. Resolved per session rather than once at connect: a machine can
  hold a socket for days, and what `origin/HEAD` pointed at when it connected is exactly the
  staleness this removes.
- `worktree.service.ts` `ensure` — fetches before resolving the base ref, so a new queue's worktree,
  and the setup command it runs, start from code that has not moved on without them.
- `preflight.service.ts` — `git` now also reports whether `origin` is reachable, and is **red** when
  it is not. A machine that cannot fetch keeps working against its last successful fetch, silently;
  that is the one failure mode worth a red check even though sessions still start.
