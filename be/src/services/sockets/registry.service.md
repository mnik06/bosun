# The socket registry

`getSocketRegistry()` closes over two collections: one `Map<machineId, WebSocket>` for agents, one
`Map<projectId, Set<WebSocket>>` for browsers, plus a `Map<WebSocket, userId>` read only when hanging
up on a removed member. One instance is built in `build-server.ts` and decorated
onto the Fastify instance, so the maps below are per-server rather than per-module. "Send a command to a machine" is a lookup in the agent
map followed by `.send()` on a socket the machine itself opened. Nothing here dials outward.

## Why the browser side is keyed by project, not a flat set

Every browser socket used to sit in one `Set` and receive every event. That is invisible with one
account and a data leak with two: a `machine.updated` frame carries the whole machine row, so one
tenant's machine names, repo paths and agent versions would land on another tenant's screen.

The fix is not a filter at the point of send. A filter is a check, and a check can be forgotten by
the next call site added six months from now. Keying the collection by project makes the wrong thing
hard to express: `broadcastToUi` cannot reach a socket without naming the project it belongs to, and
the caller cannot name one without knowing which project owns the machine it is announcing. That is
why the announce helpers take the whole machine row rather than just its id — the row is where the
project is.

Every member of a project shares the key, which is the point: they are looking at the same machines,
and a frame about one of them is news for all of them. Roles do not enter into the fan-out. A
developer may not delete a machine, but they must see it go.

The project comes from the ticket presented at connect, which was issued to an authenticated bearer
request that named the project in its `X-Project-Id` header, so it is never taken from anything the
socket itself says. The ticket carries the `(user, project)` pair rather than the user alone: someone
with two projects open in two tabs holds two sockets on two keys, and a ticket that carried only the
person would let the second tab join the first tab's project.

**Invariant:** `removeUiSocket` deletes the project's entry once its set is empty. Otherwise the map
retains one empty `Set` per project that has ever had a tab open, for the life of the process.

**Invariant:** a socket outlives the membership that authorized it. There is no per-frame recheck, so
`removeMember` calls `closeUiSocketsForMember` after the transaction commits — that hang-up is the
only thing between an ex-member and the project's traffic. This is what the `Map<WebSocket, userId>`
exists for; nothing else reads it, and fan-out never consults it.

The agent map is untouched by any of this. It is keyed by machine id, which is already unique per
project, and agents have no notion of users or roles.

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

**Corollary, and it is the sharp edge of the above:** the close handler in `ws.route.ts` returns on
that `false`, so *nothing* on the disconnect path runs for a replaced socket — not
`markMachineOffline`, which is right, and not `pauseMachineQueues`, which is not. The agent kills
every `claude` process it holds whenever its socket closes, replacement or no replacement, so a
reconnect fast enough to keep the slot used to leave the bullet that died with the old socket sitting
in the database as `running` forever. `claimNext` then refuses to take the next bullet — one worktree
holds one session — and the queue is stuck for good rather than for a moment.

The settling therefore happens on the way *in*, not on the way out: `hello` calls `stallMachineRuns`.
Which runs it settles is not guesswork — the agent says. Its execution sessions outlive the socket
they were dispatched over, so `hello` carries the run ids it is still building and everything else
this machine has marked `running` is a ghost. Two further guards sit under that: a run whose
`startedAt` is newer than the instant this socket was registered was dispatched over *this*
connection (a resume racing the hello) and is left alone, and `runIds` absent means an agent too old
to survive a reconnect, which holds nothing across one — so the empty default is the truth for those
agents rather than a fallback.

`stallMachineRuns` also runs the mirror check, because the same outage breaks the other direction:
`exec.cancel` for a queue paused while the machine was unreachable was never delivered, and the
session it was meant to stop is still writing to the worktree. Any run the agent reports holding
whose row is not `running` on a queue of *this* machine is cancelled on the spot. The queue is
derived from the run rather than trusted, the same as every other frame that names one.

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
- **A ping reaches a machine that was just deleted.** It cannot: `deleteMachine` unregisters the
  socket before closing it, rather than waiting for the close event, so the entry is gone by the time
  the delete returns. Relying on the close event would leave a window in which the row does not exist
  and the socket still does.
- **A queue is `running` with nothing running.** Its bullet died with a socket that was replaced
  before its close event landed, so the disconnect path bailed. `stallMachineRuns` on the next
  `hello` is what settles it; if the queue is still stuck, either the agent never re-announced, or it
  named that run in `hello.runIds` while holding no process for it. `ps` on the machine decides
  which.
- **A bullet re-runs work that is already on its branch.** Its `exec.done` was produced while the
  socket was down and the sink buffered it, but the agent process died before the flush — the commit
  landed and nothing ever said so. The agent-side `dropped <frame>: the connection is not open` line
  is the other half of this: it means a frame was thrown away rather than parked, which only happens
  to the live view (`exec.text`, `exec.activity`), never to a settling frame.
- **An ex-member still sees frames.** `closeUiSocketsForMember` did not run, or ran before the
  membership delete committed and the transaction then rolled back. The hang-up belongs after the
  commit for exactly that reason.
- **A machine is registered but its row is gone.** Deleting a project cascades to its machines while
  their agent sockets are still open, leaving a connection that is authenticated against a row that
  no longer exists. The agent route evicts it: any repo write that comes back with no row means the
  machine has been deleted, and the socket is terminated rather than left counted as connected.
