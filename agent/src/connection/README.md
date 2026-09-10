# The agent's connection loop

`run` is a loop around a single connection attempt. Almost every path — dropped, closed cleanly,
never established, refused for any reason but one — funnels into the same place: wait, then try
again. There are exactly two paths out of the loop, and both mean the same thing: this machine has
been deleted in bosun.

## The two termination paths

Bosun can only reach a machine through a socket that machine opened. There is no inbound port, no
key, no way to stop a process from the browser — so an agent whose machine has been deleted has to
stop *itself*. It learns this in one of two ways, and it needs both:

**A `shutdown` frame**, when the machine was deleted while the agent was connected. The backend sends
it and closes the socket without waiting for an answer, because waiting would hang the request for
exactly the machine most likely to be off the network already.

**A `401` on connect**, when the machine was deleted while the agent was disconnected. There was no
socket to send anything on, so the refusal is the message. This deliberately narrows the rule above:
a refused upgrade carrying a well-formed key means the credential was destroyed on purpose, retrying
cannot fix it, and retrying forever is how a deleted machine becomes a process that reconnects every
thirty seconds until somebody notices. Network errors, 5xx and dropped sockets are all still retried
unchanged — only `401` is terminal.

The second path is what makes a missed `shutdown` self-correcting, which is why it is required rather
than a nicety. If the backend dies between deleting the row and the frame arriving, the agent keeps
running against a backend that has never heard of it — until its next reconnect, which is a 401.

`teardown.service.ts` removes bosun from the machine and exits 0. It uses `disable`, not
`disable --now`: `--now` stops the unit this very process is running inside, racing the rest of the
teardown. Exiting 0 is what stops it; `disable` is only what keeps it from returning on the next boot.

### Deleting a machine erases it, not just its config

An earlier version removed `config.json` and left everything else. That is worse than untidy: a
de-provisioned box kept `~/.bosun/env`, which holds the Claude credential and every MCP server's
token. Removing a machine in the browser is the only signal the operator gets to give, and after it
those secrets are litter on a host bosun no longer manages.

So the teardown removes the systemd unit, the whole `~/.bosun` directory, the config path named on
the command line (which `--config` may have put elsewhere), and the binary along with the
`.previous`/`.next` files an upgrade leaves behind. Every removal is attempted even when an earlier
one fails — a machine must not keep its credentials because its unit file happened to be gone
already. What could not be removed is named on stdout so it can be finished by hand.

Two things are deliberately left:

- **`~/.claude`** is Claude Code's own store. The operator set it up, it is useful without bosun, and
  bosun did not install it.
- **`loginctl enable-linger`** is a user-wide setting other services may depend on.

The binary is removed last and only when the running executable is a packaged `bosun-agent`. Under
`node dist/src/index.js` the running executable is node, and deleting a user's node install because a
machine was removed in a browser is not a trade anyone would accept. Unlinking the running binary is
safe on Linux — the process keeps its inode until it exits.

**This depends on `Restart=on-failure` in the unit.** Under `Restart=always` — what `install.sh`
wrote before this plan — systemd restarts the agent no matter why it exited, so a deliberate shutdown
becomes a restart loop against a 401. Agents installed before the change need `install.sh` re-run, or
the unit edited by hand.

## Why hello and preflight are re-sent on every connect

The backend keeps no memory of a machine between sockets, and preflight describes a box that changes
underneath us — a repo goes dirty, a token expires, someone installs pnpm. Re-sending on every
connect means the reconnect path and the first-connect path are the same code, and the checklist in
the browser always describes the current machine rather than the machine as it was at enrollment.

## Why execution and planning sessions outlive the connection

Ask sessions are per-connection and are cancelled on close: one is a single question answered over
*that* socket by a queue that is waiting on the reply, so a session whose socket has gone has nobody
left to answer it.

Execution was the first exception, and it took a backend deploy killing a twenty-minute bullet to
make the difference obvious. An AFK run needs the socket to **report**, not to **work**. `claude` is
building in a worktree; nothing about that depends on a TCP connection to bosun existing at any given
instant. Cancelling it on close threw away real work for a one-second blip, and the deploy path made
that routine — every release killed whatever the fleet was mid-way through.

Planning is the same argument arriving later. A grill was treated as belonging to its socket because
an answer travels over one — but the *waiting* does not. The session is blocked in a `bosun_ask` tool
call while somebody reads the question, goes to a meeting and comes back; an idle socket reaped by a
proxy in the meantime used to end the grill and fail the plan, which is what "the planning session
dies when I leave it alone" was. The answer still needs a socket, and there is one by the time
anybody types.

So `createExecutionSessions` and `createPlanningSessions` are both built in `holdConnection`, outside
the reconnect loop, and the socket handlers do not cancel either. Three things follow, and all three
are load-bearing:

**Frames go through a sink, not a socket.** `frame-sink.ts` holds a slot for whatever connection is
current. `attach` on `open`, `detach` on `close` or `error`. A session started on one connection
reports on the next one without knowing that happened.

