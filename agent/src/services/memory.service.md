# Memory: why a bullet runs in a scope of its own

A verify bullet on an 8 GB machine used to take the agent down with it. The kernel's out-of-memory
killer acted inside `bosun-agent.service`, the unit's default `OOMPolicy=stop` then stopped the whole
unit — the agent and every `claude` beside it — and systemd restarted it five seconds later. The
backend saw a fresh process with none of its bullets and stopped every one of them as "the agent
restarted". Nothing had crashed; the box had simply run out.

## What changed

**Each execution session runs in `bosun-run-<machineId>-<runId>.scope`,** started through
`systemd-run --user --scope`. The scope execs `claude` in the same process, so the pid the agent holds
is still `claude`'s and killing its process group still reaps everything the session started.

- `MemoryMax=` is the limit the scheduler sent on `exec.start` (`memoryMaxBytes`). A backend too old to
  send one gets what the machine can spare: RAM plus half of swap, less a 1.5 GB reserve.
- `OOMPolicy=continue` means a process killed for going over the limit is one failed command. The
  default for a scope is `stop`, which would end the `claude` that ran it.
- The scope is outside the agent's unit, so even a kill that does reach the agent leaves the sessions
  standing. That is also why `run` stops its machine's `bosun-run-<machineId>-*.scope` on startup: a
  session the previous process left behind would otherwise keep writing to a worktree the backend is
  about to hand the same bullet to again.
- **The machine id is in the name because scopes belong to the user, not the agent.** Every agent under
  that user sees every scope. When the pattern was `bosun-run-*`, a verify session that enrolled a test
  machine and started a second agent on the box killed every session the real agent was running, its
  own included — each failing as `claude exited with code 143`. Scopes named before the machine was in
  the name are never reaped: an upgrade only lands on an idle machine, so none is an abandoned bullet.

**The kill is counted, not guessed.** `spawnClaudeSession` reads the scope's `memory.events` every two
seconds and once more on exit. A session that ends with `SIGKILL` and a non-zero `oom_kill` fails with
"the bullet ran out of memory" instead of "claude exited with code unknown". A command killed while
`claude` survives is logged and shown as activity; the prompt tells the session that `Killed` / exit
137 means memory, not a failing check.

**The machine says what it has.** `hello` carries `memory` — total, available, swap, and whether scopes
work here — which the backend's scheduler admits builds, drives, fix sessions and integrations against.
It also carries `previousExit`, the result systemd logged for the process before this one, so a bullet
stranded by the kernel killing the agent is reported as out of memory rather than as a restart.

## Where it does not apply

- **Off Linux, or without a user manager** (a container, an agent run by hand over `ssh` without
  linger), `systemd-run --user` fails its startup probe. Sessions run unscoped exactly as before, and
  the `memory` preflight check goes red to say so.
- **Planning, ask and summary sessions** stay unscoped. Integration sessions are scoped like bullets:
  they run a project's checks. They read; they do not run a project's loop.
