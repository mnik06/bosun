# Project env: the real services, kept on the machine

Verify bullets kept failing for want of a database. A worktree is a fresh checkout, the app had no
`DATABASE_URL`, and the session did what an unattended session does with a missing service: it built
one — PGlite or an embedded Postgres in `/tmp`, eating the memory the bullet needed and proving nothing
about the database the product actually runs on.

So the operator provides the real connection, per path in the repository, and bosun writes it into
`<worktree>/<path>/.env` before every bullet.

## Why the values live only on this box

The browser sends a set once. The backend relays it over the socket in `env.set` and keeps nothing;
the agent stores it in `~/.bosun/project-env.json` (0600, written to a temp file and renamed so a crash
cannot truncate it). What travels back is `EnvSetSummary` — paths, key names, a timestamp. Never a value:
not in `env.saved`, not in `env.error`, not in `hello`, not in a log line, not in a prompt.

The machine already holds every other credential a bullet uses (`~/.bosun/env`, `~/.bosun/mcp.json`),
and it is the only place the value is needed. Keeping it in bosun too would make the backend a second
copy of every project's production secrets for no reader that needs them. Deleting the machine in the
browser removes `~/.bosun` with everything else in it.

## Merge semantics

**The store:** `env.set` replaces the set for that path with exactly the keys it names — a key missing
from the frame is removed. A `null` value keeps what is stored for that key, which is how the browser
edits a set whose values it never saw; `null` for a key with nothing stored is an error. Path and
duplicate keys are validated here as well as in the backend, because this is the side that turns the
path into a file.

**The file:** `mergeEnvFile` rewrites only the provided keys. The first line defining each one is
replaced, later definitions of it are dropped (most readers take the last one, which would quietly
win), every other line — the project's own settings, comments — is left exactly as it was, and keys
the file lacked are appended.

## When files are written

- `queue.worktree.ensure`, after the worktree exists and before the setup command, so a setup that
  migrates or generates a client runs against the real service.
- Every bullet, in `startProcess`, after the branch is cut or the tree cleaned — `git clean -fd`
  removes an untracked `.env` — and before the session starts. A failure to write fails the bullet.

A path whose directory the worktree does not have is skipped and logged, never created.

`commitAll` unstages the files it wrote after `git add -A`. A repository that does not ignore `.env`
would otherwise commit the values into the plan's branch and push them with the pull request.

## What delete does

`env.delete` removes the stored set, and nothing else. The `.env` files already written into
worktrees are left alone: they may hold the project's own lines, and a running bullet may be reading
them. The next bullet simply stops rewriting those keys. To remove them from a worktree, edit the file
there or remove the queue.

A corrupt or unreadable store is treated as empty and logged once, without its content.