**Settling frames are buffered; the live view is dropped.** `exec.done`, `exec.error`,
`exec.question` and their `plan.` counterparts change what the backend believes and are replayed on
the next `attach`. A question counts as settling for the same reason a result does: it is the session
stopping to wait for a person, and losing it leaves a grill blocked on a tool call the browser was
never told about. `exec.text`, `exec.activity`, `plan.text` and `plan.activity` are the browser's
live view — buffering those would grow without bound for the length of the outage and then redraw a
transcript the browser already has.

**A stop signal reaps what a close no longer does.** The children are spawned `detached` so
cancelling takes their process group with them, which also means nothing takes them when this process
is stopped. `holdConnection` handles `SIGTERM` and `SIGINT` and cancels both maps before exiting —
without it every `systemctl restart` leaves a `claude` per live session holding a port, a worktree and
a credential.

**`hello` carries every run and every plan whose outcome is still coming.** That is the live sessions *plus* the
sink's parked frames — a bullet that finished during the outage has no session left holding it, but
its `exec.done` is sitting in the buffer, and a backend that settled that run as stranded would pause
the queue over a plan which in fact landed and hand the same bullet out again on resume. The backend
settles every run it cannot account for (`stallMachineRuns`), so this list is the whole of what keeps
it from resetting the sessions the reconnect was supposed to preserve. `planIds` is the identical
mechanism for grills, read by `stallMachinePlans`. `announce` sends `hello` before its first `await`
and the sink is attached after, so the backend learns what survived before any buffered frame arrives
describing it.

An answer to a question asked before the drop still lands, because the per-run MCP server is part of
the session and survives with it. `MCP_TOOL_TIMEOUT` is 30 minutes, which is the real ceiling on how
long the backend can be away while a bullet is blocked on a grill.

**Invariant:** the agent must not name a run in `hello.runIds` unless it is either holding a process
for it or holding its settling frame. The backend trusts that list to mean "an outcome is still
coming" and will leave the row `running` indefinitely on the strength of it — which is the exact bug
this whole mechanism exists to prevent, reintroduced from the other side.

What still kills a bullet: an agent restart or self-upgrade (already gated — `upgrade.decide` refuses
while sessions run), a machine reboot, an explicit pause, and a backend away for longer than the MCP
tool timeout while a question is outstanding.

## Why the backoff is jittered

Capped exponential from 1s to 30s, multiplied by a random factor between 0.7 and 1.3. The cap keeps
a long outage from pushing reconnects hours apart; the jitter is what matters at scale. When the
backend restarts, every agent is disconnected at the same instant — an unjittered backoff would
bring them all back in the same tick, repeatedly, turning a restart into a self-inflicted thundering
herd.

A successful connection resets the attempt counter, so a healthy agent that loses its socket
reconnects in about a second rather than inheriting the delay from an earlier outage.

## Invariants

- **The promise settles exactly once.** `error` and `close` both fire on a failed connection, in
  either order. Without the `settled` guard the loop would advance twice for one connection and the
  backoff would run at double rate.
- **A `401` is terminal; every other refusal is not.** `unexpected-response` with any other status
  goes through the ordinary backoff. Widening the terminal case to "any refusal" would let a
  misconfigured proxy returning 403 uninstall every agent in the fleet.
- **`paused` is remembered across reconnects and re-announced by the backend.** The row outranks the
  socket, so an agent that restarts comes back paused; the backend re-sends `pause` after `hello`,
  which is what keeps the agent's log honest rather than silent.
- **Execution sessions are not cancelled by a socket closing; every other kind is.** `socket.on
  ('close')` and `socket.on('error')` cancel planning, summary and ask sessions and detach the sink.
  Adding `executions.cancelAll()` back to either would restore the bug where a deploy kills whatever
  the fleet is mid-way through.
- **Frames are parsed before they are acted on.** The protocol schema is duplicated between the two
  packages on purpose; if it drifts, an unparseable frame is logged and dropped rather than
  half-handled. Silence in the logs and a dead ping button is the symptom of drift.

## Failure modes

- **Restart loop, each cycle logging a shutdown** — the unit still says `Restart=always`, from an
  install predating this plan. The agent exits cleanly and systemd brings it straight back. Re-run
  `install.sh`, or set `Restart=on-failure` in `~/.config/systemd/user/bosun-agent.service`.
- **`server refused the connection (403)` in a loop** — not a revocation, so not terminal. Something
  between the agent and the backend is rejecting the upgrade; the key itself is fine.
- **Connects then immediately closes, repeatedly** — usually a second agent process running against
  the same config, each one evicting the other on connect.
- **Green in the browser but no pong** — the socket is alive and the ping frame arrived, but the
  agent's message handler threw. Check the agent log; the loop keeps the socket open.

## Refresh is the same thing as connecting

`refresh` runs the identical announce the `open` handler runs: `hello` followed by a freshly
collected preflight. It is not a cheaper subset, and that is the point — every source it reports on
is read from disk at that moment, so a credential pasted into `~/.bosun/env`, a server added to
`~/.bosun/mcp.json` or a skill pulled into the repo takes effect without restarting the unit.

