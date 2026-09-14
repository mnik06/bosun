# The clone and its credential

## What changed, and why

A machine used to work in whatever directory `install.sh` was run from. That made the order of
commands on the box load-bearing — `cd` into the right checkout first, or the machine is enrolled
against the wrong directory with no way back short of deleting it — and it meant the box needed a
`gh` login that reaches every repository its owner can.

A machine enrolled under plan 008 has no checkout until bosun attaches a repository. `repo.attach`
clones the repository's default branch into `~/.bosun/repos/<slug>`, and from then on
`config.json`'s `repository` names the clone every service works in. Where the installer ran has no
bearing on any of it.

A machine enrolled before (`repoPath` in its config, no `repository`) keeps its operator's checkout
and `gh`, unchanged.

## Invariants

- **Every service reads the path at the moment it needs it.** `repo`, `worktree`, `skills` and
  `preflight` take a getter, not a string. An attach rewrites `config.json` while the agent runs, and
  a service holding the path it was built with would keep working in the old checkout until a restart.
- **The clone is renamed into place only once it is whole.** It is cloned to `<slug>.cloning` and
  renamed, so an interrupted clone is never mistaken for the repository on the next attempt.
- **No GitHub token touches the disk.** The clone's own `.git/config` names the agent as git's
  credential helper for `https://github.com`. git calls `bosun-agent git-credential get` on every fetch
  and push; the command asks `POST /agent/git-credential` with the machine key and prints the token
  into git's pipe. The backend mints it for the one repository this machine is attached to, with
  `contents: write`, and it expires within the hour.
- **The empty `credential.helper` comes first.** It clears every helper a global config added — a
  `gh auth setup-git` left on the box would otherwise answer before bosun's with a credential that
  reaches everything its owner can.
- **Attaching again is a fetch, not a second clone.** The same repository is refreshed in place; a
  different repository is refused, because one machine works on one repository.
- **The read tree is dropped when a legacy machine is attached.** It was a worktree of the operator's
  checkout and would otherwise point at another repository's objects.

## Failure modes

- **`repo.error` with git's message** — the clone could not authenticate (the App no longer grants the
  repository, or the backend refused the credential) or the network failed. The backend clears the
  machine's `repository_id`, so attaching again starts clean.
- **`git` preflight red with "cannot reach origin"** on a repository machine is the credential helper
  failing: `bosun-agent git-credential get` prints its reason on stderr when run by hand with
  `printf 'protocol=https\nhost=github.com\n\n'` on stdin.
- **A backend outage stops pushes.** Tokens are cached in the backend for most of their hour, which
  covers a deploy but not a long outage; a bullet's push fails and is reported rather than lost, and an integration stops before it pushes.
- **A session can call the helper.** It has `Bash` and the helper is on its `PATH`. What it gets is an
  hour of `contents: write` on the repository it is already working in. Onboarding's discovery runs
  with `GIT_CONFIG_*` clearing every helper, so it has nothing to push with at all.
