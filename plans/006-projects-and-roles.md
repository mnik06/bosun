# Plan: Projects and roles

_Bosun plan #006 · depends on 002, 003_

## Overview

Everything in Bosun currently belongs to one person. `machines`, `plans` and `queues` each carry a
`user_id`, every repo read filters on it, and the browser socket registry is keyed by it. That model
has no way to express "these two people work on the same machines".

This plan replaces the person with a **project** as the unit of ownership, and gives each membership
a role. A project has members; a member is either a **leader** or a **developer**. Leaders manage
machines; developers plan and execute on machines that already exist. Above all of it, a user row
flagged `is_app_owner` resolves as a leader of every project without holding a membership row.

Accounts stop being self-service. There is no sign-up page and no email invite: a leader creates a
member by supplying an email and a role, the backend mints the account with a generated password and
returns that password in exactly one response.

**Success in one sentence:** two developers in the same project see the same machines, neither can
delete one, and a member of another project sees none of them.

## Acceptance criteria

**Ownership moves to the project**

- [ ] **AC-1** — `machines`, `plans` and `queues` carry `project_id` and no `user_id`; the database rejects a projectless row of any of the three.
- [ ] **AC-2** — Every repo read on those three tables filters by `project_id`; no method returns a row without being told which project is asking.
- [ ] **AC-3** — Plan numbers are unique per project, and two concurrent creates in one project cannot take the same number.
- [ ] **AC-4** — `plans.created_by_user_id` records who started a plan and survives as `null` if that user row is deleted.

**Scoping a request**

- [ ] **AC-5** — Every resource route reads `X-Project-Id`; a request without it returns `400`.
- [ ] **AC-6** — A project id the caller is not a member of returns `404`, not `403`.
- [ ] **AC-7** — `request.membership` is `{ projectId, role }` on every route behind the gate, and no controller derives access from anything else.

**The role gate**

- [ ] **AC-8** — A developer calling any route under `/machines` other than `GET /machines` gets `403`, and so does `GET /projects/:projectId/members`.
- [ ] **AC-9** — A developer can list machines — the plan and queue pickers are built from it — and can create, run and answer plans and queues without restriction.
- [ ] **AC-9b** — A developer navigating to `/`, `/machines/:id` or `/members` is redirected to `/plans`, and neither tab appears in the nav.
- [ ] **AC-10** — A user with `is_app_owner` resolves as `leader` in any project, including one with no membership row for them.

**Members**

- [ ] **AC-11** — `POST /projects/:projectId/members` creates a Supabase account with a generated password, a `users` row and a membership in one flow, and returns the password once.
- [ ] **AC-12** — The generated password appears in exactly one response body and in no log line.
- [ ] **AC-13** — Creating a member for an email that already has an account adds a membership instead of failing, and returns no password.
- [ ] **AC-14** — A leader cannot demote or remove the last leader of a project.
- [ ] **AC-15** — A developer calling any member-management route gets `403`.

**Projects**

- [ ] **AC-16** — Only an app owner can create or delete a project.
- [ ] **AC-17** — `GET /projects` returns the caller's memberships with their role; for an app owner it returns every project as `leader`.

**No self-service accounts**

- [ ] **AC-18** — The `/signup` route and its mutation are gone from the frontend.
- [ ] **AC-19** — A user with no membership and no app-owner flag can sign in and is shown an empty state, not a crash.

**The live channel**

- [ ] **AC-20** — Browser sockets are keyed by project; every member of a project receives its machine, plan and queue frames, and no frame from any other project.
- [ ] **AC-21** — The socket ticket is bound to a `(user, project)` pair, and a ticket issued for project A cannot open a socket on project B.
- [ ] **AC-22** — Removing a member terminates that member's open sockets for the project instead of leaving them subscribed.
- [ ] **AC-23** — `plan.subscribe` over the socket checks the plan's project, so naming another project's plan id yields no transcript.

**Migration**

- [ ] **AC-24** — Every pre-existing user gets a project of their own, with themselves as its leader, and their machines, plans and queues re-pointed to it.
- [ ] **AC-25** — No row of `machines`, `plans` or `queues` is lost by the migration.

## Architecture

### How it works

Two new tables and one new column:

- `projects` — id, name, timestamps. Nothing else; a project is a boundary, not a workspace with
  settings
- `project_members` — `(project_id, user_id)` primary key plus `role`. The pair is the fact, so it is
  a row rather than a column on either side
- `users.is_app_owner` — a boolean, exactly as asked. Not a role in `project_members`, because it is
  not scoped to a project and putting it there would mean writing a row per project forever

Authorization is resolved once, at the edge, in two layers:

1. `requireUser` is unchanged — it turns a bearer token into a `users` row
2. `requireMembership` reads `X-Project-Id`, resolves the caller's role in that project, and sets
   `request.membership = { projectId, role }`. An app owner short-circuits to `leader` without a
   lookup
3. `requireLeader` runs after it and refuses a `developer`

