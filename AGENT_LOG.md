# Agent Log — Omni PMO App
> Full execution history moved to `_docs_archive/AGENT_LOG_archive.md` (2026-03-26, after WS14 closeout).
> Current state: WS13 complete (2026-03-27). All 6 performance items closed. No open workstreams. See PRD.md.

> [!info] 2026-03-27: WS13 Complete — Performance & Animation Audit
> - **Animation audit:** Removed layout-shifting `width` transitions from `.qb-time-fill` + `.qb-vel-fill`; replaced `.mobile-menu-panel` `max-height` transition with compositor-only `opacity + transform` — `_styles_components.html`
> - **Virtual scroll:** Moved `content-visibility: auto` from container (wrong) to individual `.email-card` (80px intrinsic) + `.grid-card` (200px intrinsic) — browser now skips off-screen card paint/layout
> - **Canvas sparklines:** Evaluated — CSS bars sufficient. No time-series data in model; canvas adds GAS complexity with zero UX gain. Closed as not warranted.

> [!info] 2026-03-27: WS15 Complete — Project Renamed DPA → Omni PMO App
> - Renamed local directory to `Omni-PMO-App`
> - Updated 8 files (14 string occurrences): WORKSTREAM_0_NOTES.md, AGENT_LOG.md, WebApp.html (3 UI strings), 05_CDAnalyzer.js, package.json, .claude/settings.local.json (6 bash paths), _docs_archive/AGENT_LOG_archive.md
> - Updated git remote → `github.com/jacobzamarripa/Omni-PMO-App.git` — pushed to main (commit 7d2522a)
> - GAS script ID unchanged — Web App URL stable, triggers confirmed active
> - Smoke test: passed (clasp push ✓, Web App loads ✓, triggers active ✓)

> [!info] 2026-03-27: Session checkpoint — runtime visibility investigation (COMPLETE)
- **Resolved (User):** 1 (Calculator z-index), 2 (Admin/Deck controls), 3 (Dock clearance), 5 (Deck viewports).
- **Resolved (Gemini):** 4 (Raw Data Strip) — Fixed highlighting and centering misalignment.
- **Fix (Item 4):** Refactored `hl()` in `_module_webapp_core.html` to use `getBoundingClientRect` for relative centering within the scrollable strip (accounting for table/padding offsets). Expanded the `aliasMap` to improve matching for key headers like `BSLs`, `CX Start`, and `Construction Comments`.
- **Note:** All 5 items from the "Visibility Investigation" are now closed.

> [!info] 2026-03-27: Context Hygiene — Archive Purge & AI Focus
- **Archive Purge:** Deleted `_archive` directory (7 files, ~11k lines) to prevent AI context poisoning. Code remains accessible via git history.
- **AI Focus:** Created `.geminiignore` to skip `_docs_archive` and system noise (`node_modules`, etc.) during agentic searches.
- **Sync:** Mirrored state to Obsidian vault (01_Projects/Omni-PMO-App).

> [!info] 2026-03-27: WS16 Kickoff — Mobile Architecture Rebuild
- **Why:** WS12 responsive work shipped feature parity, but current mobile behavior still depends on layered breakpoint overrides, duplicate navigation paths, and mobile-only sheets that are too brittle to keep extending.
- **Decision:** Treat mobile as a fresh architecture pass, not another breakpoint tweak cycle.
- **Salvage:** Keep shared state contracts, shared renderers where viable, viewport meta handling, touch-safe sizing tokens, and orientation utilities that still serve the main shell.
- **Replace/Delete Candidates:** `_module_mobile_nav.html`, WS12 mobile bottom sheets in `WebApp.html`, duplicate mobile menu path, and mobile-only dock/search/admin orchestration that bypasses the main workspace contract.
- **Execution Order:** 1) audit and salvage map, 2) define mobile shell contract, 3) remove mobile-only debt, 4) rebuild queue/detail/admin, 5) rebuild deck/gantt mobile, 6) smoke matrix + desktop regression.
- **Success Bar:** One mobile navigation model, no duplicate panel systems, no blocked controls, no hover-dependent critical actions, and no desktop regressions.

> [!info] 2026-03-27: Session checkpoint — mobile rebuild planning
- **Artifacts:** Added WS16 to `PRD.md` and created `WORKSTREAM_16_MOBILE_REBUILD.md` as the execution spec.
- **Risk Posture:** Mobile-only code may be deleted where it conflicts with a shared-shell rebuild. Desktop behavior remains protected unless explicitly required by the new shell contract.

> [!info] 2026-03-27: WS16 Phase 0 — Initial mobile audit findings
- **Primary finding:** Mobile currently behaves like a parallel app shell, not a responsive extension of the desktop shell.
- **Root causes:** 1) duplicate navigation systems, 2) mobile-only bottom sheets, 3) DOM reparenting of `.reading-pane` into the admin sheet, 4) breakpoint overrides that hide shared dock behavior instead of adapting it.
- **Delete-first candidates:** `src/_module_mobile_nav.html`, WS12 mobile bottom-nav and bottom-sheet markup in `src/WebApp.html`, and the mobile search/admin sheet orchestration that clones desktop filters into separate mobile containers.
- **Salvage-first candidates:** viewport meta handling, coarse-pointer/touch heuristics, shared router/state ownership, and any token-level spacing/breakpoint definitions that survive the shell reset.

