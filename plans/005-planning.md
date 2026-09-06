# Plan: Planning — grill a ticket into a plan and its tracer bullets

_Bosun plan #005 · depends on 003 (landed)_

## Overview

A user picks an online machine, pastes a ticket, and is grilled by Claude — running on that machine,
in that checkout — until every product and architecture decision is resolved. The session then
publishes a plan, its acceptance criteria, and 3–4 tracer bullets, all as rows in bosun. No GitHub,
no terminal, no skill invoked by hand.

The session runs inside the existing `bosun-agent` process on the VPS, over the socket it already
holds. Nothing new is installed and no new port is opened to the outside.

**Success in one sentence:** you paste a ticket into a chat in the browser, answer ~20 option-card
questions, and end up with a plan, its `AC-n` list, and its tracer bullets stored in bosun and
editable.

## Acceptance criteria

**The machine can host a session**

- [ ] **AC-1** — Preflight reports a `claude-cli` check; a machine without the `claude` binary on the service's PATH shows it red.
- [ ] **AC-2** — Preflight reports which credential mode the machine is configured for and whether that credential is present.
- [ ] **AC-3** — The systemd unit sees the same `PATH` and credentials as the shell that installed it: a machine that passes preflight by hand also passes it under the service.
- [ ] **AC-4** — Starting a session on a machine that is offline or `paused`, or whose `claude-cli` or credential check is red, is refused with that reason and writes nothing.

**Starting a session**

- [ ] **AC-5** — A `Plans` page lists the caller's plans with title, machine, status and created-at; another account's plans are invisible.
- [ ] **AC-6** — "New plan" offers only machines that are `online` and owned by the caller; picking one and pasting text opens a full-screen chat.
- [ ] **AC-7** — A `plans` row is created the moment the session starts, with `status = 'planning'` and a null title, and appears on the Plans page immediately.
- [ ] **AC-8** — Two sessions run on one machine at once with separate `claude` processes and separate tool endpoints; their frames never cross.

**The chat**

- [ ] **AC-9** — Assistant text streams into the chat as it is produced, not in one block at the end.
- [ ] **AC-10** — While the recon agent runs, an activity line shows what the session is doing; the chat never sits silent with no indication it is alive.
- [ ] **AC-11** — A question renders as cards: header, question text, one clickable option per choice with its description; multi-select questions accept several.
- [ ] **AC-12** — Every question also accepts a free-text answer instead of an option.
- [ ] **AC-13** — Answering resumes the grill, and the answered question stays in the transcript with the chosen option shown.
- [ ] **AC-14** — Closing the tab and reopening the plan re-renders the full transcript and any unanswered question, and answering it still works.
- [ ] **AC-15** — If the agent process dies mid-grill, the plan moves to `status = 'failed'` with a reason on the Plans page, rather than hanging in `planning` forever.
- [ ] **AC-16** — Discarding a plan mid-grill kills its `claude` process on the VPS; no orphan is left behind.

**The artifact**

- [ ] **AC-17** — As the session writes the plan, a side panel fills in live: the title, then each `AC-n`, then each tracer bullet.
- [ ] **AC-18** — On success the plan holds a markdown body, one row per `AC-n`, and 3–4 tracer-bullet rows, and `status` becomes `ready`.
- [ ] **AC-19** — Every `AC-n` is assigned to exactly one tracer bullet; the API rejects a bullet set leaving an AC unassigned or assigning one twice.
- [ ] **AC-20** — A feature with a UI surface also gets a final bullet with `kind = 'verify'`, ordered last; a feature with no UI surface does not.
- [ ] **AC-21** — The plan detail page renders body, ACs and bullets, and links back to the chat transcript.

**Editing**

- [ ] **AC-22** — Plan title and body can be edited after publish.
- [ ] **AC-23** — An `AC-n` can be edited, deleted, or moved to a different tracer bullet.
- [ ] **AC-24** — A tracer bullet can be renamed, reordered, split or deleted; deleting one is refused while it still owns an AC.
- [ ] **AC-25** — A plan can be discarded, removing it, its ACs, its bullets and its transcript.

## Architecture

### How it works

