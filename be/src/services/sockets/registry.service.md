# The socket registry

Two collections held in module state: one `Map<machineId, WebSocket>` for agents, one `Set` for
browsers. "Send a command to a machine" is a lookup in that map followed by `.send()` on a socket the
machine itself opened. Nothing here dials outward.

## Why it can be in-memory

There is exactly one backend process (`--ha=false` on Fly, deliberately). A live socket is not state
that can be shared — it belongs to the process holding the file descriptor — so a second instance
would not "share" the registry, it would split it: an agent connected to instance A, a ping arriving
at instance B, and a machine that is online and unreachable at the same time.

Scaling past one instance is therefore not a matter of moving this `Map` into Redis. It needs a
different design (routing commands to the instance holding the socket, or a broker in front), and
until that exists the single-instance constraint is load-bearing. **Raising the machine count is a
correctness change, not a capacity change.**

## Ghost sockets, and why two mechanisms are needed

A machine that reconnects while the backend still holds its previous socket would look permanently
online and receive commands into a pipe nobody reads. Two independent things prevent it, and neither
is sufficient alone:

**Eviction on connect.** `registerAgentSocket` terminates any socket already parked under that
machine id. This catches the common case — an agent restart where the old TCP connection has not yet
been noticed as dead.

**Heartbeat.** The server sends WebSocket ping frames every 15s and terminates the socket after two
unanswered. This catches the case eviction cannot: a connection that died at the network level with
no close frame and no reconnect, where nothing would otherwise prove the socket is dead. A severed
network link is invisible at the application layer until something demands an answer.

The plan specified 30s frames; 15s is what the acceptance criterion actually requires. Two missed
frames at 30s is a 60s worst case, and the machine has to be offline within 45s.

**Invariant:** `unregisterAgentSocket` clears the slot only if it still holds *that* socket. The
close event of an evicted socket arrives after its replacement has already registered, so an
unconditional delete would drop the live connection and mark a connected machine offline.

## Failure modes

- **Machine stuck online.** The socket is in the map but dead, and the heartbeat is not running or
  not terminating. Check that `startHeartbeat`'s cleanup is wired to `close`, and that the `pong`
  listener resets the counter.
- **Machine flapping.** Two agent processes are running against one config file. Both authenticate,
  each connect evicts the other, and the status alternates. The config is per machine, not per
  process.
- **Ping returns 409 for an online machine.** The row says online but the map has no socket — the
  disconnect path failed to write. The map is the truth for reachability; the row is a projection of
  it.
