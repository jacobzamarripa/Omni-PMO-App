# Agent Log — Omni PMO App

> [!info] 2026-03-28: WS17 Phase 1 complete — Dock contract and surface design locked
> - Expanded `WORKSTREAM_17_DESKTOP_CONTEXT_DOCK.md` Phase 1 from checklist placeholders into a full desktop interaction contract.
> - Locked compact rail inventory, panel split, per-mode context slot behavior, panel open-close rules, badge/count/clear behavior, and accessibility requirements.
> - Marked WS17 Phase 1 complete in `PRD.md`; Phase 2 implementation is now unblocked.

> [!info] 2026-03-28: WS16 GlassFlow Refinement — Dock restored, admin panel fixed, detail card compacted
> - **GlassFlow declared winner** of the WS16 V2 experiment (over FlexStack, RailView, SignalStack). Single working shell going forward.
> - **FAB ported then reverted:** Fully ported SignalStack's expandable FAB action cluster into GlassFlow as a dock replacement. User redirected: FAB idea should be incorporated *into* a dock button, not replace the dock. FAB HTML/CSS/JS stripped; original dock restored exactly.
> - **Admin panel animation fixed:** Replaced `display:none → display:flex` toggle (which blocks CSS transitions) with `visibility: hidden/visible` + `pointer-events` + delayed `visibility` transition. Panel now animates correctly on lift.
> - **Admin inner scrollability:** Added `overflow-y: auto` + `-webkit-overflow-scrolling: touch` to `#admin-pane-content`, `#outbox-list`, `#changelog-list`.
> - **Detail card compaction:** Tightened hero padding (`16px 20px → 12px 16px`), reduced `qb-proj-id` font-size, clamped `chat-bubble` min-height (`100px → 72px`), tightened `section-label` and module-header spacing. More critical data above the fold.
> - **Next task (other agent):** Incorporate FAB expandable action cluster *into* the dock — one dock button expands a contextual FAB menu above the dock.

> [!info] 2026-03-28: WS16 Mobile V2 experiment — GlassFlow Final Competition Build (COMPLETE)
> - **Commit Flow Locked:** Prioritized System Diagnostics and PM Note visibility above the fold. Added `scrollIntoView` focus logic to ensure the textarea stays accessible above the mobile keyboard.
> - **Spatial Hierarchy:** Reorganized the Detail View to place FDH ID, Status, Target Date, and Action Box in the primary viewport, moving secondary metrics below the fold.
> - **Premium Transitions:** Refined the `mobile-detail-open` Push transition with a custom `cubic-bezier(0.16, 1, 0.3, 1)` for a physical, high-end feel in both directions.
> - **UX Polish:** Added active tap responses (scale + highlight), persistent selected project state, and a custom "✓ ALL CLEAR" empty state for the queue.
> - **Dark Mode & Performance:** Verified theme-safe `color-mix` styling and reduced header blur to `12px` for smooth performance on all devices.
> - **GAS Standardization:** Enforced correct `<head>` structure with `<base target="_top">` and state-first include order.

> [!info] 2026-03-28: WS16 Mobile V2 experiment — GlassFlow Phase B Step 2 Completed
> - **Functional Shell:** Completed the full loop for the GlassFlow variant, ensuring queue-to-detail push transitions and back-navigation are fully wired.
> - **Admin Hub:** Implemented as a lift-up bottom sheet with full tab parity (Admin, Reviewed, Activity) and live badge sync.
> - **Standardization:** Refactored `v2_shell_GlassFlow.html` to follow standard GAS head structure, adding `<base target="_top">` and moving core state/style includes to the head to resolve environment-level CSP reporting noise.
> - **Navigation:** Wired `openPane` and `closeMobileDetail` hooks to the `mobile-detail-open` class for robust single-column mobile behavior across all widths.
> - **Verification:** Manual check confirms all detail IDs are mounted, sync/refresh triggers are active, and the admin panel lifts correctly from the glassy dock.

> Full execution history moved to `_docs_archive/AGENT_LOG_archive.md` (2026-03-26, after WS14 closeout).
> Current state: WS16 active (2026-03-28). Native mobile redesign is implemented; Phase 11 runtime signoff remains open. See PRD.md.

