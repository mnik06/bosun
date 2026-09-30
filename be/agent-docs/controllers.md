# Controllers

All business logic lives in `src/controllers/<domain>/<verb>.ts`. **One exported controller per
file**, named for the verb (`create-machine.ts` → `createMachine`). Controllers orchestrate repo
calls, services and domain rules; they never touch Drizzle directly.

References: `src/repos/index.ts` (repo factories), `src/services/index.ts` (services), `src/types/`
(domain schemas), `src/api/errors/HttpError.ts`, the domain READMEs listed at the end

## Folder structure

```
src/controllers/
├── machines/
│   ├── create-machine.ts           # createMachine
│   ├── delete-machine.ts           # deleteMachine
│   ├── delete-machine.test.ts
│   └── shared/                     # helpers two or more machines controllers use
│       ├── announce.ts
│       └── send-upgrade.ts
├── line/
│   ├── README.md                   # the line's engineering doc — read before touching it
│   ├── line-deps.ts                # LineDeps + lineDeps(fastify)
│   ├── schedule.ts
│   ├── agent/                      # what the agent's HTTP tool routes call
│   └── shared/
└── plans/
    ├── bugfix/                     # a sub-domain with its own shared/
    └── agent/
```

- A helper used by two controllers leaves the first one and moves to
  `controllers/<domain>/shared/` (`projects/shared/leader-guard.ts` serves both `set-member-role.ts`
  and `remove-member.ts`). A helper two controllers both import never lives inside one of them
- A sub-domain big enough to have its own helpers gets a folder with its own `shared/`
  (`plans/bugfix/shared/`)
- `agent/` sub-folders hold the controllers the agent's own routes call (`/agent/*`), kept apart from
  the browser-facing ones for the same domain
- A controller that outgrows one file becomes `<verb>/index.ts` + `<verb>/utils/`, and `utils/` is
  private to it. None exists yet; the first one follows this shape
- A generic helper typed only in primitives goes to `src/utils/`, not `shared/` — see CLAUDE.md
  General Rules

Controllers may import other domains' controllers — `machines` calls `line/schedule.ts`, the line
calls `plans` — and `eslint-plugin-boundaries` allows `controller -> controller`. What they may not
reach is another controller's private `utils/`.

## Shape of a controller

A controller takes its injected dependencies and its inputs as **object params** and returns a plain
value, or throws. Two forms are in use:

```ts
// One object: deps and inputs side by side. The default for a controller with a handful of deps.
export async function setMemberRole(opts: {
	db: Db;
	projectId: string;
	userId: string;
	role: ProjectRole;
}): Promise<ProjectMembership> { … }

// Two objects: a shared deps bundle, then the inputs. For domains whose controllers all need the
// same large set — the line (`LineDeps`), onboarding (`OnboardingDeps`).
export async function releaseStaleQuestions(deps: LineDeps, opts: { now: Date }): Promise<void> { … }
```

A shared bundle is an interface plus a builder that reads it off the instance —
`lineDeps(fastify)` in `controllers/line/line-deps.ts`, `onboardingDeps(fastify)`,
`envRelayDeps(fastify)`. It exists because the agent socket, the HTTP routes, the webhooks and the
timers all reach the same controllers, and a set assembled four times is four sets that can
disagree. Add a new dependency to the bundle, not beside it.

## Hard Rules

### Dependencies are injected — never reach for a global

Controllers receive repos, services, `db` and env-derived values (`appUrl`, `serverUrl`) as
params. They never import `fastify`, `getRepos`, `getServices`, or read `process.env`. The route (or
the deps builder) reads `fastify.repos.*` / `fastify.services.*` / `fastify.env` and passes them in.
That is what lets `delete-machine.test.ts` hand in `{ deleteOwned } as unknown as MachineRepo`.

Type each injected repo or service by the type its module exports (`MachineRepo`, `SocketRegistry`,
`IdService` — each a `ReturnType<typeof getX>`).

