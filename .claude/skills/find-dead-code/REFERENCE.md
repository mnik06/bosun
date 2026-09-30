# Reference — dead-code hunting in bosun

## Repo map

| Path | What | Reachability |
|---|---|---|
| `fe/app/routes.ts` | react-router route table | Pages referenced by **string path**, not import |
| `fe/app/{views,widgets,features,entities,shared}` | capped FSD layers | every slice has an `index.ts` barrel; barrels hide real deadness |
| `fe/app/theme.ts` → `fe/app/theme.css` | Mantine theme → generated CSS | `theme.css` is generated; `export default theme` is read by `tailwind-preset-mantine`'s vite plugin |
| `fe/app/entry.client.tsx`, `fe/public/sw.js`, `fe/public/manifest.webmanifest` | PWA | `sw.js` is registered by the string `'/sw.js'`; icons are named by the manifest |
| `be/src/api/routes/**` | Fastify routes | Loaded by `@fastify/autoload` (`ignoreFilter: 'schemas'`) — **no static importer, still live**, including the top-level `*.route.ts` files |
| `be/src/api/routes/**/autohooks.ts` | per-dir hooks | autoload convention, no importer |
| `be/src/api/plugins/**` | Fastify plugins | registered in `build-server.ts` — check there before flagging |
| `be/src/services/drizzle/schema.ts` | single drizzle schema | Tables/columns dead only if none of agent/, be/, fe/ names them |
| `be/drizzle-out/*.sql` | migrations | Immutable history — never a finding |
| `be/assets/install.sh` | the installer | served by `be/src/services/installer/installer.service.ts` |
| `be/scripts/deploy.sh` | deploy entrypoint | reads `EnvSchema` at run time; referenced from `package.json` |
| `be/src/types/*-frames.ts`, `protocol.ts`, `ui-protocol.ts` ↔ `agent/src/*-frames.ts`, `protocol.ts` | wire protocol | frames are matched by their `type` **string** across packages |
| `agent/src/index.ts` → `agent/src/commands/*.ts` | commander CLI | commands reached by argv; `git-credential` is hidden and invoked by git itself |
| `agent/src/*/mcp/tools.ts` | MCP tools per session | called by the `claude` session **by name**, named by `agent/src/prompts/*.ts` |