> [!info] 2026-03-27: WS16 Phase 2 — Mobile shell deletion + #mobile-rail scaffold
- **Deleted:** `src/_module_mobile_nav.html` — WS12 parallel runtime with `mSwitchView()`, DOM reparenting, and duplicate search/admin sheets
- **Removed from WebApp.html:** `#m-bottom-nav`, `#m-menu-sheet`, `#m-admin-sheet`, `#m-search-sheet`, 3 backdrops, `include(_module_mobile_nav)` (137 lines)
- **Added to WebApp.html:** `#mobile-rail` with 5 buttons calling `switchWorkspaceView()` and `toggleMobileFilter()` directly
- **CSS pruned from `_styles_layout.html`:** `.mobile-outbox-overlay`, `.mobile-outbox-sheet` (pre-WS12 dead weight), glassmorphism dock block, `.m-tab-btn`, dark mode dock, portrait gantt rule, polymorphic dock context system, all `.m-sheet-*` component CSS (350 lines removed)
- **CSS added to `_styles_layout.html`:** `#mobile-rail` layout at `@media (max-width: 480px)`, `body.admin-panel-open .reading-pane` as fixed overlay
- **`_styles_responsive.html`:** replaced WS12 `@media (max-width: 768px)` block (with `.m-*` rules) with clean `@media (max-width: 480px)` block
- **`_module_webapp_core.html`:** added `toggleMobileFilter()` — toggles `.smart-dock` via `body.mobile-filter-open` class, no DOM cloning
- **Bottom offsets updated:** `.inbox-sidebar`, `.reading-pane` bottom: `calc(56px + env(safe-area-inset-bottom) + 8px)`; `#gantt-panel` bottom: `calc(56px + env(safe-area-inset-bottom))`
- **Net change:** 114 insertions, 703 deletions. Commit `37203ae`
- **Next:** Phase 3 — rebuild queue + detail mobile flow on shared primitives

> [!info] 2026-03-27: WS16 Phase 3 — Mobile queue ↔ detail flow on shared primitives
- **`_styles_layout.html`:** `#mobile-back-btn { display: none; }` globally. Inside `@media (max-width: 480px)`: `.inbox-sidebar` visible by default; `body.mobile-detail-open .inbox-sidebar` hides it; `body.mobile-detail-open .reading-pane` reveals it as `flex`; `#mobile-back-btn` phone-only styles (44px touch target, accent color, border-bottom rule)
- **`WebApp.html`:** `#mobile-back-btn` button injected inside `.reading-pane` above `.upper-workspace`; calls `closeMobileDetail()`; hidden on desktop, visible on phone via 480px CSS rule
- **`_module_queue_state.html`:** `openPane()` calls `document.body.classList.add('mobile-detail-open')` when `window.innerWidth <= 480` — one line, CSS does the rest
- **`_module_webapp_core.html`:** `closeMobileDetail()` added — removes `body.mobile-detail-open`, returns to queue view
- **Contract alignment:** No DOM reparenting, no JS `display` overrides for mobile panels, startup phone state shows queue by default (`.inbox-sidebar` made visible by 480px CSS; no JS init needed)
- **Net change:** 39 insertions, 0 deletions. Commit `a49733d`
- **Next:** Phase 4 — rebuild review/admin interactions for mobile
- **Deliverable:** `WORKSTREAM_16_PHASE1_CONTRACT.md` — authoritative pre-code constraints for the mobile rebuild.
- **Navigation model:** `switchWorkspaceView()` is the single router on all viewports. `mSwitchView()` is deleted. New `#mobile-rail` markup calls shared router functions directly.
- **Admin model:** `.reading-pane` never reparented. Admin opened via `setAdminPanelOpen(true)`. On phone, reading-pane goes full-screen via CSS (`position: fixed; inset: 0`).
- **Search/filter model:** One DOM input (`#filter-search`). `toggleMobileFilter()` toggles Zone 2 (`.smart-dock`) open/closed. Zero DOM cloning.
- **Z-index table:** 11 named layers. Dead layers identified: `#m-bottom-nav`, `#m-admin-sheet`, `#m-menu-sheet`, `#m-search-sheet`, `.mobile-outbox-overlay`, `.mobile-outbox-sheet`.
- **Pointer-event invariant:** Overlay containers `pointer-events: none` by default. Only interactive children opt in.
- **Touch targets:** 44×44px minimum. No hover-only affordances. `:active` states required.
- **Next:** Phase 2 — delete mobile-only debt, add `#mobile-rail` markup + CSS to shell.

