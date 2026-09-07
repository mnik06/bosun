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

`systemd.service.ts` disables the unit, removes `config.json` and exits 0. It uses `disable`, not
`disable --now`: `--now` stops the unit this very process is running inside, racing the config
removal. Exiting 0 is what stops it; `disable` is only what keeps it from returning on the next boot.

**This depends on `Restart=on-failure` in the unit.** Under `Restart=always` — what `install.sh`
wrote before this plan — systemd restarts the agent no matter why it exited, so a deliberate shutdown
becomes a restart loop against a 401. Agents installed before the change need `install.sh` re-run, or
the unit edited by hand.

## Why hello and preflight are re-sent on every connect

The backend keeps no memory of a machine between sockets, and preflight describes a box that changes
underneath us — a repo goes dirty, a token expires, someone installs pnpm. Re-sending on every
connect means the reconnect path and the first-connect path are the same code, and the checklist in
the browser always describes the current machine rather than the machine as it was at enrollment.

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
