# WORKSTREAM 16 — Phase 1: Mobile Shell Contract

> **Status:** Complete  
> **Date:** 2026-03-27  
> **Purpose:** Define the authoritative constraints for the mobile rebuild before any code is written. Phase 2 must comply with every rule in this document.

---

## 1. Viewport Zones

Four zones. No zone may overlap with another unless it is a designated overlay (see §3).

```
┌────────────────────────────────────────┐  ← 0
│  ZONE 1 — TOP NAV (.top-nav)           │  56px fixed, always visible
├────────────────────────────────────────┤
│  ZONE 2 — FILTER RAIL (.smart-dock)    │  collapsible, below top-nav
│  (hidden by default on phone, toggle)  │
├────────────────────────────────────────┤
│                                        │
│  ZONE 3 — WORKSPACE                    │  flex:1, overflow-y: auto
│  .inbox-sidebar  |  .reading-pane      │  only ONE child visible at a time
│  #gantt-panel    |  #deck-stage        │  controlled by shared router state
│                                        │
├────────────────────────────────────────┤
│  ZONE 4 — ACTION RAIL (#mobile-rail)   │  56px fixed, always visible on phone
│                                        │  safe-area-inset-bottom aware
└────────────────────────────────────────┘

OVERLAYS (position: fixed, above all zones):
  - .outbox-pane      z-index: 100010
  - .help-panel       z-index: 100021
  - filter sheet      z-index: 3500       (if filter rail becomes a sheet)
  - toast/notify      z-index: 100014
```

**Zone rules:**
- Zone 1 and Zone 4 are always visible. They never hide at any phone breakpoint.
- Zone 3 children are mutually exclusive. Only one workspace child is visible at a time via the shared router.
- Zone 2 collapses to a single icon row by default on phones (≤ 480px). One tap expands it.
- No DOM reparenting of any zone child is permitted.

---

## 2. Navigation Model

**One model. Shared router. CSS-driven active state.**

### The contract
- `switchWorkspaceView(mode)` in `_module_router.html` is the single source of truth for workspace transitions on all viewports.
- `mSwitchView()` is **deleted**. No mobile-only navigation function replaces it.
- The mobile action rail (`#mobile-rail`) is markup + CSS only for layout. Its buttons call `switchWorkspaceView()` directly.
- Active state on rail buttons is driven by body classes set by `syncWorkspaceModeState()` — not by JS inside the rail.

### Navigation destinations (5)

| Destination | `switchWorkspaceView()` arg | Body class when active |
|---|---|---|
| Queue (detail) | `'detail'` | _(no class, is default)_ |
| Grid | `'grid'` | `grid-mode-active` |
| Gantt | `'gantt'` | `gantt-view-active` |
| Deck | `'deck'` | `deck-mode-active` |
| Digest | `'digest'` | `digest-mode-active` |

> **Admin is not a navigation destination.** Admin (the review panel) is a panel overlay on top of the Queue/Detail workspace. It is opened via `setAdminPanelOpen(true)` in the existing shared admin flow — not via a nav tap.

### Admin on mobile — the contract
- Admin is opened via an action button in Zone 4 (or Zone 3 header area) that calls the existing `setAdminPanelOpen(true)`.
- The `.reading-pane` is **never reparented**. It stays in `#main-workspace` at all times.
- On phone, when admin is open, `.reading-pane` takes full screen width (CSS — not `display:none !important` overrides).
- Closing admin returns Zone 3 to its previous workspace child (CSS-driven via body class removal).

### Search/Filter on mobile — the contract
- One search input: `#filter-search` in the desktop `.smart-dock`. Always.
- On phone, Zone 2 is collapsed by default. The Zone 4 action rail has a filter icon that toggles Zone 2 open.
- Zero DOM cloning. Zero input mirroring. The same DOM node drives filters on all viewports.
- `#m-search-sheet`, `#m-search-input`, and filter mirroring (`m-wrap-filter-*`) are **deleted**.

---

## 3. Z-Index Layer Table

Authoritative. All future overlays must fit into this scale.

| Layer | Value | Occupant |
|---|---|---|
| workspace | 1 | `.inbox-sidebar`, `.reading-pane`, `#gantt-panel`, `#deck-stage` |
| mobile-rail | 4000 | `#mobile-rail` (new) |
| mobile-filter-sheet | 3500 | `.smart-dock` when promoted to full-height sheet on phone |
| mobile-sheet-scrim | 3490 | backdrop behind any mobile sheet |
| outbox-pane | 100010 | `.outbox-pane` |
| top-nav | 100015 | `.top-nav` |
| toast | 100014 | `.notification-toast` |
| help-overlay | 100020 | `.help-overlay` |
| help-panel | 100021 | `.help-panel` |
| deck-surfaces | 2000000 | `body.deck-mode-active` deck UI |
| deck-fab | 2000011 | `body.deck-mode-active .admin-dock` FAB |

**Dead layers to remove after Phase 2:**
- `#m-bottom-nav` and its styles (currently sits at a WS12 ad-hoc z value)
- `#m-admin-sheet`, `#m-menu-sheet`, `#m-search-sheet` (all WS12 sheets)
- `.mobile-outbox-overlay` z:290 and `.mobile-outbox-sheet` z:300 (pre-WS12 dead weight)

---

## 4. Pointer-Event Contract

Three invariants. No exceptions.

