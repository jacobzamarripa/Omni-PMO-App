# WORKSTREAM 19 — Review Hub Reimagination

> **Status:** Active — polish pass pending
> **Philosophy:** "Ground-up redesign. High tactile density. Mobile-native interaction."

## 🎯 The Vision
The Review Hub needs a radical departure from the "floating card" layout. It should feel like a dedicated "Station" within the app, utilizing full-screen real estate or highly-integrated sliding surfaces that don't feel detached from the shell.

---

## 🛠️ Current State

### Completed
- [x] Reworked Admin, Reviewed, and Activity internals inside the existing GlassFlow Review Hub sheet.
- [x] Preserved the existing slide-up container and existing admin dock as the controlling frame.
- [x] Restored dock-owned tab switching (`Admin`, `Reviewed`, `Activity`, `Close`) as the primary navigation model.
- [x] Hub surface changed from glassy/translucent to solid `var(--card-bg)` to match queue and detail card surfaces.
- [x] Header restructured: title/count left-anchored, KPI filter chips right-aligned, 3-row chip layout (icon → label → number).
- [x] Persistent crossings tray removed from header; crossings now render inline as first section in Admin scroll list.
- [x] Sticky section sub-headers in Admin tab (pin under hub header as you reach each section).
- [x] Scroll area horizontal padding tightened (`18px → 8px`) for maximum content width.
- [x] Dock notification badges: per-tab colors (red/green/purple), corner-anchored with border punch-out.
- [x] Admin FAB badge: white text.

### Do Not Reopen
- [x] Do not replace the existing bottom-anchored Review Hub container.
- [x] Do not replace the existing dock with a new tab/header system.
- [x] Keep scope on the active GlassFlow shell only unless a future workstream explicitly expands it.
- [x] Do not restore the persistent crossings pinned tray — crossings are now inline.

## 🛠️ Implementation Plan

### Phase 1 — Spatial Refactoring ✓
- [x] Refactor `.outbox-pane` geometry to remain a bottom-anchored slide-up station with native-feeling momentum.
- [x] Fix the masking/padding issues where scrollable content feels "cut off" or detached from its container.
- [x] Surface changed to opaque `var(--card-bg)` to match the queue and detail card language.

### Phase 2 — Admin Hub (Re-reimagined) ✓
- [x] **Header Integration:** KPI filter chips in header, title left, chips right.
- [x] **Icon Restoration:** All filters have SVG icons; 3-row chip layout (icon, label, count).
- [x] **Crossings Inline:** Crossings to Verify is the first section in the Admin scroll list with sticky header and Commit Staged action.
- [x] **Card Design:** Dense list-oriented approach with actionable rows.

### Phase 3 — Reviewed Hub (Visual Distinction) ✓
- [x] Implement high-contrast, labeled sections for "Staged for Export" and "Finalized Reviews".
- [x] Add action strips to section headers (Batch Export, Clear All) to reduce vertical clutter within the list.
- [x] Use visual cues (accents, labels) to distinguish staged items from finalized reviews.

### Phase 4 — Activity Hub (Extreme Compaction) ✓
- [x] Transition from cards to a dense feed-style view.
- [x] Remove redundant "Go to Project" buttons in favor of a compact row-level navigation affordance.
- [x] Use iconography to represent event types (Updates, Syncs, Flags) instead of text labels.
- [x] Implement a two-line summary limit with tap-to-expand logic for long change values.

### Phase 5 — Native-Language Polish & Validation ✓ (structural complete, visual polish pending)
- [x] Spacing, typography, section weight tuned.
- [x] Visual mismatch between Review Hub and GlassFlow language resolved.
- [x] Dock badges color-matched to desktop and corner-anchored.
- [ ] **Live visual polish pass** — minor refinements identified in testing, needs a fresh agent with a live view.

---

## 🎨 Remaining Polish Items (Next Agent Resume Point)

> **Constraint:** Do NOT reopen architecture. These are visual micro-adjustments only.
> **Approach:** Load the app, open the Review Hub, and do a pass against each item below.

- [ ] KPI chip sizing/proportion — verify the 3-row chips read cleanly at real device width; adjust `min-height`, `padding`, or `font-size` if any chip feels cramped or oversized after seeing it live.
- [ ] Section card `border-radius` / `border` on Admin sections — with `overflow: visible` enabled for sticky headers, verify the card corners render correctly and the sticky header background doesn't create a seam at scroll boundaries. May need a subtle `box-shadow` inset or adjusted border treatment.
- [ ] Sticky section header background — confirm `background: var(--card-bg)` on the sticky header looks clean in both light and dark mode (no banding or ghost lines at the snap point).
- [ ] Activity filter bar — confirm `padding: 10px 18px` aligns the search input and selects correctly relative to the list rows below on narrow screens.
- [ ] Dock badge sizing — verify the 14px min-width badge with 2px border punch-out doesn't feel too small or large against the dock button at real device DPI.
- [ ] Overall visual rhythm check — scan all three tabs (Admin, Reviewed, Activity) with real data and flag any line heights, color weights, or spacing that feels off relative to the queue panel.

---

## 📋 Smoke Test Checklist
- [ ] Entire Hub surface feels like a native part of the GlassFlow shell.
- [ ] No masking artifacts or whitespace gaps at the edges.
- [ ] Tabs switch instantly with tactile feedback.
- [ ] Activity feed is legible even with 100+ entries.
- [ ] Swipe-to-dismiss is consistent across the entire Hub station.
- [ ] All three dock badge colors (red/green/purple) visible and corner-anchored.
- [ ] Admin FAB badge shows white text on red.

## 🔄 Handoff Notes
- Resume with the **Remaining Polish Items** section above. These are CSS-only micro-fixes.
- All architecture decisions are locked. Do not modify module structure, state wiring, or dock layout.
- Files most likely to be touched in the polish pass: `_styles_glassflow_core.html` only.
- Test in both light and dark mode.
- Run `node scripts/validate-mobile-shell.js` after any changes to confirm no regressions.
