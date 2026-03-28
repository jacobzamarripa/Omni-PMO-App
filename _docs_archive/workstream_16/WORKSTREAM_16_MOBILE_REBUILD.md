# WORKSTREAM 16 — Mobile Architecture Rebuild

## Objective

Replace the current breakpoint-heavy mobile layer with a mobile-first shell contract that uses shared primitives, one navigation model, and bounded overlays.

## Core Position

- Salvage shared infrastructure that already improves all viewports.
- Delete mobile-only code paths that compete with the main application shell.
- Rebuild mobile around the same state and workspace contract used by desktop.

## Salvage

- Shared state ownership and routing contract in `src/_state_*.html` and `src/_module_router.html`
- Viewport meta handling in `src/02_Utilities.js`
- Useful touch/coarse-pointer detection in `src/_module_webapp_core.html`
- Any responsive tokens in `src/_styles_base.html` that remain valid after audit
- Shared renderers that are not coupled to mobile-only DOM structures

## Delete Or Replace

- `src/_module_mobile_nav.html`
- WS12 mobile bottom-nav / bottom-sheet markup in `src/WebApp.html`
- Duplicate mobile hamburger flow if the rebuilt shell owns actions directly
- Mobile-only search/admin sheet orchestration that bypasses shared panel state
- Breakpoint overrides that exist only to counteract earlier mobile overrides

## Phase Plan

### Phase 0 — Audit + Salvage Map

- Inventory every mobile-only selector, module, and DOM block
- Classify each item as salvage, replace, or delete
- Capture real failure modes by viewport: phone portrait, phone landscape, tablet portrait, tablet landscape

### Phase 1 — Shell Contract Reset

- Define mobile viewport zones: header, workspace, action rail, overlays
- Define one navigation model for queue, detail, admin, gantt, and deck
- Define z-index and pointer-event contract for dock, FAB, overlays, and sheets
- Define touch-first interaction rules for critical actions

### Phase 2 — Remove Mobile-Only Debt

- Remove duplicate mobile navigation and bottom-sheet surfaces
- Remove contradictory breakpoint overrides
- Collapse mobile interactions back onto shared workspace state

### Phase 3 — Queue + Detail Rebuild

- Rebuild queue browsing on a mobile-native vertical flow
- Rebuild detail interactions without hover dependency
- Ensure raw strip, admin actions, and comment flows remain usable on touch devices

### Phase 4 — Admin / Review Rebuild

- Rebuild admin and reviewed interactions as bounded, touch-safe surfaces
- Eliminate overlay collisions with primary dock or workspace controls
- Ensure reopen / close behavior is consistent across detail and deck contexts

### Phase 5 — Deck + Gantt Rebuild

- Rebuild deck mobile presentation behavior with explicit action zones
- Rework gantt mobile to either provide a usable landscape experience or a deliberate fallback, but not a half-state
- Audit orientation transitions and safe-area behavior

### Phase 6 — Validation

- Smoke test matrix: iPhone SE, iPhone Pro Max, iPad portrait, iPad landscape
- Verify no blocked controls, no horizontal overflow, no trapped scroll regions
- Desktop regression pass for shell, deck, admin panel, and gantt

## Acceptance Criteria

- One mobile navigation model exists
- No duplicate mobile/desktop panel systems compete for state
- No critical action depends on hover
- No full-screen invisible hitboxes intercept pointer events
- Deck, admin, and gantt controls are reachable on touch devices
- Desktop behavior remains stable

## First Cut Recommendation

Start by deleting or isolating the current WS12 mobile-only surfaces behind a hard feature flag in the audit branch, then rebuild queue/detail/admin first. Gantt and deck should follow after the shell contract is stable.