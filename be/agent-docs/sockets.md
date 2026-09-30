# Sockets

The backend holds two kinds of WebSocket, both via `@fastify/websocket`: one per enrolled machine
(`GET /agent/ws`, dialled **by the agent** — the backend never initiates a connection) and any number
per browser tab (`GET /ui/ws`). This doc is an index into the code and the engineering docs that
already explain it; read those before changing anything here.

## Where things are

| Concern | File | Read first |
| --- | --- | --- |
| Agent socket: auth, heartbeat, frame parse, ordered queue, close | `src/api/routes/agent/ws.route.ts` | — |
| Dispatching an agent frame to its controller | `src/api/routes/agent/frame-router.ts` | — |
| Machine-key auth for every `/agent/*` route | `src/api/routes/agent/autohooks.ts` → `controllers/agent/authenticate-agent.ts` | `controllers/enroll/enroll-machine.md` |
| Browser socket: ticket auth, plan subscribe | `src/api/routes/ui/ws.route.ts`, `ui/ticket.route.ts` | `services/tickets/ticket.service.md` |
| Who is connected, fan-out by project | `src/services/sockets/registry.service.ts` | `services/sockets/registry.service.md` |
| Not settling work on a dropped socket | `src/services/sockets/disconnect-grace.service.ts` | `services/sockets/disconnect-grace.service.md` |
| Request/reply over the socket (env sets) | `src/services/sockets/pending-env-requests.service.ts` | — |
| Last reported machine memory, deferred upgrades | `machine-memory.service.ts`, `pending-upgrades.service.ts` | — |
| The wire protocol | `src/types/protocol.ts`, `ui-protocol.ts`, `*-frames.ts`, `*-stream.ts` | [types.md](./types.md) |

Frame direction: `AgentMsgSchema` is agent → BE, `ServerMsgSchema` is BE → agent, `UiMsgSchema` is
BE → browser, `UiCommandSchema` is browser → BE.

## Hard Rules

### Validate every inbound frame; log and drop what fails

A frame is not HTTP, so no route schema covers it. `JSON.parse` in a `try`, then
`AgentMsgSchema.safeParse` / `UiCommandSchema.safeParse` before acting. A frame that fails is logged
(agent side) or ignored (browser side) and dropped whole — never partially handled.

### Outbound frames are typed, not re-parsed

`socketRegistry.sendToAgent` takes a `ServerMsg`, `broadcastToUi` / `broadcastToPlan` /
`sendToUiUser` take a `UiMsg`. The type is the check; build the message from the schema's type, not
from a loose object.

### A send can fail, and the caller decides what that means

`sendToAgent` returns `false` when the machine has no open socket, so that every caller has to
decide what an undelivered command means instead of firing into a closed socket. Don't ignore the
return value.

### Browser fan-out is keyed by project

`broadcastToUi` cannot reach a socket without naming its project; announce helpers take the whole
row (`announceMachine({ socketRegistry, machine })`) because the row is where the project is. Never
add a flat "send to every browser" path. Subscribing to a plan's transcript checks
`planRepo.getOwnedById` against the socket's project first. See `registry.service.md`.

### The socket is not the session

The agent keeps its `claude` processes across a reconnect. A `close` therefore settles nothing:
it marks the machine offline and schedules `disconnectGrace`; the next `hello` cancels the grace and
settles work against what the agent says it still holds (`stallMachineBuilds`, `stallMachinePlans`,
`stallMachineOnboarding`, `stallMachineQuickFixes`). Don't fail a run or a plan in a close handler.

### Frames that settle work are handled in order

`isOrderedFrame` in `frame-router.ts` sends plan, exec, worktree, integrate and bugfix frames
through a per-socket promise queue. Their transcripts append at `max(seq) + 1`, and two overlapping
appends collide on the unique index. A new frame family that appends or moves one build's state goes
on that list.

### No unhandled rejections

A socket handler has no `errorHandler` behind it. Unordered frames run as
`void handle().catch((error) => request.log.error(...))`; the queue catches for ordered ones. A
rejection nobody handles takes the process down, and the agent's reconnect replays the same frame
into the restarted one.

### Registries are per-process

All of the above lives in memory, which is why deploys pin `--ha=false` — a second instance would
hold a disjoint set of sockets. See CLAUDE.md § Deployment.

### The agent mirrors the protocol by hand

`agent/src/protocol.ts` and its `*-frames.ts` siblings mirror `be/src/types/`. Changing a frame
means changing both in the same piece of work — and any `agent/` change bumps the patch version in
`agent/package.json` (see `agent/CLAUDE.md`).