Planning reuses the socket the agent already holds. The BE sends `plan.start` down it; the agent
spawns a `claude` process with `cwd` set to the machine's `repoPath` and streams everything back up
as frames. The BE persists what matters, then forwards to the browser sockets subscribed to that
plan.

The session is driven by **the `claude` CLI in headless mode**, not the Agent SDK:

```
claude --print --output-format stream-json --input-format stream-json \
       --mcp-config <session mcp config> \
       --allowed-tools 'Read,Grep,Glob,Task,mcp__bosun__*'
```

Headless cannot answer `AskUserQuestion` — `--permission-prompt-tool` "cannot approve tools
requiring user interaction", and that is a hard limit, not a configuration. **So the grill does not
use `AskUserQuestion` at all.** Bosun exposes its own `bosun_ask` tool with the same payload shape;
the model calls it, the call blocks until the browser answers, and the answer comes back as the tool
result. An ordinary MCP tool call is not an interaction-requiring builtin, so nothing denies it.

This is why the CLI is chosen over the SDK. The SDK's advantage was that skiprs' `plan-me` works
unchanged through `canUseTool` — but bosun owns and inlines its own prompt, so "unchanged" buys
nothing. Against that: the CLI has no npm dependency to bundle into the agent binary, and
**execution will have to use the CLI anyway** because it is unattended. One harness, one stream
parser, one process model for both halves of the product.

Two channels, split by purpose. **The socket carries the stream** — assistant text, activity,
questions, answers, terminal states: one-way, high-volume, ephemeral. **HTTP carries the writes** —
the session's tools `POST` to the BE with the machine key and get a real response body, which a tool
needs (`create_plan` must return the id `add_ac` then uses).

Bosun owns its planning prompt and **inlines it as the session prompt**. Nothing is written to the
user's repo and no skill is loaded from disk, so the prompt can never silently fail to load and leave
a generic session nobody notices. The prompt is a generalized `plan-me`: it discovers whatever specs
the repo has rather than assuming a path, judges design from the code already there rather than a
named UI kit, and calls `bosun_ask` for every question.

Streaming is not persisted verbatim. Text deltas are forwarded and dropped; the BE stores completed
text blocks, questions and answers — enough to re-render a transcript, small enough that a 30-minute
grill is not thousands of rows.

### The MCP server lives in the agent

The agent runs an **HTTP MCP server on loopback**, one per session, on an ephemeral port. `claude` is
given a generated `--mcp-config` pointing at `http://127.0.0.1:<port>`. Loopback only — it is never
reachable from outside the box.

This keeps the tools in the same process that owns the WebSocket, so `bosun_ask` can resolve against
an incoming `plan.answer` with no IPC. A stdio MCP server would be a child of `claude`, in a
different process from the socket, and every answer would need a second hop.

A session's port dies with its session. Concurrency is unlimited, so ports are allocated per session
and never reused while one is live.

### Screen layout

- `Plans list` (`/plans`) — header with "New plan" · a table of plans: title (or "Untitled" while planning), machine, status badge, created-at · row click opens the plan
- `New plan modal` — `Select` of online machines owned by the caller · a `Textarea` for the pasted ticket · submit opens the chat
- `Plan chat` (`/plans/:planId`) — full-screen two-pane: left is the transcript with streamed text, activity lines and question cards; right is the live plan panel filling in as tools fire · discard in the header
- `Plan detail` (`/plans/:planId`, once `ready`) — same route, chat collapsed to a tab · body, ACs and bullets rendered and editable in place

### Schema changes

```
plans
  id             text primary key            -- "p_" + nanoid
  userId         text not null references users(id)
  machineId      text not null references machines(id)
  title          text                        -- null until the session names it
  bodyMd         text
  status         text not null default 'planning'   -- planning | ready | failed
  failureReason  text
  input          text not null               -- the pasted ticket
  createdAt      timestamptz not null default now()

planMessages
  id         text primary key
  planId     text not null references plans(id) on delete cascade
  seq        integer not null
  role       text not null                   -- user | assistant | activity | question | answer
  content    jsonb not null
  createdAt  timestamptz not null default now()

acs
  id       text primary key
  planId   text not null references plans(id) on delete cascade
  code     text not null                     -- "AC-7"
  text     text not null
  sliceId  text references slices(id)
  ordinal  integer not null

slices
  id       text primary key
  planId   text not null references plans(id) on delete cascade
  ordinal  integer not null
  kind     text not null default 'build'     -- build | verify
  title    text not null
  bodyMd   text
```