### Scope every read and write to the caller's project

A controller serving a browser request receives `projectId` from `req.membership` and passes it into
the repo's `*Owned*` method (`getOwnedById`, `deleteOwned`). A row the caller's project does not own
is reported exactly like a missing one — `orNotFound(...)` from `src/utils/general.ts` turns `null`
into a `404` — so guessing an id cannot tell "not yours" from "not there". Unscoped repo methods
exist only for paths whose ownership was already established upstream (the scheduler, the agent
socket), and their comment says so.

### Multi-step writes go in a transaction

Open it in the controller with `db.transaction(...)` and build the repos you need **inside** from the
transaction handle, so every write shares it:

```ts
return opts.db.transaction(async (tx) => {
	const projectMemberRepo = getProjectMemberRepo(tx);

	await getMemberForLeaderChange({ projectMemberRepo, … });

	return orNotFound(projectMemberRepo.setRole({ … }), 'Member not found');
});
```

There is no transaction manager: `db.transaction` directly, in a controller, is the pattern
(`projects/set-member-role.ts`, `line/approve-plan.ts`, `plans/agent/publish-plan.ts`). A route
never opens one. A repo used inside a transaction types its factory param as `DbOrTx` — see
[repos.md](./repos.md).

### No external I/O inside a transaction

No GitHub/Azure/Supabase call, no web push, **no socket send** inside the callback — it holds the
connection and the row locks for as long as the network takes. Do it before (if the writes need the
result) or after the commit (side effects). `projects/remove-member.ts` hangs up the removed member's
browser sockets only after the transaction resolves, so a removal that rolled back has disconnected
nobody.

### Throw `HttpError` for client-facing failures

`404` for not found or not owned, `403` for a role the caller lacks, `409` for a conflict, `400` for
a request that is well-formed but refused. Use `details` when the client acts field by field
(`repositories/save-config.ts`). A bare `Error` becomes a `500` with a generic message. See
[errors.md](./errors.md).

### Don't reshape repo output cosmetically

Return what the repo returns; the route's `response` schema is the projection. Reshape only when
combining several sources into a view. A controller that builds a response view may import that
view's type from `src/api/routes/schemas/` (`plans/list-plans.ts` → `BuildSummary`) — boundaries
allows `controller -> route-schema`.

### Batch, don't loop round-trips

Many rows by id → one repo method using `inArray` (`pushSubscriptionRepo.listByUserIds`), never
`Promise.all(ids.map(id => repo.getById(id)))`.

### Parallelize independent reads

Two or more reads with no data dependency run through `Promise.all([...])`
(`plans/list-plans.ts`, `plans/say-to-plan.ts`, `plans/answer-plan-question.ts`). This complements
the batch rule: batch collapses N same-shape lookups into one query; `Promise.all` overlaps
distinct queries. Keep dependent reads sequential, and keep a transaction's statements sequential.

### Never leave a promise unawaited without a `.catch`

A rejection nobody handles takes the process down, and every socket with it. A fire-and-forget call
is `void work().catch((error) => log.error(...))` — the agent socket and the heartbeat both do this.

## Timers

Work no request triggers — stale-plan and stale-question sweeps, pull-request reconcile, the bugfix
idle sweep, the auto-upgrade sweep — is a controller exporting `start<Name>Sweep(...)` that returns a
stop function. `build-server.ts` starts each one after routes are registered and stops it in an
`onClose` hook. A new timer follows the same shape and is started there, nowhere else.

## Domain docs

Read the one for the domain before changing it:

- `src/controllers/line/README.md` — builds, runs, integration, verify, the scheduler
- `src/controllers/plans/README.md` — planning sessions, transcript, publish
- `src/controllers/onboarding/README.md` — machine onboarding runs
- `src/controllers/enroll/enroll-machine.md` — the enrollment handshake
