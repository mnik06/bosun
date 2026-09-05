# The agent's connection loop

`run` is an infinite loop around a single connection attempt. Every path — refused, dropped, closed
cleanly, never established — funnels into the same place: wait, then try again. The agent has no
terminal state and never exits on its own; systemd restarting it is a backstop, not the mechanism.

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
- **A rejected upgrade is not retried faster than any other failure.** `unexpected-response` (a 401
  from a revoked or wrong key) goes through the same backoff. It cannot be fixed by retrying, but
  hammering the backend does not fix it either, and the machine may be re-enrolled at any time.
- **Frames are parsed before they are acted on.** The protocol schema is duplicated between the two
  packages on purpose; if it drifts, an unparseable frame is logged and dropped rather than
  half-handled. Silence in the logs and a dead ping button is the symptom of drift.

## Failure modes

- **Reconnect loop with `server refused the connection (401)`** — the machine key no longer matches
  what the backend stores. Re-enroll; the config file is stale.
- **Connects then immediately closes, repeatedly** — usually a second agent process running against
  the same config, each one evicting the other on connect.
- **Green in the browser but no pong** — the socket is alive and the ping frame arrived, but the
  agent's message handler threw. Check the agent log; the loop keeps the socket open.
