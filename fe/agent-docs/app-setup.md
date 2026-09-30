# App setup — root files, providers, build

There is no FSD `app` layer. Application setup is these files, and only these files may import from
any layer:

| File | Holds |
|---|---|
| `app/root.tsx` | `Layout` (HTML scaffold + PWA meta), `App` (providers + `<Outlet />`), `ErrorBoundary` |
| `app/routes.ts` | the route config (`routing.md`) |
| `app/entry.client.tsx` | hydration, service worker registration, notification-click wiring |
| `app/theme.ts` | the Mantine theme (`styling.md`) |
| `app/theme.css` | **generated** from `theme.ts` — never edit |
| `app/app.css` | layer order import, fonts, the few global element rules |
| `app/env.d.ts` | the typed `import.meta.env` (`VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`) |

## `root.tsx`

`root.tsx` is the only place app-wide providers are mounted, in this order:

```
QueryProvider → MantineProvider (theme, defaultColorScheme="dark")
             → ModalsProvider (modalProps centered) + <Notifications />
             → SessionProvider → <Outlet />
```

- **`QueryProvider`** is local to `root.tsx`: one `QueryClient` held in `useState`, defaults
  `staleTime: 60_000`, `refetchOnWindowFocus: false`, React Query Devtools in dev only.
- **`SessionProvider`** comes from `entities/session` — root files may import any layer.
- **`Layout`** is the HTML scaffold: viewport with `viewport-fit=cover` (so `env(safe-area-inset-*)`
  reports anything), theme-color and Apple web-app meta, the manifest and icons, and
  `<ColorSchemeScript defaultColorScheme="dark" />`. No business logic.
- **`ErrorBoundary`** is the fallback; a route may export its own.

Add a new app-wide provider here, not in a view. A provider that needs the signed-in user or the
active project — the socket providers, `ActiveProjectProvider` — goes in
`views/app-layout/app-layout.tsx` instead, where both are guaranteed.

## `entry.client.tsx`

Hydrates `<HydratedRouter />` under `StrictMode`, then registers `/sw.js`. The service worker
(`public/sw.js`) is **push-only** — no precaching, no offline shell. It holds no session, so a
notification click is handed back to the page (by `postMessage`, or a `readNotification` query param
on a freshly opened tab), which marks it read with an authenticated `apiClient` call. `vercel.json`
serves `sw.js` with `must-revalidate` so an update reaches installed copies.

The app is installable (`public/manifest.webmanifest`, standalone, portrait) — mobile layout is a
first-class target, see `styling.md` § Mobile.

## Build and tooling

- `vite.config.ts` — dev server **127.0.0.1:5373**; plugins: Tailwind, Babel with the **React
  Compiler** (`babel-plugin-react-compiler`), React Router, and `tailwind-preset-mantine`'s
  `mantineTheme` plugin, which writes `app/theme.css` from `app/theme.ts`. Source maps on.
- `react-router.config.ts` — `ssr: false`.
- `tsconfig.json` — strict plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`; `~/*` → `./app/*`.
- `vitest.config.ts` — `app/**/*.test.ts`, `environment: 'node'` (no DOM: component tests are not
  set up), same `~` alias.
- `.jscpd.json` — duplication gate for `pnpm dup` (min 50 tokens, threshold 5%, tests excluded).
- Git hooks live in `fe/.husky/` but guard the whole repo: `prepare` runs `husky fe/.husky` from
  the repo root, which sets `core.hooksPath`. `pre-commit` runs `lint-staged` → `eslint --fix` on
  staged `fe/` files; `pre-push` runs `pnpm typecheck` in `be/`, `fe/` and `agent/` (each one that
  has `node_modules`). Hooks run from the repo root, so every command `cd`s into its package first.
- Node `>=24.15`, pnpm 11.8.0.

## Global CSS

`app/app.css` imports `./theme.css` (which opens with
`@layer theme, base, mantine, components, utilities;` and pulls in Tailwind and Mantine's layered
styles), then `@mantine/notifications/styles.layer.css`, then the self-hosted Inter and JetBrains
Mono variable fonts. Drop the notifications stylesheet and toasts lose their fixed positioning. It
also defines `--mobile-nav-height` and `--app-content-height` (`styling.md` § Full-height screens).
It is not a place for component styles.
