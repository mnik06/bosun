# Plugins

Cross-cutting concerns live in `src/api/plugins/` and are wired in `src/api/build-server.ts`. **The
bootstrap order lives in `build-server.ts` and nowhere else.** `src/api/api.ts` only calls
`buildServer()` and `listen`s on `HOST`/`PORT`.

## The plugins

None of the three is a Fastify plugin registered with `fastify-plugin`; each exports what
`build-server.ts` needs.

| File | Exports | What it does |
| --- | --- | --- |
| `logger.plugin.ts` | `getLoggerOptions(env)` | pino config: `pino-pretty` locally, a `req` serializer, and the `redact` list |
| `swagger.plugin.ts` | `setupSwagger(server)` | `@fastify/swagger` + UI at `/api/documentation`, Zod → OpenAPI via `jsonSchemaTransform` |
| `auth.plugin.ts` | `getRequireUserHook`, `getRequireMembershipHook`, `getRequireProjectParamMembershipHook`, `requireLeader`, `requireAppOwner`, `PROJECT_ID_HEADER` | the auth hook functions `build-server.ts` decorates onto the instance — see [hooks.md](./hooks.md) |

Third-party plugins are registered in `registerCorePlugins`: `@fastify/helmet`, `@fastify/compress`
(br/gzip over 1 KB), `@fastify/cors` and `@fastify/websocket`.

## Bootstrap order (`buildServer`)

1. `getEnv()` — parse `process.env` through `EnvSchema`; the server refuses to boot on a bad `.env`
2. Create the server: `genReqId` (crypto UUID), `requestIdHeader: 'x-request-id'`, `trustProxy`,
   logger from `getLoggerOptions(env)`, `exposeHeadRoutes: false`, `pluginTimeout: 10_000`
3. `registerCorePlugins` — helmet, compress, cors, websocket
4. Swagger — **only** when `NODE_ENV` is `local` or `staging`, imported lazily
5. `setErrorHandler(errorHandler)` and `setNotFoundHandler` ([errors.md](./errors.md))
6. `setValidatorCompiler` / `setSerializerCompiler` from `fastify-type-provider-zod`
7. `decorateContext` — `db`, `env`, `repos`, `services`, then the auth hooks (`requireUser`,
   `requireMembership`, `requireProjectParamMembership`, `requireLeader`, `requireAppOwner`)
8. `registerRoutes` — autoload of `routes/` ([routes.md](./routes.md))
9. Start the timers (stale-plan, stale-question, pull-request reconcile, bugfix idle, auto-upgrade
   sweeps) and stop them in `onClose` hooks ([controllers.md](./controllers.md) § Timers)

## Rules

- **CORS is `origin: '*'` with `credentials: false`, and must stay that pair.** The API carries no
  ambient credential — every protected route reads a bearer token the browser attaches deliberately —
  so a foreign page has nothing to replay. Turning `credentials` on beside a wildcard origin would
  let any site make authenticated requests
- **Decorators and compilers before routes.** Anything a route or `autohooks.ts` reads off `fastify`
  must be decorated in `decorateContext` before `registerRoutes`
- **Every decorator is typed** on `FastifyInstance` in `src/types/fastify.d.ts`; request fields a hook
  sets (`user`, `membership`, `agent`, `uiSession`) on `FastifyRequest` in the same file
- **Keep secrets out of logs.** `logger.plugin.ts` redacts `req.headers.authorization`, `password`,
  `res.password`, `req.body.pat`, `pat` and `webhookSecret`. Anything equivalent you add — a new
  credential in a body, a header, a log field — goes on that list in the same change
- A new server-wide Fastify plugin that adds hooks or decorators must be wrapped in `fastify-plugin`,
  or Fastify encapsulates it and sibling routes never see it. Prefer the existing shape — a function
  `build-server.ts` calls — when one fits
- Per-request, per-folder behavior is a **hook**, not a plugin — see [hooks.md](./hooks.md)