Plus one column on `machines`:

```
claudeAuthMode  text   -- 'oauth' | 'api-key', reported by the agent at preflight
```

The credential itself never reaches bosun. It lives on the VPS in `~/.bosun/env`; the agent reports
only which mode is configured and whether the variable is present.

`plans.status = 'planning'` with an unanswered question is the resume state: the pending question is
the last `planMessages` row with `role = 'question'` and no `answer` after it. No separate column —
the transcript already holds it.

### API contract

```ts
// browser, session-authenticated
POST   /plans                 { machineId, input }        -> { plan }
GET    /plans                                             -> Plan[]
GET    /plans/:id                                         -> { plan, messages, acs, slices }
POST   /plans/:id/answer      { questionId, answers }     -> 202
DELETE /plans/:id                                         -> 204
PATCH  /plans/:id             { title?, bodyMd? }         -> { plan }
PATCH  /plans/:id/acs/:acId   { text?, sliceId? }         -> { ac }
DELETE /plans/:id/acs/:acId                               -> 204
PATCH  /plans/:id/slices/:sliceId  { title?, bodyMd?, ordinal? } -> { slice }
DELETE /plans/:id/slices/:sliceId                         -> 204 | 409 while it owns an AC

// agent, machine-key authenticated — called by the session's tools
POST /agent/plans/:id/title   { title, bodyMd }           -> { ok }
POST /agent/plans/:id/acs     { code, text }              -> { acId }
POST /agent/plans/:id/slices  { ordinal, kind, title, bodyMd, acCodes } -> { sliceId }
```

### Wire protocol

`ServerMsgSchema` on the agent side becomes a discriminated union — today it is not, and
`handleServerFrame` replies `pong` to whatever arrives, so it would pong a `plan.start`.

```ts
// BE -> agent
{ type: 'ping',        id }
{ type: 'plan.start',  planId, input }
{ type: 'plan.answer', planId, questionId, answers }
{ type: 'plan.cancel', planId }

// agent -> BE
{ type: 'plan.text',      planId, delta }
{ type: 'plan.activity',  planId, label }         // "Exploring the codebase", "Read 14 files"
{ type: 'plan.question',  planId, questionId, questions }
{ type: 'plan.done',      planId }
{ type: 'plan.error',     planId, message }

// BE -> browser
{ type: 'plan.text' | 'plan.activity' | 'plan.question' | 'plan.done' | 'plan.error', planId, ... }
{ type: 'plan.updated', plan }
```

`plan.question.questions` carries `bosun_ask`'s arguments verbatim —
`{ header, question, options: [{ label, description }], multiSelect }` — so the cards render from the
payload with no translation, and `plan.answer` is fed straight back as the tool result.

### The tools

One MCP server, four tools:

| Tool | Blocks? | Does |
|---|---|---|
| `bosun_ask` | yes, minutes | emits `plan.question`, resolves on the matching `plan.answer` |
| `create_plan` | no | `POST /agent/plans/:id/title`, returns the plan id |
| `add_ac` | no | `POST /agent/plans/:id/acs`, returns the AC id |
| `create_slice` | no | `POST /agent/plans/:id/slices` with its `acCodes` |

`bosun_ask` blocking for minutes is the load-bearing behaviour of this design. Whatever tool-call
timeout the CLI applies must be raised or disabled for this server; confirm the mechanism in phase 2
before building the UI on top of it.

### New modules

- `agent/src/planning/process.ts` — spawn, cancel, reap `claude` processes
- `agent/src/planning/stream.ts` — the stream-json parser; owned deliberately, not `grep '^{' | jq`
- `agent/src/planning/mcp.ts` — the loopback HTTP MCP server and its four tools
- `agent/src/planning/prompt.ts` — the inlined, generalized planning prompt

## Key decisions