Toolchain: Node 24.15 (each package's `.nvmrc`) + pnpm 11.8. No knip/ts-prune/depcheck is
installed — the scan script runs knip via `pnpm dlx`. All three packages run lint and jscpd in `pnpm preflight`.

## The inverse trap — looks live, is dead

The trap list below is about things that *look dead and aren't*. There is one class
that runs the other way, and reference counting is structurally blind to it: **a field whose name
is live in every layer while its value is always NULL.**

A column can carry a drizzle declaration, a repo `columns` projection, an entity schema in
`be/src/types/`, a route response schema, a fe zod model field and a dozen render sites — dozens of
hits, so both knip and `verify-symbol.sh` clear it — while every producer writes the literal `null`
and the column has never held a value.

Rule: for a **symbol**, ask "who references it?" For a **field**, ask
"who writes it a non-constant value?" Those are different questions and only the
second one decides a field. Run `scripts/dead-fields.py` and read section A.

## False-positive traps

Anything below is **live** even when a tool calls it unused. Put it in the
"checked and NOT dead" section instead of the findings.

1. **BE route files** — `@fastify/autoload` discovers `be/src/api/routes/**/*.ts` at runtime.
   Never "unused file".
2. **`autohooks.ts`** — autoload convention name. No importer by design.
3. **FE page modules** — reached by string in `app/routes.ts`
   (`route('plans/:planId', 'views/plan-detail/plan-page.tsx')`). grep the *path string*, not the
   symbol.
4. **react-router magic exports** — `default`, `clientLoader`, `clientAction`, `HydrateFallback`,
   `ErrorBoundary`, `meta`, `links`, `shouldRevalidate`.
5. **Generated files** — `fe/app/theme.css`, `fe/.react-router/**` (`+types`), `*.d.ts` ambient
   declarations (`fe/app/env.d.ts`, `be/src/types/fastify.d.ts` declaration merging).
6. **Drizzle migrations** — `be/drizzle-out/`. Also: a column dropped in code but still in a
   past migration is normal, not dead code.
7. **Wire-frame schemas** — `be/src/types/*-frames.ts` / `protocol.ts` and their `agent/src/`
   mirrors are matched by the `type` literal (`'build.worktree.ensure'`), not by import. knip
   flags mirror-side schemas in `agent/src/protocol.ts` as unused exports; grep the literal in
   both packages before believing it. And a frame the current agent no longer sends may still
   arrive from a machine on an older agent version — its be handler is tier 3 at most.
8. **MCP tools** — `agent/src/*/mcp/tools.ts` entries are invoked by the session by name
   (`mark_ac_verified`, `report_finding`, `stack_up`). grep the name in `agent/src/prompts/`.
9. **`plans/`, `.bosun/`, `README.md`** — process artifacts. Out of scope unless the user names them.
10. **Mirrors** — a fe or agent constant that `// Mirrors` a be one (`CHAT_ATTACHMENT_LIMITS`) is
    live as long as the be side is.
11. **Routes with no fe caller by design** — `/enroll`, `/agent/ws`, `/install.sh`, `/mcp-presets`
    and `/health` are the agent's and the installer's surface; `/github/webhook` and the Azure
    webhook are called by the provider; `/api/documentation` is swagger (local + staging).
12. **Config keys read via `process.env` / `import.meta.env`** — string access, invisible to
    the type graph. Every `EnvSchema` key is also required by `be/scripts/deploy.sh`.
13. **`export default theme`** in `fe/app/theme.ts` — read by `tailwind-preset-mantine`'s vite
    plugin through a dynamic import.
14. **An exported type used only inside its own file** — not dead; at most its `export` keyword is
    redundant. (Plan #13's verify pass caught three such false candidates: `ConfigSource`,
    `OnboardingProgress`, `Session`.)
15. **Agent CLI commands** — registered on `commander` in `agent/src/index.ts`, run by the user,
    the systemd unit, or git (`git-credential`).

## Categories

### 1. Unused exports, orphan files, unused deps

Tool-driven, then verified.

```bash
bash scripts/scan.sh agent  # knip: files, exports, types, deps, unlisted deps
bash scripts/scan.sh be
bash scripts/scan.sh fe
```

Triage rules:
- **Orphan file** — real only if no importer AND not in the trap list AND not an entrypoint.
- **Unused export** — check whether the only consumer is a barrel `index.ts`. If a barrel
  re-exports it and nothing imports it through the barrel, both lines are dead (tier 2 —
  report barrel + symbol as one finding).
- **Unused dep** — verify with `rg "from '<pkg>'|require\('<pkg>'\)|<pkg>/"` across the
  package. Build-time-only deps are config- or string-referenced — `pino-pretty` (a logger
  transport), `tsconfig-paths`, `ts-node`, `nodemon` in be; `babel-plugin-react-compiler`,
  `@babel/preset-typescript` (strings in `vite.config.ts`), `@fontsource-variable/*` (`@import` in
  `app.css`), `husky` / `lint-staged` in fe. Check `vite.config.ts`, `eslint.config.*`,
  `package.json` scripts and CSS before flagging.

### 2. Unreachable + vestigial code

Not tool-findable. Read, don't grep-only.

- Commented-out blocks ≥5 lines: `rg -n '^\s*//\s*(const|function|export|if|await|return)' agent/src be/src fe/app`
- Always-false / constant conditions, `if (false)`, `&& false`, flags never set.
- Superseded duplicates — after a shared extraction (`createRateLimitCooldownGuard`,
  `diffBranchHeads`, `ConnectionActionsMenu`, `clipTail`, `createStderrTail`), per-provider or
  per-session copies may survive unused. Compare siblings: Azure DevOps vs GitHub PAT, and the
  agent sessions (planning / execution / bugfix / quick-fix / onboarding / integration / ask /
  summary) should be symmetrical where they share plumbing; an asymmetry is a candidate either way.
- Stub functions that only `throw new Error('not implemented')` or return a constant, with
  no caller.
- Legacy names from shipped renames (queues → the line, plan 009) — check the plan's `### Removed`
  section before flagging a wire key or DB name that *looks* renamed.

### 3. Dead DB / API / wire surface (highest value, highest risk — mostly tier 3)

**Dead API route**: a BE route with no caller.
```bash
# list route registrations
rg -n "fastify\.(get|post|put|patch|delete)\(" be/src/api/routes --glob '!**/schemas/**' -A1
# for each, look for a caller in the fe AND the agent
rg -n "<route-segment>" fe/app agent/src
```
No hit → tier 3, not tier 1: routes are a public surface and may be called by the installer, a
provider webhook, or an agent on an older version (trap 11). Say that in the risk column.

**Dead frame**: `sweeps.txt` counts every `type: z.literal('…')` across be/, agent/ and fe/. A
frame needs a sender on one side and a handler on the other; a low count is where to look. Remember
trap 7 before calling a handler dead.

**Dead MCP tool**: `sweeps.txt` counts how often `agent/src/prompts/` names each tool. A tool no
prompt names and no session is told about is a candidate (tier 2).

**Dead table / column**:
```bash
# column identifiers from schema.ts, then per name:
bash scripts/verify-symbol.sh <camelCaseColumn>
rg -n "'<snake_case_column>'" agent/src be/src fe/app     # raw-SQL / string access
```
A column with zero code refs is tier 3 — dropping it needs a migration and a data check.
Report it; do not propose the migration unless asked.

**Zero refs is only half the sweep.** The greps above find columns nothing *names*.
They cannot find columns nothing *writes* — those score dozens of hits and look
perfectly alive. Always run § 4 as well before concluding a table's columns are fine.

### 4. Always-null plumbing

The category tooling cannot reach. A field is threaded through drizzle schema → repo
`columns` projection → zod entity/response schema → fe model → render, and **every producer
writes a constant** (`null`, `[]`, `{}`, `false`, `0`) or omits the column from the insert
entirely. The identifier is live everywhere; the data never exists.

```bash
python3 scripts/dead-fields.py            # section A = strong, section B = trace by hand
```

The script parses every code-written column out of `schema.ts` (skipping
`.default(...)` / `defaultNow()` columns — the DB fills those), then classifies every
`col:` assignment site in `be/src` + `fe/app` + `agent/src`:

| Bucket | Shape | Meaning |
|---|---|---|
| real producer | anything else | column is alive, not reported |
| constant | `col: null`, `col: []`, `col: {}` | writes nothing |
| passthrough | `col: input.col ?? null` | launders a caller's value — trace the caller |
| select-projection | `col: fooTable.col` | a read, not a write |
| type/zod decl | `col: z.string()`, `/types/`, `routes/schemas/`, fe `/model/`, `*-frames.ts`, `protocol.ts` | a shape, not a write |
| shorthand | `const col = …`, `{ ...rest, col }` | a producer the regex can't see → demoted to section B |

Section A = has constant writes, no real producer, no shorthand binding. Verify each by
hand before reporting:

1. Any raw-SQL writer? `rg -n "<snake_case_col>" be/src` (the script counts these and
   prints a `!!` warning).
2. Any `UPDATE`/`.set({ col: … })` site? `rg -n "set\(\{[^}]*<col>" be/src`
3. Does the fe ever send it, or an agent frame carry it? If either builds the value, the column is
   live.

Then report the **whole chain as one finding** — column + repo projections + zod schemas +
TS types + fe model + render sites. Deleting only the column leaves permanently-false branches
behind, which is worse than leaving it alone.

Section B (passthrough-only) is a worklist, not a finding list: follow each caller to
its origin. It terminates either in a constant (promote to a finding) or in real input
(drop it) — often a frame field the agent fills in on the machine.

The same shape exists off the DB: a request-payload key nothing populates, a frame field always
`null`, a response property always `[]`, a reducer action never dispatched, a prop always passed
the same literal. Same question — who writes a real value?

### 5. Dead assets, config, scripts

```bash
# package.json scripts (not referenced by CI, deploy, README, or other scripts)
rg -n '<script-name>' .github README.md be/scripts .bosun agent/package.json be/package.json fe/package.json

# env vars declared but never read
rg -no '^[A-Z_]+' be/.env.example fe/.env.example 2>/dev/null | sort -u
# then per name: rg -n '<VAR>' be/src fe/app be/scripts be/fly.toml *.config.*

# static assets with no reference
rg -n '<filename>' fe/app fe/public be/src be/assets
```
Also: `.gitignore` entries for paths that no longer exist, dead CSS in `app.css` (grep the class
name across `fe/app`), obsolete steps in `.github/workflows/deploy.yml`.

## Working notes

- Run the machine pass **once**, then do all verification from its saved output — re-running
  knip per candidate wastes minutes.
- Batch gate-2 greps: one `verify-symbol.sh` call per candidate, but launch them together.
- Read `dead-fields.txt` **before** the knip reports. Knip's output is mostly barrel and
  mirror churn; section A is where the real findings are, and it is short.
- A high reference count is evidence about a *symbol*, never about a *field*.
- Prefer `git log -1 --format='%ad %h' -- <file>` when deciding tier 1 vs tier 2 — recently
  touched code is more likely WIP than dead.
- When a finding depends on a product decision (a feature deferred, not dropped — check the
  plan's `## Non-goals`), mark it tier 3 and name the decision. Deferred ≠ dead.
