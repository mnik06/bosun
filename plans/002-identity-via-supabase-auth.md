# Plan: Identity via Supabase Auth

_Bosun plan #002 · depends on 001_

## Overview

Email-and-password signup and login, with **Supabase Auth as the identity provider**. Bosun never
sees a password, never issues a token and never stores a session. The browser talks to Supabase for
authentication and to the BE for everything else, presenting the Supabase access token as a bearer
credential the BE verifies offline against Supabase's public keys.

Our database keeps a `users` row per person, joined to Supabase's `auth.users` by `sub_id`. That row
is what the rest of the product references — plan 003 hangs machines off it.

**Success in one sentence:** you sign up with an email and password, land on the machines page, and
every request the browser makes carries a token the backend verifies locally without calling
Supabase at all.

## Acceptance criteria

**Signing in**

- [ ] **AC-1** — `/signup` creates an account with email and password and lands on the machines page already authenticated.
- [ ] **AC-2** — `/login` authenticates an existing account and lands on the machines page.
- [ ] **AC-3** — Signing up with an email that already exists shows a clear error and creates nothing.
- [ ] **AC-4** — Logout clears the session; reloading the page leaves you signed out.
- [ ] **AC-5** — Visiting a protected page while signed out redirects to `/login`; visiting `/login` while signed in redirects to the machines page.

**The backend's view**

- [ ] **AC-6** — A request with no `Authorization` header to any `/machines` route returns `401`.
- [ ] **AC-7** — A token with a valid shape but a bad signature returns `401`.
- [ ] **AC-8** — An expired token returns `401`; the browser refreshes it through `supabase-js` and the retried request succeeds without the user noticing.
- [ ] **AC-9** — Verification is local: after the first request, serving an authenticated request makes no outbound call to Supabase.
- [ ] **AC-10** — A token signed with a key absent from the cached JWKS causes exactly one refetch of the key set, not one per request.

**Our user row**

- [ ] **AC-11** — The first authenticated request from a new Supabase account creates one `users` row with its `sub_id`, and concurrent first requests still produce exactly one row.
- [ ] **AC-12** — `GET /me` returns the caller's `users` row.
- [ ] **AC-13** — Deleting the account in Supabase removes the `users` row by cascade.

**Transport**

- [ ] **AC-14** — CORS is an explicit origin allowlist; a request from an unlisted origin is refused.
- [ ] **AC-15** — `/ui/ws` is authenticated by a single-use, short-lived ticket obtained over HTTPS, and a connection without one is rejected.

## Architecture

### How it works

`supabase-js` runs in the browser and owns the whole session lifecycle: sign-up, sign-in, storage,
and silent refresh before expiry. The BE has no login endpoint, no password column and no session
table, because it is not the identity provider.

On every request the browser attaches the current access token as `Authorization: Bearer <jwt>`. The
BE verifies it **offline** against the JSON Web Key Set published at
`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, using Supabase's asymmetric signing keys. The key
set is fetched once and cached; a token referencing an unknown `kid` triggers a single refetch, which
is how key rotation is absorbed without downtime. Calling `/auth/v1/user` per request would work and
is what HS256 projects must do, but it puts a network round-trip in front of every API call.

The verified `sub` claim is the Supabase user id. `users` is provisioned **just in time**: the first
authenticated request from an unknown `sub` inserts the row. The alternative — a trigger on
`auth.users` — is the documented Supabase pattern but couples signup to our schema, and a failing
trigger blocks account creation entirely.

WebSockets cannot carry an `Authorization` header from a browser. Rather than putting a long-lived
token in a query string where it lands in every proxy log, the browser posts to `/ui/ticket` with its
bearer token and receives a single-use ticket valid for a few seconds, which it presents as
`/ui/ws?ticket=…`.

### Screen layout

- `Signup` — email · password · submit · link to login
- `Login` — email · password · submit · link to signup
- `App shell` — the existing machines pages, plus the signed-in email and a logout control

### Schema changes

One table. `sub_id` references the Supabase primary key, which is the only column Supabase guarantees
will not change.

```
users
  id          text primary key            -- "u_" + nanoid
  sub_id      uuid not null unique        -- references auth.users(id) on delete cascade
  email       text not null
  created_at  timestamptz not null default now()
```

The foreign key crosses into the `auth` schema, which `drizzle-kit` does not manage. The column is
declared in the Drizzle schema; the constraint is added in the generated migration by hand-editing
**that migration only** — the schema file remains the source of truth for everything else.

### API contract

```ts
GET  /me                    Authorization: Bearer <jwt>   -> { id, email, createdAt }
POST /ui/ticket             Authorization: Bearer <jwt>   -> { ticket, expiresAt }
GET  /ui/ws?ticket=<t>                                    -> 101 | 401