The agent re-reads `~/.bosun/env` itself rather than relying on `process.env`, because systemd
consults `EnvironmentFile=` only at unit start; a value added afterwards is otherwise invisible for
the life of the process. `PATH` is excluded from that overlay: the unit's `Environment=PATH=` is
resolved at install time from the shell that ran the installer, and letting the env file win would
silently break tool discovery.

Re-sending `hello` is safe because `markOnline` writes reachability through a `case` that leaves a
`paused` row paused. A refresh cannot un-pause a machine.

What refresh cannot do is change the running binary. `AGENT_VERSION` is compiled in, so a new build
requires a restart — which is a reconnect, and therefore an announce anyway.

## Self-update

An agent replaces its own binary only when somebody hits Refresh. The `hello` frame carries a
`reason`, and the backend offers an `upgrade` frame solely for `reason: 'refresh'` — never on
connect. A connect-triggered upgrade would push a new build to every machine the moment it
reconnects, which turns one bad release into a fleet-wide outage that nobody chose.

**Which build a machine is told to run is discovered, not configured.** The backend follows
`AGENT_LATEST_RELEASE_URL` — `.../releases/latest`, which redirects to the newest tag — and reads the
version out of the tag it lands on. Releasing an agent is therefore the whole procedure; the backend
needs no redeploy and there is no version kept in two places to drift.

That drift is not a hypothetical. The first cut of this pinned the version by hand in `fly.toml`, it
fell behind the published release, and because the comparison is equality rather than "newer than",
the backend spent a deploy telling machines to move *backwards* to an older build — which from the
browser is indistinguishable from an upgrade that did not happen.

`AGENT_EXPECTED_VERSION` still exists and still wins when set. That is the rollback lever: pin it to
the last good version, redeploy, and the fleet comes off a bad release on the next Refresh. A lever
that "latest" could override would not be a lever, which is why the pin is checked first.

The lookup is cached for five minutes and fails closed — a lookup that returns nothing offers no
upgrade rather than guessing, and a lookup that fails after a good one falls back to the last answer
so a brief outage at the release host does not make every machine look current. The comparison is
equality, not "newer than": lowering it and redeploying is how a bad release is rolled back across
the fleet, and a newer-only check would strand every machine on the broken build.

### The order things happen in, and why

Nothing touches the live binary until every check has passed:

1. Download the asset and `SHA256SUMS`, verify the hash. Not optional — without it, anyone who can
   tamper with the download base gets arbitrary code execution on every machine that upgrades.
2. Run the staged binary's `--version` and require it to equal the target. A truncated or wrong-arch
   download has a valid checksum *of whatever it is*, and would still brick the machine.
3. `rename()` the live binary to `.previous`, then the staged one into place. Atomic on one
   filesystem, and safe to do to a running executable on Linux because the running process keeps its
   inode.
4. Write the probation file and exit `75`.

Exit `75` rather than `0` because `terminateSelf` exits `0` precisely so `Restart=on-failure` leaves
a deleted machine down. A distinct non-zero code gets the unit restarted onto the new binary without
touching the unit file — which is what lets agents already installed upgrade without re-running
`install.sh`.

### Rollback, and the loop it has to avoid

A machine has no inbound port, so a build that cannot connect cannot be fixed from the browser. The
probation file is the only thing standing between a bad release and a fleet that is gone for good:

- Written when the swap commits, naming the version just installed and a boot count of zero.
- Deleted the moment a socket actually opens — a working connection is the only evidence that counts.
- On startup, a probation file naming the *running* version at zero boots is the new build's first
  start. The count goes to one and the agent carries on: it has not failed at anything yet.
- On startup at one boot, the previous start of this version ran and never reached a socket. The
  previous binary is restored and the process exits 75 again.

The boot count is the whole mechanism, and leaving it out is not a simplification. Probation is
written by the boot that *installs* and read by the boot that *follows* it, so treating the file's
mere presence as failure rolls the new build back before it has run a line — every upgrade installs,
restarts, reverts and blocks itself, and the machine sits on the old version being re-offered the new
one forever. From the browser that is indistinguishable from an upgrade that never happened.

A build that starts cleanly and simply cannot reach bosun would never get that second boot on its
own — it would retry behind the backoff indefinitely. `PROBATION_DEADLINE_MS` (five minutes, about
ten attempts at the 30s backoff cap) is what turns "still not connected" into the exit that produces
one. It is deliberately far longer than a backend restart takes, because a false positive here
blocks a good version on that machine permanently.

The rolled-back version is recorded in `upgrade-blocked` and never retried. Without that the backend
re-offers it on the next Refresh, the rollback restores the old binary again, and the machine flaps
between the two indefinitely.

### What it will not do

- **Upgrade mid-session.** A running planning session has a question on somebody's screen; the
  restart would drop it. The upgrade is skipped with a log line and happens on the next Refresh.
- **Replace anything but a packaged binary.** Under `node dist/src/index.js` the running executable
  is node itself. The agent checks its own executable name and refuses.
- **Fix the unit file.** `Environment=PATH=` is resolved at install time. A future agent needing a
  new tool on PATH still requires re-running `install.sh`.
