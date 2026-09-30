# Standing acceptance criteria

Reusable AC blocks, one per surface type. A feature that builds a surface **inherits that surface's
block**, pasted into the plan's `## Acceptance criteria` with real `AC-n` ids.

**Paste, never reference.** "Shared list behaviour is inherited from #N and is not restated here" is
how a screen ships without the affordance everyone assumed it had. Nothing in `fe/app/shared/ui/` is
automatic — every affordance is an opt-in prop — so an AC that isn't written is a feature that isn't
built.

**Excluding a block, or a criterion inside one, is allowed and must be explicit:** record it under
`## Non-goals` with a reason. Silence is not exclusion.

Mark each inherited criterion with its block so a reader can tell it apart from feature-specific
work: `- [ ] **AC-12** (standing: list) — …`

---

## Block: any UI surface

Applies to every screen, panel, modal, drawer or step this feature adds.

- [ ] Loading, empty and error states each render a distinct, readable surface — never a blank
      region, a bare spinner with no context, or a silent failure.
- [ ] Every failure the user can cause is visible on screen — rendered in place, or raised as a
      notification naming what failed — never a silent no-op.
- [ ] A control the viewer's role cannot use (a **developer** where a **leader** is required) is not
      offered; the backend refuses it regardless.
- [ ] A change made elsewhere — another tab, another member, a machine — reaches this surface by push,
      without a reload.
- [ ] Every interactive control is reachable by keyboard, and focus is visible on it.
- [ ] Copy uses the product's terms — the same words the design plans and the rest of the app use for
      the same thing.

## Block: list / table screen

Any page or tab whose primary content is a list or table of records (machines, plans, members,
connections).

- [ ] The list fills the viewport: there is no dead space below the last row at 1280×720, and the
      page shows no horizontal scrollbar.
- [ ] Only the active project's rows are shown, and switching project replaces them without showing
      the previous project's rows in between.
- [ ] Every column marked sortable actually sorts — `aria-sort` flips and row order changes.
- [ ] A row's primary action is reachable from the row, and opening a row lands on that record.
- [ ] A record added or removed elsewhere appears in or disappears from the list without a reload.

## Block: board

Any surface that sorts records into state columns (the plans board).

- [ ] Every record sits in the column its current state names, and moves column by push when its
      state changes.
- [ ] Empty columns never leave dead gaps between populated ones.
- [ ] A waiting record says what it is waiting for.
- [ ] Drag-reordering, where offered, persists across a reload, and a drop that is not allowed is
      refused visibly rather than snapping back silently.

## Block: form

- [ ] Every validation rule fires on the field that caused it, with a message naming what to fix.
- [ ] Submit is blocked while the form is invalid, and the reason is visible without submitting.
- [ ] A failed submit preserves everything the user typed.
- [ ] Submitting twice quickly does not create two records.
- [ ] Leaving with unsaved changes warns, or the change is already persisted.
- [ ] A secret typed into the form (a token, an env value) is never shown back after it is saved.

## Block: multi-step flow / wizard

- [ ] Step order is fixed and the current step is visible at all times.
- [ ] Advancing is gated on the current step being complete, and the gate names what is missing.
- [ ] Going back preserves everything entered on the steps already passed.
- [ ] A step reached with incomplete upstream state redirects rather than rendering broken.
- [ ] The terminal state (done / failed) is a distinct screen, not a silent return to the start.

## Block: repeated-record list (non-table)

Setup-checklist steps, findings, criteria rows, decision rows, chat messages.

- [ ] Rows are grid-aligned — CSS subgrid, or one shared column template — so columns never drift
      with content width.
- [ ] Every cell is always rendered, even when empty, so rows stay aligned.
- [ ] Runaway values are capped and truncated rather than widening the row.
- [ ] Paired decision buttons have equal fixed widths.

## Block: machine-run work (planning session, build, onboarding, verify)

- [ ] The work's state is pushed to the browser as it changes, and the UI reflects each state it
      passes through up to a terminal one.
- [ ] A failed run shows the failure reason on screen, not only in the record or the machine's log.
- [ ] Closing the tab, or navigating away and returning, shows the work's current state rather than a
      stale one — the work lives on the machine, not in the page.
- [ ] Work that cannot be dispatched — no online machine, a paused machine, a missing credential —
      says so immediately instead of appearing to start.
- [ ] The queries the work affects are patched or invalidated when it finishes.

## Block: detail page

- [ ] The record's identity is visible without scrolling.
- [ ] Every tab renders with real data, including the ones the feature did not change.
- [ ] A record that cannot be loaded shows why, using the backend's message rather than a generic
      alert — and a record in another project answers as not found.
- [ ] Edits are persisted and survive a reload — including drafts, if the feature has them.
