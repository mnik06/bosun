# Setup steps: run in order, fail loudly, re-run when their inputs change

## The two bugs this replaced

1. **A failed setup reported the worktree ready.** The worktree ensure logged the setup command's
   failure and reported the worktree ready regardless, and every bullet after it failed an hour in on a
   missing `node_modules`, with the install's error only ever in the journal.
2. **A worktree kept the dependencies it was created with, forever.** A plan that added a dependency
   landed, and every later plan built in that worktree used the `node_modules` from before it. A stacked
   plan merging in its provider, or an integration merging its base, changes lockfiles the same way.

## What happens now

**A repository machine** runs the `setup` steps of the config it finds — the worktree's own
`.bosun/project.yaml`, or the draft when the file does not exist — in order, under the toolchain the
config names, when `build.worktree.ensure` creates a build's worktree and cuts its branch. The first
step that fails fails the build with the step's name and the tail of its output. Before every bullet, a step with `rerunWhen` runs again when the content of any listed file
differs from what it was the last time the step succeeded — and so does an integration, after its merge
and before its regenerate commands and checks.

**A machine with no repository** keeps its one setup command, with the same two properties: a failure
fails the bullet, and the command re-runs before a bullet when any tracked lockfile (`git ls-files`
over the usual lockfile names) changed.

## Invariants

- **Hashes are recorded only after success.** A failed step forgets its hash, so the next bullet tries
  it again instead of trusting a half-installed tree.
- **State is per worktree, by slug**, in `~/.bosun/setup-state/<slug>.json`, and removed with the
  build's worktree. A worktree with no recorded state runs its steps once — which is what an upgraded machine
  sees on its first bullet.
- **Output is streamed, not buffered.** An install prints megabytes; a buffered child is killed for
  overflowing its buffer rather than for failing. Only the last 4 000 characters are kept, because the
  tail is where a failure says what it was.
- **A missing file hashes as absent.** A lockfile that appears later counts as a change.
- **Setup never sees session secrets.** Steps run with the credential environment and the toolchain;
  test-account passwords are for sessions, and a setup script that echoes its environment would put
  them in a log.
