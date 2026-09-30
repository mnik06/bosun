# find-duplicate-code — reference

## Categories

Walk all seven. Tooling only reaches #1.

### 1. Copy-paste clones (jscpd sees these)
Token-identical blocks ≥50 tokens. `clones-*.txt` rank them by **directory pair**, not by
individual clone — a 15-line clone repeated in 6 files is one finding, not 15. Typical shapes:
agent session turn handling (`agent/src/execution/session.ts` ↔ `agent/src/quick-fix/session.ts`),
drizzle `const columns` projections, zod response schemas, Mantine form wiring, `useEffect` socket
wiring.

### 2. Renamed twin implementations (jscpd is blind — highest value)
Two hand-written implementations of one rule, kept apart only by a provider or session-kind
rename. `twins.txt` section A (files) and C (symbols) find these by normalizing the domain token
out of the name. Known families:

- **Provider** — Azure DevOps vs GitHub PAT: `rotate-azure-modal.tsx` ↔ `rotate-github-pat-modal.tsx`,
  `connect-azure-modal.tsx` ↔ `connect-github-pat-modal.tsx`, `azure/shared/connection-guard.ts` ↔
  `github/shared/pat-connection-guard.ts`, `azure-connection.repo.ts` ↔ `github-pat-connection.repo.ts`,
  `azure/poll-branches.ts` ↔ `github/poll-branches.ts`, `azure/rotate-connection.ts` ↔
  `github/rotate-pat-connection.ts`, `use-connect-{azure,github,github-pat}.ts`.
- **Session kind** — `be/src/controllers/**/record-{build,plan,bugfix,quick-fix,onboarding}-frame.ts`,
  `say-to-plan.ts` ↔ `say-to-bugfix.ts`, `start-plan.ts` ↔ `start-onboarding.ts`,
  `plan-message.repo.ts` ↔ `bugfix-message.repo.ts`, the `agent/src/*/session.ts` family.

For each pair ask: **does the rule agree on both sides today?** If not it is a tier-A bug.
A guard, a comment, or an extra field on one side and not the other is the signature.

### 3. Retyped private helpers and constants
A generic helper written module-private next to its first caller, then rewritten by the next
feature. Precedents from plan #13's verify pass: a `clip()` truncate helper retyped in two agent
session modules (now `clipTail` in `agent/src/utils.ts`), and `STDERR_KEPT_CHARS = 500` redeclared
in 7 agent files (now the default of `createStderrTail` in `agent/src/sessions/turn-support.ts`).
`twins.txt` section C lists names declared in ≥2 files, exported or not; `sweeps.txt` lists
constants redeclared with the same literal.
Also check: does `be/src/utils/general.ts`, `fe/app/shared/lib/` or `agent/src/utils.ts` already
export it? Then every copy is redundant, including the "original".

### 4. Shape duplication
Same *structure* rewritten, not same text: repeated drizzle `const columns` sets and join
fragments, the same lifecycle column group on two tables (`github_pat_connections` ↔
`azure_connections`), zod schemas restating a shared type, repeated query-key factories, repeated
`Record` lookup tables. Search by shape: `rg -n 'pgTable\(' `, `rg -n 'z\.object\(' `,
`rg -n '\.innerJoin\('` and compare neighbours.

### 5. UI duplication
Modals with one differing prop, connection badges and action menus, status cards, page headers,
empty states, notification calls. A component reused across 2+ views belongs in `widgets/`; a
presentational piece tied to one resource belongs in that entity's `ui/`; a domain-free primitive
belongs in `fe/app/shared/ui/`.

### 6. Plumbing vs logic (the classification that decides everything)
Identical **infrastructure** is safely shared. Identical-looking **provider or session logic** is
often deliberate. In plan #13's verify pass the Azure/GitHub PAT twins shared a rate-limit
cooldown tracker, a branch-head diff and a connection actions-menu shell — those were extracted
(`createRateLimitCooldownGuard` and `diffBranchHeads` in `be/src/utils/general.ts`,
`ConnectionActionsMenu` in `fe/app/shared/ui/`). The provider API clients and their error
classification (`azure-errors.ts`, `github-pat-errors.ts`, `classify-github-failure.ts`) stayed
separate. When in doubt: could the two sides ever need to diverge for a product reason?
Yes → leave it. No → extract.