> [!info] 2026-03-28: WS16 Mobile V2 experiment — SignalStack restart rebuild
> - Replaced the discarded `src/v2_shell_SignalStack.html` clone with a fresh shell built around ambient gradient chrome, stacked live queue cards, a pushed detail board, and a context-expanding FAB action cluster.
> - Preserved the shared runtime contract: all required detail IDs remain mounted, queue selection still flows through the shared `openPane`, `closeMobileDetail()` returns to queue mode, and the admin panel still lifts as a bottom sheet from inside the shared reading pane.
> - Kept search/filter sheet behavior on the shared mobile sheet path while visually hiding the dock chrome, so SignalStack uses sheet + FAB interactions instead of the permanent bottom dock pattern.
> - Verification: `npm test` passed the WS16 mobile validation harness (9/9 checks) after the restart rebuild.

> [!info] 2026-03-28: WS16 Mobile V2 experiment — SignalStack Phase B contract hardening
> - Patched `src/v2_shell_SignalStack.html` to restore missing shared-renderer targets: `#p-today-indicator` with its child nodes and `#p-light-pill` in the velocity header.
> - Added a shell-local `openPane` / `closeMobileDetail` wrapper so SignalStack resets the detail scroll owner on project open and keeps a lightweight `data-mview` state in sync with queue/detail navigation.
> - Re-validated the mobile shell contract with `npm test`; WS16 source validation passed all 9 checks after the patch.

> [!info] 2026-03-28: WS16 Mobile V2 experiment — SignalStack variant
> - Claimed `SignalStack` in `src/02_Utilities.js` and the WS16 experiment pre-flight table.
> - Added `src/v2_shell_SignalStack.html` as a mobile-first stacked shell that keeps the shared WS16 runtime but re-composes it into a queue-first card, slide-in detail board, and lifted admin sheet.
> - Spatial model: dense queue card in front, detail panel pushed behind until selection, review actions softened until note focus, and an end-of-list sentinel inside the queue scroll owner.
> - Motion model stays within WS16 timing tokens: queue-to-detail push, admin lift, and search/filter fade-up sheet.
> - Verification: existing `npm test` WS16 source validation still passes after the variant registration.

> [!info] 2026-03-27: WS16 Phase 16 — Polymorphic dock + full-width panel polish
> - **Direction pivot:** Replaced dual-layer system (`#mobile-dock` pill + `#mobile-rail` tab bar) with a single floating polymorphic dock per reference design (Centric Ops native app pattern).
> - **`#mobile-rail` eliminated:** Removed all HTML markup and CSS (`#mobile-rail`, `.rail-btn`, 80+ lines). No more edge-to-edge chrome at screen bottom.
> - **`#mobile-dock` redesigned:** Floating pill (`border-radius: 20px`, shadow, 64px tall, 16px side margins). Three contexts driven by `syncMobileDockContext()`: Queue (Search · Filter · **Queue-active** · Deck), Detail (Back · **Detail-active** · Prev · Next · Review), Deck (Queue · **Deck-active** · Filter).
> - **Active button pattern:** Filled `var(--accent)` background + white icon (`border-radius: 14px`) — matches native iOS tab bar convention.
> - **Sort moved to filter sheet:** Removed `#m-dock-sort` select from dock. Added `#m-sf-sort-select` to `#mobile-sf-sheet` with `syncMobileSFSort()`. `syncMobileSFFilterChips()` now syncs sort to sheet.
> - **Token bump:** `--m-section: 28px`, `--m-card-pad: 20px`, `--m-touch: 56px`, `--m-dock-h: 64px` (replaces `--m-rail-h`).
> - **Full-width panel fix:** Added `left: 0; right: 0; border-radius: 0; box-shadow: none` overrides to `.inbox-sidebar` and `.reading-pane` in WS16 ≤480px block — old layout block had `left: 12px; right: 12px` leaking through.
> - **Header restored:** Re-enabled `nav-brand-title` at ≤480px (was hidden pending Phase 5 large-title implementation; looked blank in interim).
> - **Stale clearance refs fixed:** `body.admin-panel-open .reading-pane` inset, `#gantt-panel` bottom updated from `56px` (old rail) to `var(--m-dock-h, 64px) + 12px`.
> - **~84px real estate reclaimed** vs. prior dual-dock (was 124px combined).
> - **Smoke test:** Queue full-width ✓, push-pop transitions ✓, polymorphic dock context switches ✓, filter sheet Sort row ✓, admin sheet clears dock ✓.