Controllers never take a `userId` for access any more. They take `projectId`, and where a role
decision is genuinely business logic rather than routing, they take the role too. The `*Owned*` repo
methods keep their shape and swap the column they filter on — a scoped read that can be called
unscoped is still the thing to avoid.

### Why the project id travels in a header

`X-Project-Id` rather than `/projects/:projectId/machines`, because the alternative renames every
route in the API and every route in the frontend for something that is ambient. The axios request
interceptor already attaches the bearer token; it attaches this beside it, from the same place.

The `/projects/*` routes are the exception and take the id in the path. They address a project rather
than acting inside one, and an app owner listing or creating projects has no active project to put in
a header.

The cost is that a project id is easy to omit. That is why a missing header is a **400 with a
message**, not a silent fallback to "the caller's only project" — a default here would mean a request
that meant one project quietly acting on another.

### 404 for the wrong project, 403 for the wrong role

Plan 003 settled that a resource you do not own answers `404`, because a `403` confirms it exists.
The same holds for a project you are not a member of.

Roles are different. A developer calling `DELETE /machines/:id` is a member of the project and
already knows the machine exists — hiding it would be theatre, and would make the UI unable to tell
"gone" from "not allowed". So the role gate answers `403` and says so.

### The account-creation path is the new privilege

Creating an account with a password is not something the publishable key can do. The backend gains
`SUPABASE_SECRET_KEY` and a second, separate client for it.

This is a real widening of what a compromised backend can do: the secret key can mint, modify and
delete any account in the Supabase project, which `getUser` never needed. The containment is
structural rather than a note in a doc:

- `supabase-admin.service.ts` is a different module from `supabase-auth.service.ts` and exposes only
  `createUser`. The token-resolution path never sees the secret key
- `EnvSchema` keeps refusing a secret key in `SUPABASE_PUBLISHABLE_KEY`, and gains the mirror-image
  check on `SUPABASE_SECRET_KEY` — it must *not* look like a publishable key
- The key is a Fly secret, never a `fly.toml` `[env]` entry
- `logger.plugin.ts` redacts the generated password alongside `authorization`

The password itself follows the house rule for plaintext credentials: generated by the backend,
returned in exactly one response, never retrievable again, never logged.

### The fan-out changes key again

Plan 003 keyed `uiSockets` by owner so one account's machines could not land on another's screen.
The owner is now the project, so the map is keyed by `project_id` and every member of a project
receives its frames. Each broadcast site that reads `queue.userId` or `plan.userId` reads
`projectId` instead.

Two consequences that are easy to miss:

- The ticket is issued for a `(user, project)` pair, because a user with two projects open in two
  tabs holds two sockets and each must be on its own key. A ticket that carried only the user would
  let the second tab join the first tab's project
- A socket outlives the membership that authorized it. Removing a member therefore terminates their
  sockets on that project explicitly; there is no per-frame recheck, and without the terminate an
  ex-member keeps receiving frames until they close the tab

### Schema changes

```
users
  + is_app_owner   boolean not null default false

projects                          (new)
    id               text pk               prj_<nanoid12>
    name             text not null
    created_at       timestamptz not null default now()

project_members                   (new)
    project_id       text not null → projects.id  on delete cascade
    user_id          text not null → users.id     on delete cascade
    role             text not null                'leader' | 'developer'
    created_at       timestamptz not null default now()
    pk (project_id, user_id)
    index on (user_id)

machines
  - user_id
  + project_id      text not null → projects.id on delete cascade
  index machines_project_id_idx

plans
  - user_id
  + project_id      text not null → projects.id on delete cascade
  + created_by_user_id text null   → users.id   on delete set null
  index plans_project_id_idx
  unique plans_project_number_key (project_id, number)

queues
  - user_id
  + project_id      text not null → projects.id on delete cascade
  index queues_project_id_idx
```

The migration is generated, then hand-extended at the top with the backfill — the same shape as
`0002`, which deleted ownerless machines in the migration that added the constraint. Here nothing is
deleted:

1. Insert one project per existing user, id derived deterministically from the user id
   (`'prj_' || substr(u.id, 3)`), named from the local part of their email
2. Insert a `leader` membership for each
3. Add `project_id` **nullable**, backfill from the old `user_id`, then set `not null`
4. Copy `plans.user_id` into `created_by_user_id`, then drop `user_id`

Step 3 is why the generated DDL is edited rather than run as written: drizzle emits
`ADD COLUMN ... NOT NULL`, which fails on any existing row.

### API contract

Resource routes are unchanged in path and gain a required `X-Project-Id` header.

| Route | Gate |
| --- | --- |
| `GET /me` | signed in |
| `GET /projects` | signed in |
| `POST /projects` | app owner |
| `PATCH /projects/:projectId` | leader |
| `DELETE /projects/:projectId` | app owner |
| `GET /projects/:projectId/members` | leader |
| `POST /projects/:projectId/members` | leader |
| `PATCH /projects/:projectId/members/:userId` | leader |
| `DELETE /projects/:projectId/members/:userId` | leader |
| `POST /machines`, `GET /machines/:id`, `DELETE /machines/:id` | leader |
| `PATCH /machines/:id/profile` | leader |
| `POST /machines/:id/ping`, `/refresh`, `/pause`, `/resume` | leader |
| `GET /machines` | member |
| all `/plans/*`, all `/queues/*` | member |
| `POST /ui/ticket` | member |

