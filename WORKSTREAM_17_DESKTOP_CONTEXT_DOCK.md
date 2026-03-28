# WORKSTREAM 17 — Desktop Context Dock

> **Status:** Proposed
> **Date:** 2026-03-28
> **Origin:** Desktop follow-on from WS16 contextual dock exploration
> **Philosophy:** Shrink the dock, not the capability.

---

## 1. Core Mandate

Extend the established dock language on desktop without drifting into a separate product style.

The current smart-dock is visually correct, but operationally too wide. The always-expanded filter controls create horizontal collisions with desktop chrome and trigger dock clearance logic earlier than necessary. The goal of this workstream is to preserve the existing glass capsule, motion, and contextual behavior while reducing its resting footprint.

This is not a desktop redesign. It is a dock composition refactor.

---

## 2. Design Guardrails

### Must Keep

- Existing smart-dock shell language: centered glass capsule, blur, border, radius, and current motion family
- Existing active filter pills as the persistent state indicator below the dock
- Existing view-aware behavior for Detail, Grid, Deck, and Gantt modes
- Existing filter logic, grouping logic, and queue/search pipeline

### Must Change

- The raw filter controls should no longer remain permanently expanded in the default desktop dock state
- The dock needs a compact resting state with a smaller horizontal footprint
- Filter access should move behind a dock-mounted launcher that opens a contextual secondary surface

### Must Avoid

- No visual drift away from the established desktop language
- No free-floating desktop action bubbles scattered across the workspace
- No duplicate filter runtime or forked desktop/mobile filter state
- No desktop regressions caused by dock width, pill overlap, outbox overlap, or Gantt inversion

---

## 3. Recommended Interaction Model

### Context Dock v1

The desktop dock becomes a two-tier system:

1. **Tier 1: Compact Dock Rail**
   - Always visible inside the current smart-dock shell
   - Contains only high-frequency controls:
     - Search
     - Filters launcher
     - Group launcher or compact selector
     - One mode-aware contextual slot

2. **Tier 2: Anchored Context Panel**
   - Opens from the Filters launcher
   - Houses the existing multi-select filters and related controls
   - Inherits the same glass/material language as the dock
   - Closes back to the compact dock without losing filter state visibility

This keeps the dock premium and contextual without turning desktop into a mobile FAB clone.

---

## 4. Success Criteria

- Default dock width is materially smaller than the current always-expanded state
- Active filter state remains legible without opening the filter panel
- Detail, Grid, Deck, and Gantt all retain their mode-specific dock behaviors
- The dock no longer causes avoidable horizontal compression against nav, sidebar, or admin surfaces
- Filter access remains one interaction away, not buried
- The experiment feels like an evolution of the current shell, not a new product language

---

## 5. High-Risk States To Validate

- Detail mode with admin panel open
- Grid mode with pivot controls visible
- Deck/detail face toggle state
- Gantt mode with bottom-dock inversion
- Desktop widths where the current dock activates clearance logic
- Active filters + group-by + clear state all visible together

---

## 6. Phase Plan

### Phase 0 — Research + Desktop Direction
- [x] Audit the current desktop dock structure, zones, and supporting layout logic
- [x] Audit the existing contextual dock language introduced during WS16 mobile exploration
- [x] Define the recommended desktop translation: compact dock rail + anchored context panel
- [x] Capture guardrails so the experiment does not stray from the current desktop design language

### Phase 1 — Dock Contract + Surface Design
- [x] Define the default compact desktop dock inventory
- [x] Define which controls remain always visible vs. move behind the Filters launcher
- [x] Define the anchored filter panel geometry, open/close behavior, and visual treatment
- [x] Define the contextual slot behavior for Detail, Grid, Deck, and Gantt
- [x] Define clear rules for active badges, active counts, and clear-all visibility

#### Phase 1 Output — Desktop Context Dock Contract

### A. Compact Dock Inventory (Default Resting State)

Always visible in the compact rail:

1. Search input (existing search behavior retained)
2. Filters launcher (primary compact action, badge-capable)
3. Group control (compact selector or launcher)
4. Context slot (single mode-aware slot)
5. Clear control (visible only when filters/group are active)

Moved behind the Filters launcher panel:

1. Severity filter multi-select
2. Vendor filter multi-select
3. City filter multi-select
4. OFS filter multi-select
5. Status filter multi-select
6. Optional secondary controls currently co-located with filter cluster

Always external to compact rail:

1. Active filter pills strip remains persistent below the dock

### B. Dock State Matrix By Workspace Mode

Detail mode:

1. Compact rail visible
2. Context slot maps to detail-focused action cluster (slide/detail face or equivalent primary detail action)
3. Filters launcher available