1. **Overlay containers default to `pointer-events: none`.** Only direct interactive children (buttons, inputs, scroll regions) are `pointer-events: auto`.
2. **No full-viewport hitbox may remain active after its associated panel is closed.** This was the bug in WS15 — `admin-dock` with `pointer-events: auto` after panel close. Prevent recurrence.
3. **The mobile action rail (`#mobile-rail`) has `pointer-events: auto` on buttons only** — not on the rail container itself.

---

## 5. Touch-First Interaction Rules

| Rule | Minimum |
|---|---|
| Tap target size | 44 × 44px on all interactive controls |
| Scroll behavior | `overscroll-behavior: contain` on scrollable children |
| Text input | Ensure no viewport zoom on focus (`font-size: 16px` minimum) |
| Active feedback | `:active` states must be visible (no hover-only affordances) |
| No hover dependency | Every action reachable via tap — no tooltip-only info |

---

## 6. Workspace Stacking Rules on Phone (≤ 480px)

```
Default (detail/queue view):
  .inbox-sidebar     → display: block, width: 100%, flex: 1
  .reading-pane      → display: none  (visible once item is selected)
  #gantt-panel       → display: none
  #deck-stage        → display: none

When reading-pane is open (item selected):
  .inbox-sidebar     → display: none  (or 40% if split mode — Phase 3 decision)
  .reading-pane      → display: flex, width: 100%, height: 100%

When admin open (body.admin-open .reading-pane):
  .reading-pane      → position: fixed, inset: 0  (stays in DOM — not reparented)
                       z-index: 3500, background: var(--card-bg)
  NO reparenting.

Gantt view (body.gantt-view-active):
  .inbox-sidebar, .reading-pane → display: none
  #gantt-panel       → display: flex, width: 100%/height: 100%

Deck view (body.deck-mode-active):
  [existing deck-mode-active rules take over — do not override]
```

---

## 7. New Markup Contract for `#mobile-rail`

The WS12 `#m-bottom-nav` is replaced by `#mobile-rail`. Contract:

- Exists in `WebApp.html` as a sibling to `#main-workspace`.
- Visible only at `max-width: 480px` (phone breakpoint). Hidden on tablet and desktop.
- 5 buttons: Queue, Grid, Gantt, Deck, Filter. All call shared router functions.
- Active class driven exclusively by body class selectors in CSS — no JS inside the rail.
- Rail button markup pattern:

```html
<nav id="mobile-rail" aria-label="Primary navigation">
  <button class="rail-btn" onclick="switchWorkspaceView('detail')" aria-label="Queue">
    <!-- icon -->
  </button>
  <button class="rail-btn" onclick="switchWorkspaceView('grid')" aria-label="Grid">
    <!-- icon -->
  </button>
  <button class="rail-btn" onclick="switchWorkspaceView('gantt')" aria-label="Gantt">
    <!-- icon -->
  </button>
  <button class="rail-btn" onclick="switchWorkspaceView('deck')" aria-label="Deck">
    <!-- icon -->
  </button>
  <button class="rail-btn rail-btn--filter" onclick="toggleMobileFilter()" aria-label="Filters">
    <!-- icon -->
  </button>
</nav>
```

Active state CSS (no JS needed):
```css
/* Default: none active */
.rail-btn { /* inactive styles */ }

/* Queue/detail: no body class = default state; mark queue btn active */
#mobile-rail .rail-btn:nth-child(1) { color: var(--accent); }
body.grid-mode-active  #mobile-rail .rail-btn:nth-child(1) { color: inherit; }
body.grid-mode-active  #mobile-rail .rail-btn:nth-child(2) { color: var(--accent); }
body.gantt-view-active #mobile-rail .rail-btn:nth-child(3) { color: var(--accent); }
body.deck-mode-active  #mobile-rail .rail-btn:nth-child(4) { color: var(--accent); }
/* Filter button active state driven by body.mobile-filter-open class */
body.mobile-filter-open #mobile-rail .rail-btn--filter { color: var(--accent); }
```

---

## 8. New Function Contract: `toggleMobileFilter()`

Replaces `mToggleSearch()`. Lives in `_module_webapp_core.html`.

```js
function toggleMobileFilter() {
    const isOpen = document.body.classList.toggle('mobile-filter-open');
    const dock = document.querySelector('.smart-dock');
    if (dock) dock.classList.toggle('mobile-filter-expanded', isOpen);
}
```

- Operates on the **existing** `.smart-dock` element — no new DOM.
- CSS handles the expand/collapse transition.
- `mobile-filter-open` body class drives the rail active state (§7).

---

## 9. Items Out of Scope for Phase 1

The following are **Phase 3–5 decisions** and must not be pre-solved here:

- Whether inbox/reading pane uses a split view on tablet
- Deck swipe navigation on mobile
- Gantt orientation strategy (landscape lock? fallback message?)
- Toast/notification positioning adjustment for rail gap
- Digest mobile experience

---

## Phase 1 Exit Criteria

- [ ] All five viewport zones are defined with exact CSS values.
- [ ] One navigation model is named; `switchWorkspaceView()` is the single router.
- [ ] Z-index table is complete and includes dead layers to remove.
- [ ] Pointer-event invariants are documented.
- [ ] Touch-first rules are documented.
- [ ] `#mobile-rail` markup and CSS active-state contract are defined.
- [ ] `toggleMobileFilter()` contract is defined.
- [ ] Admin panel mobile behavior is defined without DOM reparenting.
- [ ] Search/filter mobile behavior is defined without input mirroring.
