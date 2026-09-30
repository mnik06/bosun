## Project Overview

**Bosun agent** — the daemon that runs on a remote machine and dials back to `be/`. A TypeScript CLI
(`commander`) that enrolls the machine, then holds one outbound WebSocket to the backend and runs AI
coding sessions (planning, execution, integration, onboarding, bugfix, quick-fix, ask, summary) in
the machine's own repository worktrees. The backend never initiates a connection: everything it
wants arrives as a frame on the socket this process opened.

It ships as a standalone binary (`bun build --compile`, linux x64/arm64) published as a GitHub
release `agent-v<version>`. The backend offers that build to machines on Refresh, so **every change
under `agent/` bumps the patch `version` in `package.json`** — CI skips the release for a version
that is already published, and an unbumped change never reaches a machine.

## Tech Stack

- **Node 24** + **TypeScript** (CommonJS target), `ts-node` in dev, `tsc` for `dist/`, `bun` for the
  release binaries
- **ws** for the connection, **commander** for the CLI, **Zod v4** for every frame and config file,
  **yaml** for the project config
- **Vitest** for tests, **pnpm** as the package manager (engine-strict)

## Architecture

```
index.ts (CLI) → commands/* → connection/socket.ts → connection/router.ts → <kind>/session.ts
                                                                          → services/*
```

- **`commands/`** — one file per CLI subcommand (`enroll`, `run`, `setup`, `auth`, `mcp`,
  `git-credential`). Thin: parse options, call services, exit
- **`connection/`** — the reconnect loop, heartbeats, frame parsing and routing. Read
  `connection/README.md` before touching it: the two termination paths are invariants
- **`<kind>/session.ts`** (`planning/`, `execution/`, `integration/`, `onboarding/`, `bugfix/`,
  `quick-fix/`, `ask/`, `summary/`) — one factory per session kind, owning its runs and the MCP tools
  it exposes to Claude (`<kind>/mcp/`). Shared run plumbing lives in `sessions/`
- **`services/`** — machine-side infrastructure (git worktrees, workspace, toolchain, stack, env,
  MCP config, upgrade, teardown), each a `*.service.ts` factory, wired in `services/index.ts`. Many
  carry a `<name>.service.md` engineering doc — read it before changing the service
- **`prompts/`** — the prompt text sent to Claude per session kind
- **Frame schemas** — `protocol.ts` and `*-frames.ts` at the root of `src/`

## General Rules

- **The wire contract is mirrored by hand.** `protocol.ts`, `*-frames.ts` and
  `project-config-{grammar,sections}.ts` have twins in `be/src/types/`; there is no shared package.
  A frame changed on one side is changed on the other in the same commit, and must stay readable by
  the previous agent version still running on machines that have not been refreshed
- **Every inbound frame is parsed with its Zod schema before it is acted on.** Log-and-drop what
  fails; never partially handle a frame
- **Secrets never leave the machine and are never logged.** The Claude credential and MCP tokens live
  in `~/.bosun/env` (mode `0600`); git credentials are minted per request by `git-credential`, never
  written to disk
- Relative imports only — the agent has no path alias
- A function with two or more parameters of the same type takes a single object param
- **No process runs as root.** Anything that needs elevation belongs in `be/assets/install.sh`,
  not in the agent

## Preflight

`pnpm preflight` runs `typecheck` → `lint:fix` → `test` → `dup` (jscpd) → `build`. **Run it before
you call any piece of work done**, and leave it green. CI runs it before every agent release.

Lint is the same **two-tier policy** as `be/`, documented at the top of `eslint.config.mjs`:
complexity rules (Tier 1) are never switched off for production code, size rules (Tier 2) are
exemptible per shape. Exemptions are granted exactly two ways — a glob in `eslint.config.mjs` with
the reason stated, or a one-off `// eslint-disable-next-line <rule> -- <reason>`.

## Testing

- **The test gate — no test is the default.** Before writing any unit test, answer three questions
  about the code under test. **(1) Can it break on its own?** — a branch, a boundary, ordering,
  parsing, a state transition, an async or error path, an invariant spanning two files. **(2) Is it
  fragile?** — many branches or edge cases, several callers, or rules a future reader would not infer
  from the code. **(3) Is a silent break critical?** — a credential path, a git operation that can
  lose work, the reconnect/teardown lifecycle, a frame the backend depends on. Write the test only
  when **(1) is yes AND (2) or (3) is yes**. Otherwise write none and say which question failed
- **Never weaken a test to make it pass.** A red test is a finding: fix the code, or explain why the
  expectation was wrong and change it deliberately
- Tests live beside the code as `<file>.test.ts`; shared fixtures in `src/test-support/`

## Engineering docs

When you create a module a reader cannot understand from the code alone — a reconnect protocol, a
session lifecycle, a git workflow with failure modes — write a `<module>.md` beside it, or a
`README.md` for a folder that only makes sense as a whole. Cover **why it is shaped this way, the
invariants that must hold, what breaks if you change them, how its failure modes surface, and what
was tried and rejected**. Never restate the API. Update the doc in the **same commit** as the change
that invalidates it.

## HARD RULES

- **NEVER LEAVE A COMMENT THAT NARRATES THE CODE** — no restating what a line plainly does, no section
  banners, no changelog or attribution notes, no commented-out code, no TODOs. The single exception: a
  short comment explaining WHY a non-obvious guard, invariant, or defensive check exists, when a
  reader could not recover that from the code alone
- **NEVER PUT ANY CO-AUTHORS WHEN COMMITTING CODE - DO IT LIKE THE ENGINEER WOULD DO IT BY THEMSELVES**
- **WHEN REPORTING INFORMATION TO ME, BE EXTREMELY CONCISE AND SACRIFICE GRAMMAR FOR THE SAKE OF CONCISION**
