# Integrations

An integration keeps one build's branch mergeable with what it lands on — the default branch, or its
provider's branch while it is stacked. The backend starts one when a plan finishes building, and again
whenever that base moves while the build is unmerged — or, while it is still building, when a bullet
could not merge a provider's branch before it started. It runs in a build slot, in the build's own
worktree, and at most one job runs in a worktree at a time: the backend never starts an integration
beside a bullet, a drive or a fix session of the same build.

`git.ts` is every git step, kept apart so each one can be driven against a real repository in
`git.test.ts`. `session.ts` sequences them, runs the commands the config names, and hands a real
conflict to a `claude` session.

## The steps, and why each is shaped this way

1. **Sync, then fetch `onto` by refspec.** The branch on the remote may have gained a reviewer's commit;
   an integration pushed without it is refused. `onto` is fetched by explicit refspec because a clone's
   default refspec can cover only the default branch, and a provider's branch would never appear.
2. **Already contained → nothing merged, checks skipped.** Still pushed, so a sync that brought in the
   remote's commits reaches it.
3. **Take the target's generated files.** Every file under a `regenerate` path the branch added or
   changed since it left `onto` gets `onto`'s copy, or goes when `onto` has none, in a commit of its
   own. What is left to merge under those paths is then identical on both sides, so it cannot conflict.
   This is the whole mechanism behind two plans that both generated migration `0013` landing as `0013`
   and `0014`: the second one's migration is not merged, it is generated again against the first.
4. **Merge, never rebase.** Each bullet's sha is recorded against its slice; a rebase leaves those
   pointing at commits no branch contains. A generated path that still conflicts takes `onto`'s side.
5. **A real conflict goes to a session — only when the repository allows it.** The session gets this
   plan's criteria and the criteria of every plan whose `bosun/plan/<n>` branch the target's history
   names for the conflicted files, because a conflict resolved with one plan's intent in view is how the
   other plan's feature silently goes. It may edit, read and run; it may not use git, and its credential
   helper is cleared so it cannot push. It ends resolved, or with `give_up`. "Resolved" is decided here,
   not by the session: no conflict marker may remain in any file it was given.
6. **Each `regenerate` command runs in order, then setup re-runs for changed lockfiles.** The tree is
   staged before each command, so what the command changed is exactly what is left unstaged — which is
   what the pull request lists as regenerated, rather than every file the merge brought in. Setup comes
   second because step 3 leaves a regenerated lockfile at the target's copy: the other way round, a
   frozen install met the branch's manifest with the target's lockfile and refused every dependency the
   branch had added. A regenerate command therefore runs on the dependencies the worktree already has.
7. **Commit, then the checks.** Red gets one repair from the same kind of session, then the checks run
   again. Still red is needs you.
8. **Push last.** Nothing is pushed while a check is red.

## Invariants

- **A failed integration leaves the worktree where it started.** Every outcome that is not `done` —
  needs you, an error, a cancel — ends in `abandon(preHead)`: merge aborted, reset, cleaned. A half-merged
  tree would be committed, markers and all, by the next bullet or integration.
- **One repair, never a loop.** A fix-and-check cycle nobody chose is how an integration runs all
  afternoon; the second red goes to a person.
- **The integration is held across reconnects.** Built in `holdConnection` beside the execution
  sessions, reported in `hello.integrationIds`, and its outcome frames are settling frames the sink
  buffers. The backend puts back every integration it cannot account for, so naming one that has no
  process and no parked frame would leave it `running` forever.
- **The env files bosun wrote are never committed.** Every commit here keeps out the `.env` files the
  env store produced, for the same reason bullets do.
