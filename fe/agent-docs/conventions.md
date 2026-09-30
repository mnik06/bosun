# Conventions

## Naming

| Kind | Convention | Example |
|---|---|---|
| Files | kebab-case | `machine-status-dot.tsx`, `plan.queries.ts` |
| Components | PascalCase, one exported per file, named after it | `MachineStatusDot` |
| Hooks | `use-<name>.ts` / `useName` | `use-create-plan.ts` → `useCreatePlan` |
| Query hooks | `use<Noun>Query` | `useMachinesQuery`, `usePlanQuery` |
| Fetchers | `fetch<Noun>` | `fetchMachine`, `fetchPlans` |
| Query-key factories | `<noun>Keys` | `machineKeys`, `needsYouKeys` |
| Zod schemas | `<Name>Schema`, type without the suffix | `MachineSchema` → `Machine` |
| Constants | SCREAMING_SNAKE_CASE | `UPGRADE_TIMEOUT_MS`, `BOARD_COLUMNS` |
| Route files | `<name>-page.tsx`, `<name>-layout.tsx` | `plans-page.tsx` |
| Feature triggers | `<verb>-button.tsx`, `-modal.tsx`, `-menu-item.tsx`, `-switch.tsx` | `delete-menu-item.tsx` |

Entity folders are the singular noun; feature folders are the verb; widget folders are the block.

## Params

**Object params over positional** when two or more params share a type — the codebase takes an
`opts` object almost everywhere a function has more than one argument:

```ts
// BAD
const linkMachineToUser = (machineId: string, userId: string) => {}
// GOOD
const linkMachineToUser = (opts: { machineId: string, userId: string }) => {}
```

## Exports

- **Named exports everywhere**, except route files, which React Router requires as a default export.
- Barrels re-export explicit names only; no `export *`.

## Imports

- `~/` alias for everything, including between files of the same slice; cross-slice only through the
  slice's `index.ts` (enforced — see `architecture.md`).
- **Types are imported as types, inline**: `import { MachineSchema, type Machine } from …` —
  `@typescript-eslint/consistent-type-imports` with `inline-type-imports` enforces it, and
  `verbatimModuleSyntax` requires it.
- Order: external packages, blank line, `~/` imports, blank line, relative (`./+types/…`).

## TypeScript

- **`any` is banned outright**, explicit or inferred. Use `unknown` plus a Zod parse at the
  boundary.
- tsconfig is strict plus `noUncheckedIndexedAccess` (index access is `T | undefined`),
  `exactOptionalPropertyTypes` (pass `{}` rather than `{ prop: undefined }` — see how
  `QueryErrorAlert` spreads `variant`), and `noPropertyAccessFromIndexSignature`.
- Catch variables are `unknown`; `onError: (error: unknown) => …`.
- Exhaustive `switch` over a union is enforced (`switch-exhaustiveness-check`).

## Formatting

Enforced by ESLint, not by opinion — run `pnpm lint:fix` rather than hand-formatting: tabs, single
quotes, no semicolons, no trailing commas, a space before function parens (`function Foo ()`), a
blank line before `return` and between a `const` and a following `if`, conditional JSX only as a
ternary (`cond ? <X /> : null`, never `cond && <X />`).

## React

- The **React Compiler** is on (Babel plugin) — don't add `useMemo`/`useCallback` for render
  performance alone; keep them where identity is semantic (a context value, an effect dependency).
- `react-hooks` rules are enforced. Resetting state when a prop changes is done **during render**
  (compare and `setState`), not in an effect — see `entities/plan/model/plan-stream.md`.
- A subscription effect reads changing state through a ref rather than depending on it, so the
  subscription is not torn down on every update (`machines-socket.tsx`).

## State

- **Server state → React Query.** Never copy server data into `useState`.
- **Pushed ephemeral state** (activity labels, upgrade progress) → the socket provider's context
  (`realtime.md`).
- **Session / active project** → `useSession()`, `useActiveProject()`.
- **Form state → Mantine Form** in the feature's modal.
- **Local UI state → `useState`**, `useDisclosure` for open/close.
- **Deep-linkable state** is *seeded* from search params, not bound to them: `plan-page.tsx` starts
  its tab from `?tab=` so a link can open it, then keeps it in `useState` because a tab click has
  no business in the history stack.
- No global client store (Zustand, Redux). Raise it before introducing one.

## Tests

- Vitest, `app/**/*.test.ts`, beside the code as `<file>.test.ts`, Node environment — tests cover
  pure `lib/` functions (derivations, parsers, cache-independent logic). There is no DOM test setup.
- Write one only when the test gate in `CLAUDE.md` says so.