### 7. Mirror drift (be <-> agent, fe <-> be)
The packages share no code, so a wire contract exists twice: `be/src/types/*-frames.ts`,
`protocol.ts`, `project-config-*.ts`, `commit-outcome.ts` and their `agent/src/` twins, plus the
fe zod models and limits that mirror a be schema. `twins.txt` section D lists them. These are
**never** extraction candidates — run `twin-diff.py A B --raw` and report any frame, field or limit
present on one side only as tier A, unless the file itself explains the asymmetry (the agent
side often keeps a schema the be side imports from `BuildSchema.ts` instead).

## By-design duplication (never merge)

| What | Why | Evidence |
|---|---|---|
| be <-> agent wire schemas (`*-frames.ts`, `protocol.ts`, `project-config-{apps,grammar,sections}.ts`, `commit-outcome.ts`, `chat-attachment.ts`, `footprint.ts`) | separate packages, no shared code; the agent runs on remote machines at its own version | the files' own `Mirrors …` / `Mirrored in …` comments |
| fe zod models mirroring be responses (`fe/app/entities/*/model/*.ts`) and limits (`fe/app/entities/plan/lib/chat-attachments.ts`) | fe has no generated client; it parses what the API returns | `fe/CLAUDE.md` (zod at the boundary), `Mirrors` comments |
| Azure DevOps vs GitHub API clients (`azure-devops.service.ts`, `github-pat.service.ts`, `github-app.service.ts`) and their `call()` plumbing | the shared-fetch extraction was judged not worth the risk once the missing network-failure catch was fixed | plan #13 verify report |
| `github_pat_connections` vs `azure_connections` lifecycle column group | deferred — a schema/migration change for marginal benefit | plan #13 verify report |

Always list what you checked and left in the report's "By design" section — that is what stops
the next run repeating the same noise.

## Where extracted code goes

**FE (capped FSD, `fe/CLAUDE.md`, enforced by `fe/eslint.config.js`).** Import direction is
one-way: `views → widgets → features → entities → shared`. A layer may never import from a layer
to its left, siblings in a layer never import each other (the only exceptions are the two named in
`FSD_POLICIES`: `entities/machine → entities/repository`, `entities/plan → entities/machine`), and
a slice is consumed only through its `index.ts` barrel.

| Duplicated thing | Destination |
|---|---|
| Pure helper, primitives/generics only, no domain type | `fe/app/shared/lib/<name>.ts`, exported through `shared/lib/index.ts` |
| Generic UI, no domain | `fe/app/shared/ui/<name>.tsx` (precedent: `connection-actions-menu.tsx`) |
| Generic hook | `fe/app/shared/hooks/use-<name>.ts` |
| Anything tied to one backend noun — queries, types, label maps, domain UI | `entities/<noun>/{api,model,lib,ui}/` |
| Helper that depends on a slice's own convention | that slice's `lib/` — **never `shared/`** |
| Composite UI block used by 2+ views | `widgets/<widget>/` |
| A user action with its form and mutation | `features/<verb>/` |

Traps: domain knowledge is barred from `shared/`; `shared/` may not import an entity or feature;
duplication between two views is extracted **upward** into a widget/feature, never sideways.

**BE (`be/CLAUDE.md`, enforced by `BE_POLICIES` in `be/eslint.config.mjs`).** Layers:
`api/routes` → `controllers` → `repos` → db, with `services/` for infrastructure and `utils/`
for pure helpers.

| Duplicated thing | Destination |
|---|---|
| Controller helpers shared inside one domain | `be/src/controllers/<domain>/shared/…` (precedents: `controllers/github/shared/`, `controllers/line/shared/`) |
| Drizzle column sets, scope predicates, join fragments | the owning `repos/<domain>/` module |
| Cross-domain infrastructure or third-party wrapper | `be/src/services/<name>/` |
| Pure util, no db/fastify/domain types | `be/src/utils/general.ts` (precedents: `createRateLimitCooldownGuard`, `diffBranchHeads`); its own file if >~25 lines |
| Route request/response schemas | `be/src/api/routes/schemas/<entity>/`; domain schemas in `be/src/types/` |