Grid mode:

1. Compact rail visible
2. Context slot maps to grid pivot access
3. Filters launcher available

Deck mode:

1. Compact rail visible
2. Context slot maps to deck face/action behavior
3. Filters launcher available

Gantt mode:

1. Compact rail remains mode-aware and preserves existing bottom-placement choreography
2. Context slot maps to gantt sort and exit control path
3. Filters launcher available unless explicitly suppressed by gantt-only full-focus state

### C. Filters Launcher And Anchored Panel Contract

Panel anchor and placement:

1. Panel opens from Filters launcher inside the smart-dock
2. Panel is visually attached to the dock, not detached floating chrome
3. Panel can flip position as needed to avoid viewport clipping, while preserving visual attachment

Panel behavior:

1. Toggle open/close from Filters launcher
2. Close on outside click
3. Close on Escape
4. Preserve current filter selections on close
5. Do not clear filters unless user explicitly triggers clear

Panel visual treatment:

1. Same material family as current dock (glass surface, border, blur, and depth)
2. Matching interaction timing with existing desktop transitions (150ms to 200ms)
3. No visual language drift into separate component theme

### D. Badge, Count, And Clear Rules

Filters launcher badge:

1. Show active filter count when count is greater than zero
2. Hide badge when count equals zero

Group state:

1. Group control shows active state when value is not none

Clear control visibility:

1. Clear appears only when any of the following are active:
2. One or more filters selected
3. Group-by not none
4. Stage or admin-derived queue filters active

Active pills behavior:

1. Pills remain source-of-truth visual summary of active filters and group state
2. Pills must not require filter panel to remain open

### E. Accessibility And Input Contract

1. Launcher and compact controls preserve visible focus state
2. Panel controls remain keyboard reachable in logical order
3. Escape closes panel and returns focus to Filters launcher
4. Icon-only controls require text labels or aria labels

### F. Phase 1 Acceptance Checks

1. Desktop dock inventory is finalized and unambiguous
2. Visibility split between compact rail and filter panel is finalized
3. Mode matrix for Detail, Grid, Deck, and Gantt is finalized
4. Filters panel open/close contract is finalized
5. Badge/count/clear behavior is finalized
6. Phase 2 implementation can proceed without unresolved UX decisions

### Phase 2 — Markup Refactor
- [ ] Refactor the desktop dock markup to support a compact primary rail
- [ ] Add the anchored desktop filter panel container without breaking the current shared filter DOM contract
- [ ] Preserve active filter pills as a separate persistent state layer
- [ ] Ensure the compact dock can still host mode-specific controls cleanly

### Phase 3 — Interaction Wiring
- [ ] Add launcher open/close behavior for the desktop filter panel
- [ ] Wire panel state to existing filter logic without duplicating state ownership
- [ ] Keep group-by and clear interactions synchronized with the compact dock state
- [ ] Ensure focus management and outside-click dismissal behave correctly
- [ ] Keep keyboard accessibility and visible focus states intact

### Phase 4 — Contextual Choreography
- [ ] Detail mode: refine which actions remain visible in the compact rail
- [ ] Grid mode: preserve pivot access without restoring full dock width
- [ ] Deck mode: preserve slide/detail face switching behavior
- [ ] Gantt mode: preserve bottom placement and exit controls
- [ ] Ensure the compact dock remains visually coherent across all workspace modes

### Phase 5 — Collision Hardening
- [ ] Re-run dock clearance behavior against compact and expanded states
- [ ] Verify active filter pills do not collide with the dock or top nav
- [ ] Verify outbox/admin panel open state does not break compact dock spacing
- [ ] Verify wide and narrow desktop widths still maintain usable dock geometry
- [ ] Remove any temporary fallback rules introduced during prototyping

### Phase 6 — Final Polish + Signoff
- [ ] Add final active-count and badge polish to the Filters launcher
- [ ] Align hover, press, and transition timing with the existing desktop motion language
- [ ] Perform desktop smoke validation across Detail, Grid, Deck, and Gantt
- [ ] Update PRD and AGENT_LOG with completion state and validation results

---

## 7. Likely File Surface

- `src/WebApp.html`
- `src/_styles_ui_core.html`
- `src/_styles_layout.html`
- `src/_module_router.html`
- `src/_module_webapp_core.html`
- `src/_module_queue_state.html`

These are the likely edit surfaces. The intent is still a smallest-possible change that preserves the existing shared runtime.

---

## 8. Non-Goals

- Full desktop shell redesign
- Replacing the smart-dock with a sidebar-only filter model
- Reworking the underlying filter logic or queue state contract
- Porting mobile dock visuals directly onto desktop
- Any desktop-wide color, typography, or brand refresh