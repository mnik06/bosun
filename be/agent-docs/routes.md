# Routes

Fastify routes are auto-loaded from `src/api/routes/` by `@fastify/autoload`, registered in
`registerRoutes` in `src/api/build-server.ts`. **The folder is the URL prefix; the path string in
`fastify.<method>(...)` is the rest.** Filenames do not contribute to the URL. Every route file
exports a `FastifyPluginAsync` as its default export.

References: `src/api/routes/schemas/` (route boundary schemas), `src/controllers/` (business logic),
[hooks.md](./hooks.md) (auth gates), [sockets.md](./sockets.md) (the two WebSocket routes)

## How the URL is built

Autoload is registered with `ignoreFilter: 'schemas'`, `autoHooks: true`, `cascadeHooks: true` and
`routeParams: true`, and **no prefix** — there is no `/api` in front of anything. Swagger UI sits at
`/api/documentation` only because that is its own `routePrefix`.

- Each **directory** under `routes/` becomes a path segment: `routes/machines/*.route.ts` all mount
  under `/machines`
- Params are written into the path string (`fastify.patch('/:id', …)`), not as `:param` folders.
  There are none in this tree, and the flat layout is the one to follow
- A file at the `routes/` root mounts at `/` and spells out its whole path. That is how the
  unauthenticated surfaces stay out of a guarded folder: `github-webhook.route.ts` declares
  `'/github/webhook'` precisely so it does not inherit `github/autohooks.ts`
- `schemas/` is never mounted
- Several files may share a folder: `machines/` holds `machines.route.ts`,
  `machine-actions.route.ts`, `machine-env.route.ts`, … — one per concern, all under `/machines`

```
src/api/routes/
├── schemas/                        # ignored by autoload — request/response schemas by domain
├── health/health.route.ts          # GET  /health
├── install.route.ts                # GET  /install.sh            (root file, full path)
├── github-webhook.route.ts         # POST /github/webhook        (root file, outside github/)
├── machines/
│   ├── autohooks.ts                # requireUser + requireMembership for every file here
│   ├── machines.route.ts           # POST / , GET / , GET /:id , DELETE /:id
│   └── machine-capacity.route.ts   # PATCH /:id  → PATCH /machines/:id
└── agent/
    ├── autohooks.ts                # machine-key auth for every agent route
    ├── ws.route.ts                 # GET /ws → /agent/ws (WebSocket)
    └── frame-router.ts             # not a route file: helpers for ws.route.ts
```

## Anatomy of a route file

`health/health.route.ts` is the minimal shape; `machines/machines.route.ts` is the typical one:

```ts
const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/',
		{
			preValidation: fastify.requireLeader,
			schema: {
				body: CreateMachineReqSchema,
				response: { 201: CreateMachineRespSchema }
			}
		},
		async (req, reply) => {
			const created = await createMachine({
				machineRepo: fastify.repos.machineRepo,
				idService: fastify.services.idService,
				keyService: fastify.services.keyService,
				projectId: req.membership!.projectId,
				name: req.body.name,
				serverUrl: fastify.env.PUBLIC_SERVER_URL
			});

			return reply.status(201).send(created);
		}
	);
};

export default routes;
```

## Hard Rules

### Always call `withTypeProvider<ZodTypeProvider>()`

At the top of every route plugin that declares a schema. Without it `req.body` / `req.params` /
`req.query` are untyped. The global `validatorCompiler` / `serializerCompiler` (set in
`build-server.ts`) do the actual validation.

### Validation lives in `schema`, not in the handler body

Declare `body`, `params`, `querystring` and `response[statusCode]` as Zod schemas. Do not call
`.parse()` by hand in a handler for anything the schema can express. The exceptions are inputs the
schema cannot see: a raw-buffer webhook body (`github-webhook.route.ts` verifies the signature over
the bytes and parses afterwards) and WebSocket frames ([sockets.md](./sockets.md)).

Declare a `response` schema for every JSON endpoint — it is the serialization contract and what
Swagger shows. A `204` with no body, or a non-JSON reply (`install.route.ts` sends a shell script),
has none.

### Handlers wire dependencies and delegate — nothing else

Read dependencies off the instance — `fastify.repos.*`, `fastify.services.*`, `fastify.env`,
`fastify.db` — and the caller off the request (`req.user`, `req.membership`, `req.agent`), call one
controller, return its result. No Drizzle, no `if` about domain state. When a controller takes a
shared deps bundle, build it with the domain's helper (`lineDeps(fastify)`,
`onboardingDeps(fastify)`) rather than listing fifty fields by hand. See
[controllers.md](./controllers.md).

A route must not import a repo — `eslint-plugin-boundaries` refuses `route -> repo`. Everything a
route needs from the database goes through a controller. The lint rule sees imports only, so a
handler calling `fastify.repos.x.y()` inline slips past it; the few that do (the webhook routes'
repository lookup, `ui/ws.route.ts`'s subscribe check) are not the pattern to copy.

### Project scope comes from `req.membership`, never from the body

A project-scoped route reads `req.membership!.projectId` (set by `requireMembership` from the
`X-Project-Id` header) and passes it to the controller. Never accept a `projectId` in a body or
query for authorization. The non-null assertion is safe only because the folder's `autohooks.ts`
guarantees the hook ran — see [hooks.md](./hooks.md).

### Return the value; touch `reply` only for a non-200

Returning lets the serializer apply the `response` schema. Use `reply.status(201|202|204).send(…)`
when the status differs, `reply.type(...)` for a non-JSON body. Declare the non-200 status in
`response`.

### Throw `HttpError`, don't catch

Controllers throw `HttpError` for client-facing failures and it propagates to the global
`errorHandler`. No `try/catch` in a route to reshape an error. See [errors.md](./errors.md).

### Schema placement

- Request/response schemas → `src/api/routes/schemas/<domain>/`, in a folder matching the route's
  domain. Never at the `schemas/` root. Either one schema per file (`CreateMachineReqSchema.ts`) or
  one file per domain grouping related schemas (`LineSchemas.ts`, `PlanReqSchemas.ts`) — follow
  whatever the domain's folder already does
- A tiny one-off param object may stay inline in the route file
  (`z.object({ repositoryId: z.string() })` in `github-webhook.route.ts`)
- Domain/entity schemas (a row's shape) live in `src/types/`. A route may use one directly as its
  response when the wire shape genuinely is the row (`MachineSchema` for `GET /machines/:id`). See
  [types.md](./types.md)

## Adding a new route

1. Pick the folder whose URL prefix and auth gate fit. The folder's `autohooks.ts` decides who may
   call it — read it first ([hooks.md](./hooks.md)). A route needing a different gate goes in a
   different folder or adds a per-route `preValidation`
2. Add `<name>.route.ts` exporting a default `FastifyPluginAsync`, or add the method to an existing
   file of the same concern
3. Put request/response schemas in `src/api/routes/schemas/<domain>/`
4. Write the controller in `src/controllers/<domain>/` ([controllers.md](./controllers.md))
5. If the entity is new, add its repo and register it in `src/repos/index.ts` ([repos.md](./repos.md))
6. Autoload picks the file up on restart — no manual registration
