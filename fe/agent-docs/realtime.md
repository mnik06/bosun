# Realtime — the UI socket and the React Query cache

The backend pushes state; the browser does not poll. One WebSocket carries every frame, and each
subscriber turns the frames it recognises into cache writes. This doc is the map. The *why* of the
connection itself — tickets, reconnect, project switches, invariants — is the engineering doc
`app/shared/api/ui-socket.md`; the plan transcript's two-channel reconciliation is
`app/entities/plan/model/plan-stream.md`. **Read those before changing either module.**

## The pieces

| Piece | Where | Job |
|---|---|---|
| `subscribeToUiSocket({ onMessage, onOpen? })` | `shared/api/ui-socket.ts` | The one connection. Opens on the first subscriber, closes on the last, reconnects with backoff, hangs up on a project switch. Hands every parsed frame to every subscriber. |
| `sendUiCommand(command)` | `shared/api/ui-socket.ts` | Sends a command if the socket is open (`plan.subscribe` / `plan.unsubscribe`). |
| `MachinesSocketProvider` | `entities/machine/model/machines-socket.tsx` | Machine, repository and onboarding frames → cache; upgrade state → its own context. |
| `PlansSocketProvider` | `entities/plan/model/plans-socket.tsx` | Plan rows, builds, line, needs-you → cache; run/integration activity labels → its own context. |
| `NotificationsSocketProvider` | `entities/notification/model/notifications-socket.tsx` | Any notification frame → refetch notifications. |
| `usePlanStream` / `useBugfixStream` | `entities/plan/model/` | Per-plan transcript stream; subscribes to the plan by command. |
| `useRepositoryAnswer` | `entities/repository/model/` | Per-screen listener for repository answers. |

The three providers are mounted in `views/app-layout/app-layout.tsx`, **inside** the authenticated,
project-scoped shell — `POST /ui/ticket` needs a bearer token, so a subscriber above the session
would retry 401s forever on the login screen. Add a new app-wide subscriber there, not in
`root.tsx`.

## Frames are parsed per subscriber

Each entity declares Zod schemas for its own frames in `model/<noun>-message.ts` (`UiMsgSchema`,
`PlanUiMsgSchema`, `LineUiMsgSchema`, `NotificationUiMsgSchema`) and calls `safeParse` on every raw
frame. A frame that does not match is **ignored** — it belongs to another subscriber, or it is
something this build does not understand. That is the whole error path: the cache keeps its last
good value until the next push or refetch. No shared message union exists, because it would force
entities to import each other.

## Landing a push in the cache

Write every cache change as a function in the entity's `lib/<noun>-cache.ts` (or beside the
provider when only it uses one), so a pushed row and a mutation's returned row land the same way.

- **A full row pushed** (`machine.updated`, `plan.updated`) → `setQueryData` on the detail key
  **and** map it into the list key. Keep derived state the push does not carry
  (`patchPlan` keeps `state` when the pushed row has none).
- **A row deleted** → `removeQueries` on the detail key and filter it out of the list.
- **An appended message** → append by id, skipping one already present — the same message arrives
  on the push and in the refetch a reconnect triggers.
- **A nudge** (`line.changed`, `needs_you.changed`, `plan.changed`) or anything the backend
  computes (capacity, reason lines, counts) → `refetchQuery` the affected keys. Don't try to
  recompute server-derived state client-side.
- **Ephemeral state** that is not a resource (an activity label, "upgrading to X") → React state in
  the provider, exposed through a context hook (`useRunActivity`, `useUpgradingTo`). Not the query
  cache.

## Subscriptions that the server must remember

Machine and plan-row frames reach every socket in the project unasked. Plan *transcript* frames are
sent only to sockets that named the plan with `plan.subscribe`, and that list lives in the server's
socket registry. So a per-plan subscriber sends the subscribe from **`onOpen`**, not once on mount —
a reconnect starts with a server that has forgotten it — and refetches the cached detail on every
subscribe after the first, because frames sent while it was away are gone.

## Adding a new pushed frame

1. Schema in the owning entity's `model/<noun>-message.ts`, added to that entity's union.
2. Handle it in the entity's provider (or stream hook), writing the cache through a `lib/` helper.
3. If the frame changes something another entity caches, let **that** entity's subscriber parse
   and handle it — every subscriber sees every frame, which is what lets entities stay out of each
   other's keys. `MachinesSocketProvider` patching repository caches is the one allowed exception
   (an explicit `machine → repository` policy in `eslint.config.js`), not a pattern to copy.
4. If the flow is non-obvious, update `ui-socket.md` / `plan-stream.md` in the same commit.
