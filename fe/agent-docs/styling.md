# Styling

Mantine v9 components are the building blocks; Tailwind v4 does layout and spacing around them.
`tailwind-preset-mantine` generates `app/theme.css` from `app/theme.ts`, so Tailwind utilities and
Mantine share one set of tokens (colors, spacing, breakpoints, fonts). Icons are `lucide-react`,
sized with its `size` prop.

## The tools, in order

1. **A Mantine prop** — check whether the component already has one (`size`, `variant`, `color`,
   `c`, `fw`, `gap`, `withBorder`, `leftSection`).
2. **A Tailwind utility** in `className` — layout, sizing, positioning, one-off spacing. Mantine CSS
   variables are reachable as arbitrary values when no utility exists:
   `border-[var(--mantine-color-default-border)]`, `bg-[var(--mantine-color-body)]`.
3. **A Mantine `style` prop** — last. There are no `style={{}}` objects in the codebase and no CSS
   modules; keep it that way unless a value is genuinely dynamic.

Conditional classes use `clsx` (`import clsx from 'clsx'`); there is no `cn`/`tailwind-merge`
helper.

Mantine layout primitives (`Stack`, `Group`, `Center`, `Container`, `Paper`) are used freely —
they are the dominant layout tool in this codebase and take theme spacing directly. Mix in Tailwind
where Mantine has no prop for it.

## Tokens

- `app/theme.ts` is the source of design tokens: `primaryColor: 'blue'`, `autoContrast`,
  `defaultRadius: 'md'`, the fonts (`--font-sans` Inter, `--font-mono` JetBrains Mono, declared in
  `app.css`), and a custom `dark` ramp pulled darker than Mantine's stock so the page is near-black
  and cards separate by shade alone.
- `app/theme.css` is **generated** by the Vite plugin — never edit it.
- Promote a value that recurs to a token in `app/theme.ts` (or a CSS variable in `app.css` for
  shell geometry) before inlining it a third time.
- No hex, `rgb()` or named CSS colors in slice code. Raw color values live only in `theme.ts`,
  `root.tsx`'s `theme-color` meta and the web manifest.

## Color

The app renders in the **dark** scheme (`defaultColorScheme="dark"` on `MantineProvider` and
`ColorSchemeScript`); there is no scheme toggle. Colors come from Mantine's stock palette by name,
used semantically and consistently:

| Meaning | Color |
|---|---|
| failure, destructive action, error alert | `red` |
| success | `green` / `teal` |
| warning, "needs attention" | `yellow` / `orange` |
| info, primary action | `blue` (the primary color — omit `color` to get it) |
| neutral, pending, disabled | `gray` |
| secondary text | `c="dimmed"` |

Match an existing use before picking a color for a new status — grep for the status's other badges.

## Feedback: toasts vs. inline

- **The outcome of something the user just did** is a Mantine notification (`<Notifications />` is
  mounted in `root.tsx`). Failures go through `notifyError({ title, error })`; a success or info
  toast is `notifications.show({ color: 'green' | 'blue', title, message })`.
- **Standing state** — a failed query, an empty list, a blocked step, a machine that is offline —
  renders inline: `QueryErrorAlert`, `Alert`, or dimmed `Text`. The test: would it still make sense
  five minutes later? Then it is inline.
- Destructive actions confirm first through `confirmAction` (`~/shared/lib`).

## Forms and controls

Always Mantine inputs — never a raw `<input>`, `<textarea>` or `<button>`. Every modal is
`AppModal` from `~/shared/ui` (full-screen below `sm`), never Mantine `Modal` directly. Submit
buttons take `loading={mutation.isPending}`.

## Mobile

The app is an installable PWA and is used on phones. Every screen must work below `sm` (48em):

- The shell swaps the side rail for a fixed bottom bar (`MobileNav`); `AppShell.Main` pays for it in
  bottom padding including `env(safe-area-inset-bottom)`.
- `app.css` forces form fields to ≥16px below `sm` (Safari zooms otherwise) and gives
  `ActionIcon`/`Button`/`NavLink` a 36px minimum touch target. Don't override either at a call site.
- Write base styles for mobile and layer `sm:` / `md:` for larger viewports; use `useMediaQuery`
  only when the component tree itself must change.

## Full-height screens

A screen that fills the viewport and scrolls internally (plan detail, plan draft) sizes itself with
`h-[var(--app-content-height)] min-h-0 flex flex-col overflow-hidden`. `--app-content-height` is set
on `.app-shell` in `app.css`, the one place that knows the header, padding, bottom bar and safe area
it has to subtract. Don't recompute that height in a component.
