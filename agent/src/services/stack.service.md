# The stack: `stack_up` and `stack_down`

## Why the agent starts the processes

A session used to start the dev stack itself, from a start command it read in the prompt or discovered.
Two plans building on one machine then broke in ways neither session could explain: each picked a port,
each frontend defaulted to the backend on the port in its `.env`, and a verify session drove plan B's
frontend against plan A's backend. What "start the stack" meant also changed from session to session.

Now the agent starts every app of `.bosun/project.yaml` the same way everywhere — a verify drive,
onboarding's verify, a second machine — and the session only decides *when*. The memory rules in
`prompts/shared.ts` depend on that: the stack is up for the browser pass and down before the loop runs.

## Invariants

- **Ports by position.** An app's port is `portBase` plus its index in `apps`; its URL is
  `http://127.0.0.1:<port>`. `{port}`, `{url}`, `{port.<app>}` and `{url.<app>}` are substituted into
  `start`, `ready` and every `env` value, so a frontend is handed its own build's backend. There is no
  allocator and no second place to look, which is why a build's ten ports cap a config at ten apps and
  why reordering `apps` renumbers them.
- **Dependencies start first, and a requested app brings its dependencies.** Each app must answer its
  readiness check before the next starts: `ready` polled once a second until any status below 500 or
  `readyTimeoutSeconds` (90 by default). An app without `ready` counts as up if it is still alive two
  seconds after starting.
- **A failed `up` leaves nothing running.** The first app that exits early, times out or has no
  directory stops everything this `up` started and returns the app, the reason and the tail of its log.
  A stack half up is a stack a session would drive and misread.
- **Process groups, not pids.** Each app is `sh -c <start>` in a group of its own; stopping signals the
  whole group — SIGTERM, then SIGKILL after five seconds — and signals it even when the shell has
  already exited, because `pnpm dev` leaves a server behind its shell. Dependents are stopped first.
- **One stack per key.** A second `up` for the same key (a run id) stops the first. The session that
  owns the key calls `down` when it ends, however it ends, and the agent calls `downAll` on shutdown.

## Memory

When the machine has scopes, each app runs in `bosun-run-<key>-<app>.scope` under the bullet's limit,
through the same `memory.sessionScope` a session uses. The limit applies per app rather than across the
stack — a scope cannot join a scope that already exists — and the `bosun-run-` prefix is what lets a
restarted agent's `reapOrphans` stop a stack the process before it left running.

## Where failures surface

Each app writes to `~/.bosun/logs/<key>/<app>.log`, appended across restarts with a header per start.
The session gets the log path on success and the last forty lines on failure; the reason is one line —
`exited before it was ready (code 1)`, `did not answer http://127.0.0.1:4101 within 90s` — because it
also becomes a verify step's detail in the browser.