`POST /projects/:projectId/members` takes `{ email, role }` and answers `201` with
`{ member, password }` for a new account, or `{ member }` when the address already had one.

`GET /me` grows `isAppOwner`. `GET /projects` returns `{ id, name, role }[]`.

`GET /machines` is the one machine route a developer keeps, because the plan and queue pickers are
built from it and a plan has to name the machine it runs on. The list carries a name and a status;
the repo path, the profile and the preflight detail are on the detail route, which is leader-only
along with everything else under `/machines`.

### Frontend

- `entities/project/` — the type, the projects query, the active-project store. The active project is
  persisted in `localStorage` and read by the axios interceptor that sets `X-Project-Id`
- **Every query key gains the project id.** Without it, switching project shows the previous
  project's machines from cache until the refetch lands — the one bug this change invites
- The socket reconnects on a project switch, because its ticket is bound to the old pair
- `widgets/project-switcher/` in the app layout. The `Machines` and `Members` tabs are leader-only
  and absent from the nav for a developer
- Machines, machine detail and members sit behind a **pathless layout route**
  (`views/leader-layout/`) that redirects a developer to `/plans`. One gate declared in `routes.ts`
  beside the routes it covers, rather than a check each new screen has to remember. The API refuses
  the same calls independently — the redirect is for the person, not for the security
- `views/members/` with create / change-role / remove features. Creating a member opens a copy-once
  dialog with the generated password
- `views/signup/`, `features/auth/api/use-sign-up.ts` and the `/signup` route are deleted
- A signed-in user with no projects gets an empty state telling them to ask for an invitation

## Key decisions

- **Project, not organization.** One level, not two. A tenant that needs "org → project" can have it
  later by adding a parent to `projects`; adding it now would mean a second membership table nobody
  has asked for
- **`is_app_owner` as a column, not a role.** It is not scoped to a project, so it does not belong in
  a table keyed by one
- **App owner acts as a leader, not as a read-only observer.** They can fix a customer's project
  without being invited into it. The audit trail for that is out of scope and is named as a non-goal
- **No `user_id` left on the three tables.** Keeping both would mean two answers to "who can see
  this", and every future route would have to pick one
- **The generated password is never re-shown.** A leader who loses it deletes the member and creates
  them again

## Non-goals

- Nested organizations above projects
- Email invitations, password reset, or any transactional mail
- An audit log of what an app owner did inside someone else's project
- Per-machine or per-queue permissions inside a project — the role is project-wide
- Deleting a Supabase account. Removing a member removes the membership; the account survives
- Transferring a machine, plan or queue between projects

## Blockers & dependencies

- `SUPABASE_SECRET_KEY` must exist as a Fly secret before the deploy — `scripts/deploy.sh` refuses
  the deploy otherwise, which is the intended behaviour
- Public sign-up must be disabled in the Supabase project, or `/signup` being gone from the frontend
  stops nothing
- The migration must run against the same database Fly points at; it is not reversible without a
  restore

## Slices

### Phase 1 — The tables and the gate

Schema, migration with backfill, `projects` and `project_members` repos, `requireMembership` and
`requireLeader`, every existing repo and controller swung from `userId` to `projectId`. Nothing new
is reachable from the UI yet; the API is scoped and gated.

### Phase 2 — Members

The admin Supabase client, member create/list/role/remove, the last-leader guard, project
create/list/rename/delete.

### Phase 3 — The live channel

Ticket bound to `(user, project)`, registry keyed by project, every broadcast site swung over,
socket termination on member removal.

### Phase 4 — The frontend

Active-project store and header interceptor, project-scoped query keys, switcher, members screen,
role-aware controls, sign-up removed.

## Risks

- **A missed broadcast site leaks across projects.** The registry key change is mechanical; the call
  sites are not. Every `userId:` passed to a broadcast helper has to be found, and the compiler only
  catches it because the field is renamed rather than retyped — which is the reason to rename it
- **A query key without the project id.** Shows another project's data from cache after a switch.
  Cheap to prevent, invisible once shipped
- **The secret key widens the blast radius of a backend compromise.** Contained by module boundary,
  env validation and redaction, not eliminated
- **The migration is one-way.** `plans.user_id` is dropped; the only route back is a restore

## Verification

Two accounts in one project and one account in another, signed in side by side:

- Both members of project A see the same machine list; the outsider sees none of it and gets `404`
  on a direct id
- The developer has no Machines or Members tab, is bounced from `/` to `/plans`, and
  `DELETE /machines/:id` by hand returns `403`
- A machine going online in project A produces a frame in both A sockets and none in B's
- The app owner, a member of neither, sees both projects and can act in each
- A member created by a leader can sign in with the returned password on the first try, and that
  password appears nowhere in the logs
