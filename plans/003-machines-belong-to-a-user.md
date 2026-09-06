# Plan: Machines belong to a user

_Bosun plan #003 · depends on 002_

## Overview

Every machine gets an owner, and every path that can reveal a machine is scoped to that owner: the
list, the detail view, commands, and — the one that is easy to miss — the live WebSocket fan-out.

The schema change is one column. The work is in making sure there is no route left that answers a
question about someone else's machine.

**Success in one sentence:** two accounts signed in side by side see completely disjoint machine
lists, and neither can reach the other's machine by guessing its id.

## Acceptance criteria

**Ownership**

- [ ] **AC-1** — `POST /machines` records the caller as the owner.
- [ ] **AC-2** — `GET /machines` returns only the caller's machines.
- [ ] **AC-3** — `GET /machines/:id` for a machine owned by someone else returns `404`, not `403`.
- [ ] **AC-4** — `POST /machines/:id/ping` for someone else's machine returns `404` and sends nothing over that machine's socket.
- [ ] **AC-5** — `machines.user_id` is `not null` with a foreign key to `users.id`; the database rejects an ownerless machine.

**Enrollment still works**

- [ ] **AC-6** — `POST /enroll` is unchanged and unauthenticated: the enrollment token already implies the owner.
- [ ] **AC-7** — A machine enrolled with a token issued by user A belongs to user A, and appears in no other account.

**The live channel**

- [ ] **AC-8** — A browser socket receives `machine.updated` only for machines the signed-in user owns.
- [ ] **AC-9** — A browser socket receives `machine.pong` only for machines the signed-in user owns.
- [ ] **AC-10** — With two accounts signed in in two browsers, an agent connecting for account A produces no frame of any kind in account B's socket.

**Migration**

- [ ] **AC-11** — The migration leaves no ownerless rows: pre-existing machines are removed.
- [ ] **AC-12** — Deleting a user removes their machines by cascade, and any live socket for those machines is terminated rather than left orphaned in the registry.

## Architecture

### How it works

`machines` gains `user_id`. Every repo method that reads a machine takes the owner and filters on it,
rather than filtering in a controller — a scoped read that can be called unscoped is a leak waiting
for its first careless caller.

Ownership checks return **404, never 403**. A 403 confirms the machine exists, which turns id
enumeration into a discovery tool. The caller cannot distinguish "not yours" from "not real", which
is the correct amount of information to give them.

Enrollment stays unauthenticated. The agent has no user and never will; it holds a machine key, not a
person's credentials. Ownership arrives with the enrollment token, which was issued to an
authenticated browser session and is bound to that machine row from the moment it was created.

### The fan-out is the dangerous part

The socket registry currently holds one flat `Set` of browser sockets and sends every event to all of
them. That is invisible with one user and a data leak with two.

The `Set` becomes `Map<userId, Set<WebSocket>>`, populated from the ticket presented at connect
(plan 002), and `broadcastToUi` takes the owning user id and resolves the target set. Every call site
therefore has to know who owns the machine it is announcing — which is why the broadcast helpers take
the whole machine row rather than just its id.

The agent-side registry is untouched. It is keyed by machine id, which is already unique per owner,
and agents have no notion of users.

### Schema changes

```
machines
  user_id  text not null   -- references users(id) on delete cascade
```

No other column changes. The `user_id` index matters: the list query filters on it for every page
load.

### API contract

Unchanged in shape. Every `/machines` route gains the auth hook from plan 002 and scopes its query to
`request.user.id`.

```ts
GET  /machines            -> only the caller's
GET  /machines/:id        -> the caller's, else 404
POST /machines            -> owned by the caller
POST /machines/:id/ping   -> the caller's, else 404
POST /enroll              -> unauthenticated, unchanged
```

## Key decisions

- **Scoping lives in the repo, not the controller.** `getById(id)` is replaced by
  `getOwnedById({ id, userId })`. There is no unscoped read left to call by accident.
- **404 for someone else's machine.** 403 leaks existence and makes id enumeration useful.
- **Enrollment stays unauthenticated.** The agent is not a user. The enrollment token carries
  ownership because the row that issued it already has an owner.
- **The UI socket registry is keyed by user.** Filtering at the point of send is a check that can be
  forgotten; keying the collection by user makes the wrong thing hard to express.
- **Pre-existing machines are deleted, not adopted.** They are test rows from plan 001 with no
  meaningful owner, and inventing one would leave production data whose provenance is a guess.

## Non-goals

- Sharing a machine between accounts, teams, or transferring ownership
- Roles or permissions within an account
- Per-user quotas on machine count
- Row Level Security — see plan 002

## Blockers & dependencies

- **Blocked by:** plan 002. `user_id` cannot be `not null` before there is a `users` table and a
  reliable caller identity.
- A decision confirmed: the 16 existing machine rows on production are disposable.

## Slices

- [ ] **Phase 1: Owned machines** — AC-1 … AC-7, AC-11
- [ ] **Phase 2: A private live channel** — AC-8 … AC-10, AC-12

### Phase 1 — Owned machines

- `be/` — `machines.user_id` column, index, migration that deletes pre-existing rows before adding
  the constraint
- `be/` — repo methods rewritten to take the owner; `getById` removed outright so nothing can call it
- `be/` — controllers and routes threading `request.user.id`; `404` on a miss
- `fe/` — no change beyond the auth header from plan 002

Proof: two accounts, two machines, each list shows one; fetching the other's id returns 404.

### Phase 2 — A private live channel

- `be/` — `Map<userId, Set<WebSocket>>` in the registry; `broadcastToUi` resolving the owner
- `be/` — every announce site passing the owning user
- `be/src/services/sockets/registry.service.md` — updated for the per-user fan-out
- Verification with two browsers and one connecting agent

Proof: AC-10 — an agent connecting for account A produces no frames at all in account B's socket.

## Risks

- **A missed broadcast site leaks another account's machine into a live UI.** This is the failure
  this plan exists to prevent, and it is invisible in single-user testing. The two-browser check in
  phase 2 is not optional.
- **`not null` on a table with existing rows fails the migration.** The delete has to happen in the
  same migration, before the constraint.
- **A cascade delete leaves live sockets in the registry.** Rows vanish while the map still holds
  their sockets, so the machine is unreachable but still counted as connected. Deletion has to
  terminate sockets explicitly — which plan 004 builds properly.

## Decisions taken

_(populated during the build)_