- **`claude -p` headless, not the Agent SDK.** Bosun owns its prompt, so the SDK's one real advantage
  (skiprs' `plan-me` unchanged through `canUseTool`) is worth nothing here. The CLI adds no npm
  dependency to the agent binary, removes the "will the SDK survive `bun build --compile`" risk
  entirely, and is the same harness execution must use because execution is unattended.
- **`bosun_ask` replaces `AskUserQuestion`.** Headless strictly denies interaction-requiring builtins;
  an ordinary MCP tool call is not one. The tool call *is* the question and the tool result *is* the
  answer.
- **The MCP server runs in the agent process, over loopback HTTP.** Keeps `bosun_ask` in the same
  process as the WebSocket, so an answer needs no IPC. Stdio would put it under `claude`, one hop away.
- **Socket streams, HTTP writes.** A tool needs a response body; the socket has no request/response,
  and `pending-pings.service` is one-shot correlation.
- **The prompt is inlined, not installed.** Writing into `.claude/skills/` would dirty the working
  tree and trip the `git-clean` preflight.
- **A plan is tied to one machine.** A machine has exactly one `repoPath`, so machine ≈ repo today,
  and ACs only mean something against the checkout they were written from.
- **Slices are cut without a confirmation gate**, unlike `plan-to-bullets`. The replacement is that
  everything is editable afterwards.
- **Unlimited concurrent sessions per machine.** No `busy` state. Revisit when execution lands, since
  a build run rewrites the checkout a concurrent recon is reading.
- **The credential variable is not hardcoded.** The agent passes whichever of the supported variables
  is set in `~/.bosun/env` into the session, and reports the mode. Bosun never stores the value. This
  is what lets the same code serve a personal subscription today and a customer's API key later —
  third-party products are required to use API-key authentication, so that switch will be needed.
- **"Session" never means "agent" in code.** `bosun-agent` is the daemon; a planning run is a session.

## Non-goals

- Execution, queueing, running a plan, or anything that writes code
- Jira, Figma or any external integration — the input is pasted text
- Resuming a `claude` process after the agent restarts
- Storing raw token-level transcripts
- Re-planning or diffing two plans
- Sharing a plan between machines, or a `repos` concept
- Bosun writing anything to the user's repo, or storing any Claude credential

## Blockers & dependencies

- **#003 has landed** — `machines.userId` with its FK and index, `listOwned` / `getOwnedById`, and
  routes answering `404` rather than `403` for someone else's machine. Planning inherits that scoping
  and must not widen it: every plan route is owner-scoped, and `plan.*` frames go only to sockets
  subscribed to that plan.
- `broadcastToUi` still fans to every open UI socket. Per-plan subscription replaces it for planning
  frames; the existing `machine.updated` fan-out is scoped in the same pass.
- A machine with the `claude` binary and a working credential, both visible to the systemd service.
- **#004's agent half is not landed.** The BE sends `refresh`/`pause`/`resume`/`shutdown`, but the
  agent's `ServerMsgSchema` is still `[PingMsgSchema]`, so those frames fail its schema and are
  dropped. Phase 1 touches that same union and that same handler — land #004's agent side first, or
  do both in one pass, rather than editing it twice.

## Slices

- [ ] **Phase 1: A machine that can host a session** — AC-1 … AC-4, AC-9, AC-10
- [ ] **Phase 2: The grill** — AC-5 … AC-8, AC-11 … AC-16
- [ ] **Phase 3: The artifact** — AC-17 … AC-21
- [ ] **Phase 4: Editing** — AC-22 … AC-25

### Phase 1 — A machine that can host a session

Make the box actually capable, then prove a `claude` process can run on it and its output reach the
browser. Trivial prompt, no questions, no tools.

- `agent/src/preflight.ts` — `claude-cli` check (`claude --version` on PATH) and the credential-mode
  check; report `claudeAuthMode`
- `agent/install.sh` + the systemd unit — `EnvironmentFile=-%h/.bosun/env` and an explicit
  `Environment=PATH=…` resolved at install time from the installing shell (`command -v node`,
  `command -v claude`). Without this the service sees neither the user's PATH nor their credential,
  and a machine that passes preflight by hand fails under the unit. Seed `~/.bosun/env` at `0600`
- `agent/src/protocol.ts` + `be/src/types/protocol.ts` — add the `plan.*` variants to
  `ServerMsgSchema`. The BE's union already carries `ping`/`refresh`/`pause`/`resume`/`shutdown` from
  #004; the agent's is still a one-member union of `ping`, and `run.ts` sends a `pong` for whatever
  parses — so the moment `plan.start` joins the union it gets ponged. Replace that line with a switch
  on `type` before adding anything to it
- `agent/src/planning/process.ts` + `stream.ts` — spawn `claude --print --output-format stream-json`
  with a fixed throwaway prompt and `cwd: repoPath`; parse the stream into `plan.text` /
  `plan.activity` / `plan.done`. Confirm the exact flag spellings against `claude --help` on the box
  rather than trusting this document
- `be/` — `plans` table, `machines.claudeAuthMode`, `POST /plans`, per-plan socket subscription and
  forwarding, refusal when the machine is offline or a required check is red
- `fe/` — a bare chat route that streams the text

Proof: a machine shows `claude-cli` and credential green under the service, and a session started
from the browser streams Claude's output live.

### Phase 2 — The grill

The question round-trip, and the Plans page around it.

- `agent/src/planning/mcp.ts` — loopback HTTP MCP server, per-session port, generated `--mcp-config`;
  `bosun_ask` emits `plan.question` and returns a promise resolved by `plan.answer`. Establish first
  that a tool call may block for minutes, and how the timeout is configured
- `agent/src/planning/prompt.ts` — the generalized planning prompt, inlined: recon discovers whatever
  specs the repo holds, judges design from existing code, no skiprs paths, `bosun_ask` for every
  question
- `agent/src/planning/process.ts` — cancel kills the process and frees the port
- `be/` — `planMessages`, `POST /plans/:id/answer`, transcript persistence, `failed` on agent loss,
  `plan.cancel` on discard
- `fe/` — Plans list, New plan modal (online machines only), question cards with free-text fallback,
  transcript replay on reload, activity line

Proof: a full grill runs to the last question, survives a tab close mid-way, two sessions on one
machine stay separate, and discarding one kills its process.

### Phase 3 — The artifact

The session writes structured rows, and the browser watches them appear.

- `agent/src/planning/mcp.ts` — `create_plan`, `add_ac`, `create_slice`, each `POST`ing to
  `/agent/plans/:id/*` with the machine key
- `be/` — `acs`, `slices`, the agent-authenticated write routes, the every-AC-in-exactly-one-slice
  invariant, `plan.updated` fan-out, `status = 'ready'` on `plan.done`
- `fe/` — live plan panel, plan detail rendering body / ACs / bullets

Proof: a grill ends with a plan, its ACs and 3–4 bullets stored, the verify bullet present only when
there is a UI surface, and the panel having filled in as it happened.

### Phase 4 — Editing

- `be/` — `PATCH`/`DELETE` on plan, ACs and slices; refuse deleting a slice that still owns an AC;
  cascade on plan delete
- `fe/` — inline editing of title and body, moving an AC between bullets, renaming/reordering/
  deleting bullets, discard

Proof: AC-22 through AC-25.

## Risks

- **A blocking MCP tool is the whole design.** If the CLI caps how long a tool call may take and that
  cap cannot be raised, `bosun_ask` fails and the grill has no mechanism. Establish this in phase 2
  before any UI is built on it. Fallback is the Agent SDK's `canUseTool`, which has no such cap —
  which is why the SDK stays documented here rather than deleted.
- **The stream-json shape is a looser contract than an npm package.** Owning the parser means owning
  it across CLI versions. Log and drop unrecognised event types rather than failing the session, and
  pin the agent to a tested `claude` version range in preflight.
- **The service environment is the silent killer.** A machine can look green when tested by hand and
  be broken under systemd, because `systemctl --user` sources no shell rc. AC-3 exists to catch
  exactly that, and it is the reason phase 1 leads with the unit rather than the feature.
- **A question can wait ten minutes for a human.** Every timeout between browser and agent must
  tolerate it — the socket, any proxy, and the MCP tool call itself.
- **Unlimited concurrency has no guard.** Two grills on one box are fine; a grill during a future
  build run is not, because the recon agent maps a tree being rewritten under it.
- **`plan.text` volume.** Deltas are frequent. Forward and drop; persisting each one turns a
  30-minute grill into a table nobody can read.
- **Orphan processes.** A `claude` process outliving its session holds a port and a credential.
  Cancel, agent shutdown and plan discard must all reap it.

## Decisions taken

_(populated during the build)_
