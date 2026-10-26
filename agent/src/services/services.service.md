# Services: the background processes a project leaves running

A project that develops against a local Supabase, or anything else brought up with `docker compose up
-d`, has a step a person runs once and then forgets: the containers stay up across shells, editors and
reboots of the dev server. The config names those under `Services:` — a `Start` that returns once the
thing is up, a `Check` that exits 0 while it is, an optional `Stop`. Bosun stays tool-agnostic: it never
knows it is talking to docker, only that these three commands exist.

Before this, the only place such a command fitted was an app, and `stack.service.ts` reads an app's
start command exiting as a crash. `supabase start` exits as soon as its containers are up.

## Why one set per machine, not per build

The lane database is the machine's own (`DATABASE_STATE` in `prompts/shared.ts`): builds never apply
migrations, the lane resets and migrates it before each drive, and every worktree gets the same env
files pointing at the same URL. A service is the thing behind that URL, so it is shared exactly as the
database is. Nothing stops a service when a run ends — a running Supabase is what the next build
expects to find.

## Invariants

- **Check, then start.** Every caller runs `ensure` before it runs a project command that may need a
  service: the worktree ensure before setup, an execution session before its setup re-run and the
  lane's reset/migrate, `stack_up` before any app, a quick fix before setup, an integration before
  regenerate and checks. A passing check costs one command; only a failing one runs `start`, then
  polls the check every two seconds until `Ready timeout` (120s by default).
- **Serialised in-process.** One promise chain covers every `ensure` on the machine. Two builds
  taking slots at once would otherwise both see the check fail and both run `supabase start` against
  the same containers, which fails the slower one with a name conflict.
- **Outside the run's scope.** `start` runs through `runShell`, unscoped, in a process group of its
  own that nothing kills when it returns. That is deliberate — a service outlives every run — and
  is also unavoidable: the containers belong to `dockerd`, not to anything the agent spawned
  (see `memory.service.md`).
- **Stopped only when the machine is removed.** `terminateSelf` calls `stopAll` before deleting
  `~/.bosun`. Teardown has no config to read, so every `ensure` writes `~/.bosun/services.json`
  (mode `0600`): each service's name, the worktree it was ensured from, its `cwd` and `stop` command,
  and the `PATH` it ran under, so a `pnpm db:down` finds the provisioned toolchain. No other
  environment is recorded: the rest carries credentials. A stop runs in that worktree, or in the clone
  checkout when the worktree has since gone, in reverse order, best-effort.

## Failure modes

- **A start or a readiness check that fails** fails whatever called `ensure` with the service, the step
  and the tail of the output: `service "db" start failed (exited with 1): … permission denied …`. A
  worktree ensure fails the build, a session fails its start, `stack_up` returns it as the app that did
  not come up, an integration stops as needing a person.
- **Docker missing or not usable by the bosun user** surfaces as that tail, followed by the root
  command that fixes it: when the tail carries docker's own words for a missing CLI, a denied socket
  or a stopped daemon (`docker.ts`), the detail ends with `apt-get install -y docker.io && usermod
  …`, the `usermod` alone, or `systemctl enable --now docker`. Bosun still never assumes docker — the
  hint is read off whatever the start printed. The `docker` preflight check shows the same before any
  verify: green when docker is absent, since the machine holds no config to know it is needed, red when
  it is installed and unusable. The installer puts it on new machines; an existing one runs the
  command, since the agent cannot install anything as root. Discovery is told to look for it (`docker
  info`) and say so before verify runs the config.
- **A start command that backgrounds a process holding its output** (`some-server &`) keeps the pipes
  open and is read as still running until the fifteen-minute start timeout. `Start` must be a command
  that returns once the service is up — `docker compose up -d`, `supabase start`.

- **A start that depends on the folder it runs in.** `ensure` runs from whichever worktree asked, each
  a different directory. `supabase start` keys its containers on `project_id` in `config.toml`, so every
  worktree finds the same ones; `docker compose` keys them on the folder name unless told otherwise,
  and would start a second stack per worktree fighting over the same ports. Discovery is told to pin
  the project (`-p <name>`, or `name:` in the compose file).

## Rejected

- **A stack per build** — a compose project name and ports per build from env. Every build would need
  its own copy of the database, its own migrations applied, and memory for all of them; the lane model
  (one database the lane resets) exists precisely so builds share one.
- **A service as a stack app.** An app lives as long as its process and is stopped with the run; a
  service must outlive both, and its start command exits by design.