Never propose a repo importing a controller or service logic, or a util importing anything but
utils and `HttpError`.

**Agent.**

| Duplicated thing | Destination |
|---|---|
| Pure helper | `agent/src/utils.ts` (precedent: `clipTail`) |
| Session plumbing — spawning claude, stderr tails, teardown, the MCP server, the ask tool | `agent/src/sessions/` (precedent: `createStderrTail` in `turn-support.ts`) |
| Machine-side service (git, env, memory, MCP config) | `agent/src/services/` |

Per-session prompts (`agent/src/prompts/*.ts`) and per-session MCP tools
(`agent/src/*/mcp/tools.ts`) differ by what each session may do — shared phrasing already lives in
`prompts/shared.ts`; check there before extracting more.

## False-positive traps

Do not report these as duplication:

- `be/drizzle-out/**` — migrations are history; repeated DDL is expected.
- `fe/app/theme.css` — generated from `theme.ts` by the vite plugin.
- `.react-router/`, `+types/**`, `build/`, `dist/`, `agent/release/` — generated.
- Route request/response schemas that intentionally restate a domain shape for the HTTP boundary.
- Per-kind frame and status schemas (`*StartMsgSchema`, `*DoneMsgSchema`, `*StatusSchema` in
  section C) — each is its own wire or state contract; the same suffix is not the same rule.
- be <-> agent and fe <-> be mirrors — see category 7; diff them, never merge them.
- Test files (already excluded by `.jscpd.json`; keep them excluded — duplicated setup in tests
  is cheap and readable).
- Barrel `index.ts` re-export lists.
- Two files with the same *name* in different slices (e.g. the eight `agent/src/*/session.ts`, the
  `agent/src/*/mcp/tools.ts`) but unrelated contents — `twins.txt` section B is name-based and needs a
  content check before it becomes a finding.
- Lookup `Record` tables that encode different data with the same shape.

## Verification recipes

**Drift class (gate 2).** `python3 scripts/twin-diff.py A B` normalizes `azure|github|pat|devops`
and the session tokens (`planning|plan|execution|bugfix|quick-fix|onboarding|integration|build|
summary|ask`) out of every identifier, then diffs. It prints a similarity % and the surviving
differences — those differences *are* the divergence report: a missing guard, an extra field, a
different comparison operator on one side is a tier-A bug. For a be <-> agent mirror pass `--raw`
— the names are meant to be identical, so normalizing hides nothing and only adds noise.

**Call-site count (gate 1).** `rg -n '\b<symbol>\b' agent/src be/src fe/app --glob '!**/*.test.*'` —
a symbol with one caller is not yet duplication, it is a future extraction.

**Grep for a twin before believing any fix is complete.** A fix applied to the Azure side and not
the GitHub side (or to one session kind and not the others) is the classic way a twin diverges.

**Proving an extraction would be safe** (report it as the suggested verification, do not run it):
for `schema.ts`, `pnpm db:migration:generate` reporting no schema changes, with the same probe run
before the change as a control. For repos, capture the emitted SQL + params of every changed method
before and after and diff them. For an agent extraction, `cd agent && pnpm preflight` plus the
patch bump in `agent/package.json`.

## Scripts

| Script | Does |
|---|---|
| `scan.sh [agent\|be\|fe]` | orchestrates everything into `$OUT_DIR` (each package uses its own jscpd + `.jscpd.json`) |
| `summarize-jscpd.py <report.json> <pkg>` | ranks clones by directory pair, then by size, then by file |
| `twins.py <repo>` | rename-normalized file twins (A), same-name files (B), symbol twins (C), cross-package mirrors (D) |
| `twin-diff.py <A> <B> [--raw]` | normalized diff + similarity % for one pair |
