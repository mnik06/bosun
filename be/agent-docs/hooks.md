# Hooks and auth gates

Who may call a route is decided by `preValidation` hooks, almost always from the route folder's
`autohooks.ts`. Read the folder's `autohooks.ts` before adding a route to it — it is the gate your
route inherits.

References: `src/api/plugins/auth.plugin.ts` (the hook functions), `src/controllers/auth/`
(`resolve-request-user.ts`, `resolve-membership.ts`), `src/types/fastify.d.ts`,
`plans/006-projects-and-roles.md` (repo root)

## Autoload hooks

Autoload runs with `autoHooks: true` and `cascadeHooks: true`, so an `autohooks.ts` in a routes
folder applies to every route file in that folder and below. There is no root-level `autohooks.ts`:
each folder names its own gate, so a route cannot be added to a guarded folder without the guard,
and a root-level route file (`install.route.ts`, `github-webhook.route.ts`) inherits nothing.

```ts
// src/api/routes/github/autohooks.ts
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
	fastify.addHook('preValidation', fastify.requireLeader);
};
```

## The gates

Built in `auth.plugin.ts`, decorated onto the instance in `build-server.ts`, always run in this
order:

| Hook | Sets | Refuses with |
| --- | --- | --- |
| `requireUser` | `request.user` — the Supabase token resolved to our `users` row (provisioned on first sight) | 401 without a bearer token |
| `requireMembership` | `request.membership = { projectId, role }` from the `X-Project-Id` header | 400 when the header is missing, 404 when the caller is not a member |
| `requireProjectParamMembership` | the same, from a `:projectId` path param; a no-op when the route has none | as above |
| `requireLeader` | — | 403 when `membership.role` is not `leader` |
| `requireAppOwner` | — | 403 when `user.isAppOwner` is false |

- A missing `X-Project-Id` is a 400, never a fallback to the caller's only project — a default would
  make a request meant for one project act on another the moment someone joins a second
- A `users.is_app_owner` row resolves as `leader` of every project without holding a membership
- A project the caller is not in answers **404**; a role they do not hold answers **403** — see
  [errors.md](./errors.md)

## Which folder has which gate

| Folder | `autohooks.ts` | Per-route additions |
| --- | --- | --- |
| `machines/`, `plans/`, `builds/`, `line/`, `runs/`, `needs-you/`, `overlap-decisions/`, `repositories/` | user + membership | `requireLeader` on every `/machines` route but the list, and on every `/repositories` route but the list and the line chat |
| `github/`, `azure/` | user + membership + **leader** | — |
| `projects/` | user + project-param membership | `requireAppOwner` to create/delete, `requireLeader` to rename and on the member routes |
| `notifications/` | user only | `requireMembership` on the project-scoped routes |
| `push/` | user only — a subscription covers every project the person is in | — |
| `me/`, `ui/ticket.route.ts` | hooks added inside the route file | — |
| `agent/` | machine-key auth: `authenticateAgent` sets `request.agent = { machineId, projectId }` | — |
| `ui/ws.route.ts` | single-use ticket from the query string sets `request.uiSession` | — |

**Unauthenticated by design:** `/enroll`, `/install.sh`, `/mcp-presets` and `/health` — the agent's
and the installer's surface. The webhooks carry no bearer token: `/github/webhook` is authenticated
by `X-Hub-Signature-256` over the raw body against `GITHUB_WEBHOOK_SECRET` (per-repository PAT
webhooks at `/github/webhook/:repositoryId` against their own secret); `/azure/webhook/:repositoryId`
by a header secret hashed and compared in constant time. Each lives in a root route file precisely so
it does not inherit the leader-only `github/` or `azure/` gate.

## Rules

- **Put a new route in the folder whose gate fits**, or add a per-route
  `preValidation: fastify.requireLeader` / `requireAppOwner` on top. Never weaken a folder's
  `autohooks.ts` to fit one route
- **Throw `HttpError` to refuse** — it flows to `errorHandler`. The `agent/` hook and the UI socket's
  ticket hook answer `reply.status(401).send(...)` directly; that is the exception, not the pattern
- **Type the hook** with the Fastify handler type (`preValidationAsyncHookHandler`) and declare any
  request field it sets on `FastifyRequest` in `src/types/fastify.d.ts`
- **Read what a hook set, don't recompute it.** Handlers take `req.user`, `req.membership`,
  `req.agent` with a non-null assertion, which is only sound because the folder's hook guarantees
  them. A route in a folder whose hook does not set the field must not assert it
- **Keep hooks cheap.** They run on every matched request; the heavy lifting (resolving the Supabase
  token, the membership row) lives in the `controllers/auth/` controllers they call
- A hook that needs a gate the table above lacks is a new function in `auth.plugin.ts`, decorated in
  `build-server.ts` and typed in `fastify.d.ts` — not an `if (url.startsWith(...))` inside an
  existing one
