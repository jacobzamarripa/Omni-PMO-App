# WORKSTREAM 16 — Phase 0 Audit

## Summary

The current mobile implementation is not a thin responsive layer. It is a second interaction system that overrides the primary shell with mobile-only markup, mobile-only navigation logic, and mobile-only search/admin sheets.

## Primary Architectural Problems

### 1. Duplicate shell ownership

- `src/_module_mobile_nav.html` owns mobile view switching separately from `src/_module_router.html`.
- `mSwitchView()` directly sets `display: none !important` on core layout containers instead of relying on shared workspace state.
- Result: mobile and desktop can drift because they do not share one navigation contract.

### 2. DOM reparenting in admin flow

- `mShowAdminSheet()` moves `.reading-pane` into `#m-admin-sheet-body` and `mHideAdminSheet()` appends it back to `#main-workspace`.
- This is high-risk because event ownership, layout state, and references can break when a core shell node is physically moved.
- Result: brittle admin behavior and high probability of panel collisions or state loss.

### 3. Duplicate search/filter systems

- Mobile search is implemented as a separate sheet that clones desktop filter markup into `m-wrap-filter-*` containers.
- Search input mirrors into the desktop input so `applyFilters()` still works.
- Result: one logical feature rendered through two DOM systems, which is expensive to maintain and easy to desynchronize.

### 4. Breakpoint overrides are compensating for prior mobile overrides

- `src/_styles_responsive.html` hides `.filter-strip.smart-dock` entirely on mobile instead of adapting it.
- Mobile state depends on `body[data-mview]`, mobile-only tabs, and extra dock context containers.
- Result: mobile behavior is maintained by exception stacking, not by a stable shell contract.

### 5. Two mobile menu paths already exist

- Legacy mobile hamburger path: `#btn-hamburger` + `.mobile-menu-panel`
- WS12 bottom-sheet path: `m-bottom-nav`, `m-menu-sheet`, `m-admin-sheet`, `m-search-sheet`
- Result: mobile actions are fragmented across overlapping systems.

## Inventory

### Delete-first candidates

- `src/_module_mobile_nav.html`
Reason: owns a parallel navigation/runtime model and reparenting logic.

- WS12 mobile bottom-nav and bottom-sheet markup in `src/WebApp.html`
Reason: introduces a second shell with separate nav, admin, and search surfaces.

- Mobile search/admin sheet containers in `src/WebApp.html`
Reason: duplicate state surfaces for features already owned by shared shell/state.

- Mobile-only responsive rules in `src/_styles_responsive.html` that depend on `.m-*` surfaces
Reason: these rules preserve the duplicate shell instead of a unified one.

### Salvage-first candidates

- `src/_module_router.html`
Reason: shared workspace routing should remain the single owner of view state.

- `src/_module_webapp_core.html` `isIPadLike()`
Reason: still useful as a heuristic, but should be validated and possibly narrowed.

- `src/02_Utilities.js` viewport meta handling
Reason: correct platform-level setup and should survive the rebuild.

- `src/_styles_base.html` breakpoint/touch tokens
Reason: tokens are useful even if the current breakpoint strategy changes.

- Shared admin/router/state modules
Reason: they should continue owning behavior; mobile should consume them rather than bypass them.

### Salvage with rewrite

- `.mobile-menu-panel` flow in `src/WebApp.html` and `src/_module_webapp_core.html`
Reason: action access is valid, but the final rebuilt shell may replace this with a single mobile command surface.

- `src/_styles_layout.html` phone/tablet structural rules
Reason: some layout stacking rules are still directionally correct, but they need to be re-authored against the new shell.

- `src/_styles_gantt.html` portrait fallback concept
Reason: the idea of an explicit fallback is valid, but it must be implemented under the new shell contract.

## Recommended Deletion Order

1. Isolate or remove `src/_module_mobile_nav.html`
2. Remove `m-bottom-nav`, `m-menu-sheet`, `m-admin-sheet`, and `m-search-sheet` from `src/WebApp.html`
3. Remove `.m-*` responsive rules from `src/_styles_responsive.html` and related layout rules in `src/_styles_layout.html`
4. Reconnect mobile behavior to shared router and shared panel state only

## Rebuild Order

1. Queue and detail mobile shell
2. Admin/review mobile interactions
3. Search/filter mobile surface
4. Deck mobile
5. Gantt mobile and orientation strategy

## Guardrails

- Do not change desktop interaction models unless the new shared shell requires it.
- Avoid introducing another mobile-only runtime layer.
- No critical action should depend on hover.
- No core shell node should be reparented at runtime.

## Phase 0 Exit Criteria

- Every mobile-only surface is classified as salvage, salvage-with-rewrite, or delete.
- Deletion order is explicit.
- Rebuild order is explicit.
- Desktop guardrails are documented before code removal begins.
- Desktop behavior remains stable.

## First Cut Recommendation

Start by deleting or isolating the current WS12 mobile-only surfaces behind a hard feature flag in the audit branch, then rebuild queue/detail/admin first. Gantt and deck should follow after the shell contract is stable.