> [!info] 2026-03-27: WS16 Phases 12-15 — Mobile dock + unified search/filter sheet
> - **Phase 12 (Queue-first + rail simplification):** Removed Grid action from `#mobile-rail` and reindexed phone rail active-state CSS (Queue/Deck/Filter).
> - **Phase 13 (Polymorphic mobile dock):** Added `#mobile-dock` with queue context (Search, Filter, Sort) and detail context (Prev/Next, position counter, Review Hub). Added JS runtime: `openMobileSFSheet`, `closeMobileSFSheet`, `navigateMobileQueue`, `syncMobileDockSort`, `syncMobileDockContext`.
> - **Phase 14 (Detail breathing room):** Hid legacy floating deck/admin controls on phone, increased card/hero spacing and hierarchy, and reserved scroll clearance above dock + rail.
> - **Phase 15 (Search/Filter sheet):** Added `#mobile-sf-sheet` + `#mobile-sf-overlay` slide-up dialog, mirrored desktop filter chips/group/search into mobile sheet via `syncMobileSFFilterChips`, and wired shared search debounce/filter pipeline to `#m-sf-search-input`.
> - **Stability hardening:** Removed leftover legacy `mobile-queue-search` markup and fixed malformed header markup in `WebApp.html`.
> - **Validation:** VS Code diagnostics report no errors in `WebApp.html`, `_styles_layout.html`, `_module_webapp_core.html`, and `_module_queue_state.html`.

> [!info] 2026-03-28: WS16 Phase 11 — Source validation harness
> - Added `scripts/validate-ws16-mobile.js` and wired `npm test` to assert the WS16 mobile shell contract from source.
> - Coverage includes the polymorphic dock, unified search/filter sheet, queue-to-detail state toggle, back navigation helper, mobile queue navigation, and phone-only CSS gates for queue/detail and filter sheet behavior.
> - This closes the source-validation gap for Phase 11, while manual runtime checks remain pending for final device signoff.

> [!info] 2026-03-28: WS16 docs consolidation + Mobile V2 experiment setup
> - Archived completed WS16 setup docs to `_docs_archive/workstream_16/`: `WORKSTREAM_16_MOBILE_REBUILD.md`, `WORKSTREAM_16_PHASE0_AUDIT.md`, and `WORKSTREAM_16_PHASE1_CONTRACT.md`.
> - Kept the active WS16 working set at repo root: `WORKSTREAM_16_NATIVE_DESIGN.md` and `WORKSTREAM_16_VALIDATION_MATRIX.md`.
> - Added `WORKSTREAM_16_MOBILE_V2_EXPERIMENT.md` as the new blue-sky brief for multi-agent review before execution.

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
> [!info] 2026-03-28: WS17 kickoff — Desktop Context Dock plan documented
> - Added `WORKSTREAM_17_DESKTOP_CONTEXT_DOCK.md` as the formal desktop follow-on plan for contextual dock exploration.
> - Direction is locked to a compact desktop smart-dock with a dock-mounted Filters launcher and anchored secondary filter panel, preserving the existing glass shell language.
> - Added WS17 to `PRD.md` with clearly defined checkbox phases so execution can be tracked incrementally.
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

> [!info] 2026-03-27: WS16 Phase 4 — Mobile design tokens + rail polish
- **`_styles_base.html`:** added phone token block (`--m-gutter`, `--m-row-pad`, `--m-section`, `--m-card-pad`, `--m-touch`, `--m-nav-h`, `--m-rail-h`) under `@media (max-width: 480px)`.
- **`_styles_layout.html`:** rail converted to icon-only at phone (`.rail-btn span { display:none; }`), active-dot indicator added via `.rail-btn::after`, and active dot/color now follows body mode classes (`grid-mode-active`, `gantt-view-active`, `deck-mode-active`, `mobile-filter-open`).
- **`_styles_layout.html`:** `#mobile-back-btn` upgraded from simple row button to native nav-bar pattern (left chevron+Queue label + right-aligned project title).
- **`WebApp.html`:** `#mobile-back-btn` markup split into `.mobile-back-left` + dynamic `#mobile-back-title` region.
- **`_module_queue_state.html`:** `openPane()` now syncs selected FDH into `#mobile-back-title`.
- **`_module_webapp_core.html`:** `closeMobileDetail()` resets back-title to default.
- **`_module_startup_refdata.html`:** `showStartupSelector()` now bypasses modal on phone (`<=480`), clears `mobile-detail-open`, and auto-continues to shared detail workspace (queue default state).
- **`_styles_loaders.html`:** startup overlay hard-hidden on phone (`display:none !important`).
- **Validation:** no errors reported by VS Code diagnostics on changed files.
- **Next:** Phase 5 — Native queue list (large title, two-line row treatment, hidden density controls).