// every existing /machines route now requires the bearer token
```

`/enroll`, `/agent/ws`, `/install.sh` and `/health` stay unauthenticated — they are the agent's and
the installer's surface, and they authenticate with the machine key or nothing at all.

### New libs

- `jose` (BE) — JWKS fetching, caching and JWT verification
- `@supabase/supabase-js` (FE) — auth only; the BE still talks to Postgres through Drizzle

## Key decisions

- **Supabase Auth is the identity provider.** Bosun stores no password hash and mints no session, so
  the entire credential-handling surface — reset flows, rate limiting, breach response — is not ours.
  This amends plan 001's "supabase-js is not used at all": it is now used in the browser, for auth,
  and nowhere else.
- **Offline JWT verification against the JWKS, not `/auth/v1/user`.** A network call per request
  would make Supabase's availability our availability and add latency to every route.
- **Just-in-time provisioning of `users`, not a database trigger.** A trigger that fails blocks
  signup; a JIT insert that fails fails one request.
- **Bearer token, not a cookie.** `supabase-js` already manages and refreshes the token, and a bearer
  header has no CSRF surface and no cross-origin `SameSite` negotiation between the Fly backend and
  the browser app.
- **A short-lived ticket for `/ui/ws`.** Query strings are logged by proxies; a token that is
  single-use and expires in seconds is worth little if it leaks.
- **No RLS.** The BE is the only client of this database and connects as a privileged role, so RLS
  would add policy surface without adding enforcement. It becomes relevant only if something else
  ever connects.

## Non-goals

- OAuth providers, magic links, MFA
- Enforcing email verification before use
- A bosun-hosted password reset UI — Supabase's own flow covers it
- Teams, orgs, roles, sharing a machine between accounts
- Row Level Security policies
- Rate limiting and account lockout beyond what Supabase applies

## Blockers & dependencies

- **Blocked by:** plan 001.
- Supabase Auth enabled on the existing project, with email/password sign-in on.
- The project's JWKS URL and anon key. Both are public values; the anon key is safe in the frontend
  bundle.
- Confirmation that the project uses asymmetric signing keys. A legacy HS256 project must be migrated
  first, or AC-9 cannot hold.

## Slices

- [ ] **Phase 1: Sign in and out** — AC-1 … AC-5
- [ ] **Phase 2: The backend trusts the token** — AC-6 … AC-13
- [ ] **Phase 3: Lock the transport** — AC-14, AC-15

### Phase 1 — Sign in and out

Browser-only. The BE is untouched and still trusts everyone.

- `fe/` — `shared/api/supabase.ts` client; `features/auth/` with signup, login and logout mutations
- `fe/` — `/signup` and `/login` views, Mantine form + zod
- `fe/` — session context, redirect rules both ways, signed-in email and logout in the shell
- `fe/` — axios request interceptor attaching the access token

Proof: sign up, reload, still signed in; log out, reload, redirected to `/login`.

### Phase 2 — The backend trusts the token

- `be/` — `services/auth/jwt.service.ts`: JWKS cache, verification, single refetch on unknown `kid`
- `be/` — `users` schema, repo, JIT provisioning controller
- `be/` — an auth hook that verifies the token, provisions the user and decorates `request.user`
- `be/` — the hook applied to `/machines` and `/me`; `/enroll`, `/agent/ws`, `/install.sh`,
  `/health` explicitly excluded
- `be/src/services/auth/jwt.service.md` — the verification and rotation story

Proof: a request with no token gets 401; with a tampered token, 401; with a valid one, `/me` returns
a row that exists exactly once after ten concurrent first requests.

### Phase 3 — Lock the transport

- `be/` — CORS origin allowlist from env; `POST /ui/ticket`; `/ui/ws` requiring a valid ticket
- `fe/` — fetch a ticket before opening the socket, and on every reconnect

Proof: the browser still updates live; a socket opened without a ticket is refused; a request from an
unlisted origin is blocked.

## Risks

- **The `auth.users` foreign key couples our migrations to Supabase's schema.** It is the documented
  pattern and buys cascade deletes, but it means our database cannot be restored independently of
  theirs. Referencing only the primary key is what keeps this tolerable.
- **HS256 projects cannot verify offline.** If the project still uses the legacy shared secret,
  AC-9 is unreachable without migrating to asymmetric keys first.
- **Clock skew rejects valid tokens.** `exp` and `iat` are checked against the BE's clock; a machine
  with a drifting clock produces authentication failures that look like expiry bugs.
- **Existing machine rows have no owner.** They are unreachable once plan 003 lands and must be dealt
  with in that migration, not this one.

## Decisions taken

_(populated during the build)_
