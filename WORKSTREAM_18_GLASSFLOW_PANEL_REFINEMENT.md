# WORKSTREAM 18 — GlassFlow Panel-by-Panel Refinement

> **Status:** Workstream Complete — High-Performance Mobile Shell Finalized
> **Started:** 2026-03-28
> **Completed:** 2026-03-29
> **Philosophy:** "Contextual dock, creative interior. One panel at a time to completion before moving on."

---

## Agent Pre-Flight

### Files In Scope
- `src/v2_shell_GlassFlow.html` — the only file you edit. Everything lives here.
- `src/_styles_panels.html` — read-only reference for SF sheet styles
- `src/_module_queue_state.html` — read-only reference for `activeFilters` shape

### DO NOT TOUCH (Shared Brain)
These are read-only from the shell. Never edit them for WS18 work:
- `_state_*.html` — state contracts
- `_module_*.html` — shared logic modules
- `WebApp.html` — desktop shell (different routing path)
- `_styles_*.html` — shared style files

### How GlassFlow Loads
GlassFlow is routed via `02_Utilities.js` `doGet()` mobile shell table: `'GlassFlow': 'v2_shell_GlassFlow'`.
Phone users entering `WebApp` are auto-routed into `?v=GlassFlow` by an early redirect in `src/WebApp.html`.
Desktop override: add `?shell=desktop` to stay in the shared shell intentionally.
Test URL: `[headUrl]?v=GlassFlow`

---

## Contextual Dock Contract (Architectural Foundation)

This is the core WS18 decision. Read before touching dock code.

### The System
The dock has 3–4 slots. Slot content changes based on active panel context. Context is signaled via CSS body classes:

| Body Class | Context | Dock Slot Set |
|---|---|---|
| *(none)* | Queue (default) | Queue (home) + Admin |
| `mobile-detail-open` | Detail Card | Back + Skip + Commit + AI |
| `mobile-admin-open` | Admin | Admin + Reviewed + Activity + Close |
| `mobile-gantt-open` | Gantt | Out + In + Today + Filter |

### CSS Class Naming for Dock Buttons
```
.dock-ctx-queue    — visible in queue context (default)
.dock-ctx-detail   — visible in detail context
.dock-ctx-admin    — visible in admin context (P3)
.dock-ctx-gantt    — visible in gantt context (P4)
```

### CSS Toggle Rule Pattern
```css
/* Context X is hidden by default */
.dock-ctx-[x] { display: none; }

/* Context X shown when body has its class */
body.[x-class] .dock-ctx-queue { display: none; }
body.[x-class] .dock-ctx-[x] { display: flex; }
```

### Dock Pulse Animation
On every context switch, trigger `.ctx-switching` on the dock nav. This fires a brief scale-pulse (0.22s) that makes the button swap feel intentional rather than abrupt. The JS helper `pulseDockContext()` handles this.

### Filter Badge Sync
`syncGlassFlowFilterBadge()` reads `window.activeFilters` (set by `_module_queue_state.html`) and `window.searchTerm`, counts total active filters, and updates `#dock-filters-badge`. It is:
- Called on every `applyFilters()` invocation (hooked)
- Called on every `clearAllFilters()` invocation (hooked)
- Called from `syncMobileDockContext()`

---

## Panel-by-Panel Plan

### Phase 1 — Queue + Contextual Dock Foundation ✅
**Goal:** Establish the dock context-switching pattern. Queue context is the default state.

- [x] Contextual dock CSS system (`.dock-ctx-*` classes, body class toggles)
- [x] Dock pulse animation on context switch (`dock-ctx-pulse` keyframe + `.ctx-switching`)
- [x] Queue context dock: Queue (home) + Filters (with active filter badge) + Admin (with badge)
- [x] Detail context scaffold (Back + Admin + Sync — P2 will replace with action buttons)
- [x] `syncGlassFlowFilterBadge()` — reads `activeFilters`, updates `#dock-filters-badge`
- [x] Hook `applyFilters` and `clearAllFilters` to call filter badge sync
- [x] Updated `syncMobileDockContext()` — handles renamed `dock-btn-admin` ID, calls filter badge sync

---

### Phase 2 — Detail Card + Contextual Dock ✅
**Goal:** Move Commit/Skip/AI Draft into the dock when in detail view. Tighten the detail card hero.