> [!info] 2026-03-27: WS16 Phase 5 — Native queue list
- **`WebApp.html`:** added `#mobile-queue-search` inside `.inbox-header` (`.mobile-queue-search-wrap`) and wired to `handleSearchInput(event)`.
- **`_module_queue_state.html`:** `handleSearchInput()` now syncs desktop `#search-input` and phone `#mobile-queue-search` values bidirectionally before debounce; `applyFilters()` now reads search term from either input and applies active state to both fields.
- **`_module_queue_state.html`:** list-card template changed to two-line identity (`FDH` + `City · Vendor`) with right-side chevron affordance (`.em-chevron`), preserving status pill.
- **`_module_queue_state.html`:** `applyViewMode()` forces queue mode from `grid` to `inbox` on `<=480px` to prevent desktop grid cards from leaking into phone queue.
- **`_styles_badges.html`:** phone-only native queue stylesheet:
	- large queue title treatment (`Queue` 28px), compact count pill
	- hide density controls (`#view-toggle-btn`, `#sort-queue`, `#sidebar-pivot-select`)
	- mobile search field visual style (52px target, 16px font, active ring)
	- hide `.queue-group-header` on phone
	- convert `.email-card` to row pattern (52px min touch, 2-line text, no hover lift, hidden `.em-tags`, visible chevron)
- **Validation:** no errors on `WebApp.html`, `_module_queue_state.html`, `_styles_badges.html`.
- **Next:** Phase 6 — Native detail layout (hero + stacked sections, dock/strip minimization).

> [!info] 2026-03-27: WS16 Phase 6 — Native detail layout
- **`_styles_responsive.html`:** detail pane spacing shifted to mobile tokens (`--m-gutter`) and tightened top rhythm (`.pane-content` top 8px).
- **Hero hierarchy:** `.qb-proj-id` enlarged to 24px/800, `.qb-proj-meta` increased to 14px/500 for stronger project identity on phone.
- **Schedule card header flow:** `#project-schedule-card .qb-proj-title` now stacks vertically; status pill fills full width for thumb-friendly readability.
- **Section treatment:** phone `.qb-module` now renders as standalone rounded cards (14px radius, bordered, 14px padding) with stronger section headers (`.qb-module-header` 12px/800).
- **Stacking enforced:** `.qb-top-row` border removed on phone, `.interaction-split` gap normalized to 12px while preserving single-column behavior.
- **Clutter reduction:** `#welcome-screen` hidden on phone; `.raw-data-strip` forced hidden at `<=480px` in `_styles_panels.html`.
- **Validation:** no diagnostics errors on `_styles_responsive.html` and `_styles_panels.html`.
- **Next:** Phase 7 — Admin bottom-sheet pattern for `.outbox-pane` on phone.

> [!info] 2026-03-27: WS16 Phase 7 — Admin bottom sheet
- **`_styles_layout.html`:** added `.outbox-overlay.open { display:block; }` so JS class toggles now actually reveal overlay dimmer.
- **`_styles_layout.html`:** phone-only `.outbox-pane` converted to bottom-sheet geometry:
	- `position: fixed`, anchored above mobile rail
	- `height: min(70vh, 560px)` with rounded top corners
	- slide animation via `transform: translateY(110%)` → `.open` => `translateY(0)`
	- stronger elevation and blur for native sheet depth
	- drag-handle affordance via `.outbox-pane::before`
- **`_styles_layout.html`:** hidden floating admin affordances on phone (`.admin-fab-anchor`, `#admin-fab`, `#admin-panel-close`) to prevent collisions with sheet controls.
- **`WebApp.html`:** added `☰ Review Hub` action to mobile hamburger menu (`toggleAdminPanel(); toggleMobileMenu()`) as the explicit entry point for sheet open/close.
- **Validation:** no diagnostics errors on `_styles_layout.html` and `WebApp.html`.
- **Next:** Phase 8 — Filter bottom-sheet pattern for `.smart-dock` at phone width.

> [!info] 2026-03-27: WS16 Phase 8 — Filter bottom sheet
- **`_styles_responsive.html`:** upgraded `body.mobile-filter-open .filter-strip.smart-dock` from simple fixed rail to bounded sheet behavior:
	- `max-height: 60vh`, `overflow-y: auto`, stronger elevation and top border treatment
	- increased padding and spacing for touch-first filter controls
- **Scrim depth:** added `body.mobile-filter-open::after` visual dim layer to separate filter context from workspace content while preserving existing JS open/close flow.
- **Sheet affordance:** added drag-handle indicator via `.filter-strip.smart-dock::before` when open.
- **Validation:** no diagnostics errors on `_styles_responsive.html`.
- **Next:** Phase 9 — queue/detail push-pop transition animation.
