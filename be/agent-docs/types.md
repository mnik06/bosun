# Types

Zod schemas, their inferred types, and the few interfaces that have no runtime shape. Prefer a Zod
schema with `z.infer` wherever a value crosses a boundary — HTTP, a socket, a jsonb column, env — so
one definition does both validation and typing.

## Placement

| What | Where | Example |
| --- | --- | --- |
| Request/response schemas for a route | `src/api/routes/schemas/<domain>/` | `CreateMachineReqSchema.ts`, `LineSchemas.ts` |
| Domain/entity schema + inferred type | `src/types/<Entity>Schema.ts` | `MachineSchema.ts` → `MachineSchema`, `Machine`, `MachineStatus` |
| Socket frames and the wire protocol | `src/types/protocol.ts`, `ui-protocol.ts`, `*-frames.ts`, `*-stream.ts` | `AgentMsgSchema`, `ServerMsgSchema`, `UiMsgSchema` |
| Env schema | `src/types/EnvSchema.ts` | `EnvSchema`, `Env` |
| Fastify instance/request augmentation | `src/types/fastify.d.ts` | `db`, `env`, `repos`, `services`, the auth hooks; `request.user`, `membership`, `agent`, `uiSession` |
| Repo type | the repo file itself | `export type MachineRepo = ReturnType<typeof getMachineRepo>` |
| Service type | the service file itself | `export type SocketRegistry = ReturnType<typeof getSocketRegistry>` |
| A deps bundle | beside its builder in the controller domain | `LineDeps` in `controllers/line/line-deps.ts` |
| One-off, single-file shape | inline, not exported | `z.object({ repositoryId: z.string() })` in a route |

`src/types/` is flat — no domain sub-folders. Entity files are PascalCase `<Entity>Schema.ts`; frame
and protocol files are kebab-case.

## Two kinds of schema — keep them separate

- **Route boundary schemas** (`src/api/routes/schemas/<domain>/`) describe what crosses HTTP. They are
  the Swagger contract
- **Domain schemas** (`src/types/`) describe a persisted entity or a value the domain passes around.
  Repos parse rows through them; `schema.ts` borrows their unions via `$type<...>()`

They overlap, and a route may use a domain schema as its response when the wire shape really is the
row (`MachineSchema` on `GET /machines/:id`). A request schema is usually a subset — no `id`, no
timestamps, no `projectId` (that comes from `req.membership`).

## Naming

- `*ReqSchema` — request bodies; `*ParamsSchema` / `*QuerySchema` for params and querystrings
  (`MachineIdParamsSchema`, `NotificationListQuerySchema`)
- `*RespSchema` — response bodies
- `*MsgSchema` — one socket frame (`HelloMsgSchema`, `ExecStartMsgSchema`); the union is
  `AgentMsgSchema` (agent → BE), `ServerMsgSchema` (BE → agent), `UiMsgSchema` / `UiCommandSchema`
  (BE ↔ browser)
- Entity: `<Entity>Schema` + `type <Entity> = z.infer<typeof <Entity>Schema>`
- No `I` / `T` / `E` prefixes (`MachineRepo`, `LineDeps`, `GitProvider`)

## Hard Rules

### Derive types from schemas

A value with a runtime shape gets a Zod schema and a `z.infer`'d type — no parallel hand-written
interface. Plain `interface` is for behavioral contracts with no runtime representation
(`GitProvider`, `LineDeps`).

### Protocol types are mirrored by hand in `agent/`

`agent/` has no shared package with `be/`. Its `agent/src/protocol.ts`, `build-frames.ts`,
`bugfix-frames.ts`, `onboarding-frames.ts`, `quick-fix-frames.ts`, `footprint.ts`,
`chat-attachment.ts` and the project-config grammar files mirror their `be/src/types/` namesakes,
and say so in a header comment. Changing a frame, or the config grammar, means changing both sides
in the same piece of work — a frame one side emits and the other's schema rejects is logged and
dropped, never handled. See [sockets.md](./sockets.md).

### Repos use domain types, not route schemas

A repo's params and returns come from `src/types/` only; `eslint-plugin-boundaries` refuses
`repo -> route-schema`. Controllers bridge the two.

### Don't export single-file types

If a type is used only in its own file, don't `export` it. Promote it when a second file needs it.

### Env schema is special

`src/types/EnvSchema.ts` validates `process.env`, parsed once by `getEnv()` at the top of
`buildServer`. No `.transform()` there — it must not rewrite env values. `.refine()` for guards is
fine and used: the publishable and secret Supabase key slots refuse each other's format. A new
variable goes in `EnvSchema.ts` **and** `.env.example`, and — because `pnpm deploy` refuses when a
required one is missing on Fly — `fly secrets set` or a `[env]` entry in `fly.toml`.

### Object params for functions with multiple same-type args

Model them as one object type, not positional args. See CLAUDE.md General Rules.