- [x] Detail dock actions: Back + Skip + Commit (primary, accented) + AI Draft
- [x] Remove inline Commit/Skip buttons from the detail scroll (they'll live in the dock)
- [x] Hero hierarchy: FDH ID, Status pill, Target Date — all above fold before any scroll
- [x] `syncDetailDockState()` — disable Commit button if no note written; re-enable on textarea input
- [x] Dock Commit button pulse/confirm animation on tap
- [x] Lower-half visual system signoff: notes/thread, network path, and deliverables/distributed composition
- [x] Final mobile visual coherence pass against latest screenshots

---

### Phase 3 — Admin Panel + Contextual Dock ✅
**Goal:** Admin panel gets its own dock context when the sheet is open.

- [x] Add `mobile-admin-open` body class on admin panel open/close
- [x] Admin context dock: Tab switcher (Admin / Reviewed / Activity as dock buttons) + Close
- [x] Admin panel header simplification — just drag handle + title
- [x] KPI strip polish (Crossings / QB Status / BOMs cards)
- [x] Standardization of card styles (`.ob-card`, `.log-card`) with 20px radius

---

### Phase 4 — Gantt + Contextual Dock ✅
**Goal:** Horizontally locked full-screen Gantt panel with contextual controls.

- [x] Add `mobile-gantt-open` body class when Gantt is active
- [x] Gantt opens as a full-screen overlay (landscape-locked)
- [x] Gantt dock context: Zoom Out + Zoom In + Jump to Today + Filter
- [x] Floating "Purple Hint Pill" in bottom-right with text cycling logic
- [x] Focused Mode integration (tap project to isolate row)
- [x] "Rotate for details" interaction wiring

---

### Phase 5 — Filters & Search Unification ✅
**Goal:** Consistent filter/search entry via Unified FAB. Clean SF sheet layout.

- [x] Unified FAB as primary entry point (adaptive positioning: top-right in Gantt, bottom-right elsewhere)
- [x] SF sheet: Narrow width (320px) in Gantt mode anchored to right
- [x] "Executive Glass" premium styling for Dock and SF Sheet (Frosted glass + Saturate)
- [x] SF sheet: Group By selector integrated at top
- [x] Multi-select dropdowns fixed and functional in mobile SF sheet
- [x] Search auto-focuses and features "✕" clear button
- [x] `clearAllFilters()` correctly resets all search/filter states

---

### Phase 6: Dock Cleanup & Synchronization (Complete)
**Goal:** Dial in dock behavior for maximum flexibility and flawless contextual transitions.

- [x] Remove redundant Gantt floating controls (redundant with Phase 4 dock integration).
- [x] Consolidate multiple filter badge IDs into a single source-of-truth logic.
- [x] Implement **Breathing Dock**: width adjusts to button count (auto-width).
- [x] Remove redundant Queue button while in Queue context.
- [x] Standardize **Executive Glass** (24px blur, 180% saturation) across all panels.
- [x] Harden contextual synchronization and state mirroring logic.

---

## File Change Log

| Phase | Date | Change Summary |
|---|---|---|
| P1 | 2026-03-28 | Signed off. Queue shell refined to desktop parity. |
| P2 | 2026-03-28 | Detail dock finalized. Commit/Skip/AI migrated to dock. |
| P3 | 2026-03-29 | Admin Hub refined. KPIs polished. Tab switcher added to dock. |
| P4 | 2026-03-29 | Gantt mobile optimized. Landscape lockdown, Focus mode, and floating hint pill added. |
| P5 | 2026-03-29 | Search & Filter unified. Executive Glass styling applied. Narrow Gantt card and fixed dropdowns. |
| P6 | 2026-03-29 | Dock Cleanup & Breathing width. Executive Glass standardized across all premium panels. |


---

## Smoke Test Checklist (Per Phase)

After each phase, verify on mobile viewport (≤480px):
- [x] App loads without console errors
- [x] Dock shows correct buttons for queue context
- [x] Context switch triggers dock pulse for all context transitions
- [x] Filter badge increments when filters applied, clears on clear-all
- [x] Gantt mode triggers landscape orientation hint and focus mode
- [x] SF Sheet dropdowns open/close correctly and filter data
---

### Phase 7: Review Hub Rework (Upcoming)
**Goal:** Fix scrolling issues and optimize the layout for the Review Hub panel.

- [ ] Diagnose and fix scrolling blockage in `#admin-pane-content` and `#outbox-list`
- [ ] Rework KPI strip for better interaction and visual hierarchy
- [ ] Standardize card layouts within the hub
- [ ] Ensure swipe-to-dismiss consistency across all sheets
- [ ] Refine notification badge shape and placement (iOS-style pill)
