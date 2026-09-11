# Disconnect grace

## Why this exists

A bullet is not tied to the socket it was dispatched over. The agent holds its `claude` processes
outside its reconnect loop and parks the frames they produce while nothing is listening, so a
machine whose socket dropped is usually a machine that is still building. Until this window existed,
`handleClose` settled immediately: every proxy idle timeout, every backend deploy and every missed
heartbeat failed the in-flight run and the plan with it, and paused the queue with *the machine went
offline while this bullet was running*.

It was worse than a wrong status. The agent reconnected seconds later and named that run in `hello`;
`stallMachineRuns` read the row it had just been failed as no longer running, concluded bosun did
not want it any more, and sent `exec.cancel` — killing a session that was mid-edit. One blip cost
the bullet, the work, and the queue.

So the close schedules instead of settling. `hello` cancels the window, and `stallMachineRuns`
settles the same work against the runs the agent says it still holds — which is strictly better
information than a timer has. What is left for the window is the machine that never came back.

## Invariants

- **One window per machine, restarted by the newest close.** A flapping machine closes a socket
  every few seconds; settling on the first would land in the middle of a reconnect still in progress.
- **`GRACE_MS` stays above the agent's reconnect ceiling.** The agent backs off to 30s between
  attempts (`agent/src/connection/backoff.ts`) plus jitter, so a window shorter than that fires
  while a healthy agent is still waiting to dial.
- **The settle re-checks the registry.** Cancellation on `hello` is not enough on its own: a socket
  can register and be slow to announce. `pauseMachineQueues` returns when the machine holds a socket.
- **Timers are unref'd.** A settle a shutdown skips is one the next `hello` does instead.

## Failure modes

- **Backend killed hard.** No close handler runs, no window is scheduled, and queues stay `running`
  with a ghost bullet until the agent reconnects to the new instance and `hello` settles them.
- **Socket that registers and never says `hello`.** The window is cancelled by nothing, but the
  settle sees a live socket and returns, so the queue stays `running` until that socket closes — at
  which point a fresh window is scheduled. Self-healing, one outage late.
- **Process memory, like every other socket-adjacent service.** Deploys run `--ha=false` for the
  same reason the registries do: a second instance holds windows for machines it is not talking to.

## Rejected

- **Settling on close, the old behavior.** Described above.
- **Cancelling at socket registration rather than on `hello`.** Earlier, but it trusts a connection
  that has not yet said what it holds; the registry check in the settle covers the same race without
  giving up the window.
