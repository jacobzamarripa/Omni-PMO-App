# Agent Log — Omni PMO App

> [!success] 2026-04-03: Desktop Review Hub polish + desktop/mobile branding parity pass
- **Review Hub containment fixed:** Manager Review no longer inherits Admin-only chrome. Tab-strip/KPI visibility is now driven explicitly by `switchPanelTab()` / `syncOutboxPanelMode()` so Reviewed state hides admin chrome reliably on desktop.
- **Reviewed panel restoration:** Added narrowly scoped `#ob-panel-reviewed` desktop rules so reviewed rows/header regain stable spacing and comment content can expand without bleeding Admin styles back in.
- **Activity filter bar refactor:** Rebuilt the desktop Activity search/filter layout into contained in-panel rows. Search now sits on its own row with filters below, inner-card chrome removed, overflow fixed, and desktop controls normalized.
- **Brand alignment:** Desktop top bar now uses `OMNISIGHT` with the mobile two-tone brand treatment. Diagnostic Queue and Review Hub headers now share the same two-line hierarchy and compact counter pill language.
- **Corner geometry parity:** Desktop shell radius token moved to `24px`, with deck/review hub surfaces updated to inherit the same radius for closer GlassFlow parity.
- **Review Hub corner controls:** The launcher now targets the same upper-right corner zone as the in-panel X. Close button is anchored inside the panel container, and the open-state FAB is suppressed to keep a single open/close target.
- **Motion cleanup:** Removed the harsh FAB/state blink by flattening FAB state changes and replacing the panel's scale-pop with a lighter translate/opacity transition.
- **Pending:** Local visual result was iterated based on user feedback, but final deployed smoke test still needs to be run before calling the slice production-validated.

> [!success] 2026-04-02: WS20 Phase 4 COMPLETE — Desktop Review Hub GlassFlow Parity
- **Review Hub nav button:** Replaced floating `position:fixed` admin-fab badge with a proper icon button in `.nav-actions` (`#btn-review-hub`, `class="desktop-hub-btn"`). Calls `toggleAdminPanel()`, shows `#nav-hub-badge` count, toggles `.is-active` accent style when panel is open. Hidden on mobile via `@media (max-width:768px)`.
- **Floating admin-fab removed on desktop:** `.admin-fab-anchor { display: none !important }` in `@media (min-width:769px)` block. `syncAdminFabAnchorToPanel()` still runs harmlessly.
- **Review Hub panel HTML rewrite (`WebApp.html` lines ~540–609):** Replaced legacy `admin-strip` + `panel-tab-bar` structure with GlassFlow-parity layout:
    - Header: `inbox-title-stack` title + `#ob-header-count` count badge + close button (top row)
    - KPI mini chips: `admin-kpi-mini-wrap` with `admin-kpi-mini` Crossings/Status/BOMs chips (same IDs, same SVG icons as mobile). Hidden via `#review-hub-main-header:not(.is-admin-tab) #admin-kpi-header-wrap { display:none }`.
    - Desktop tab strip: `.ob-desktop-tab-strip` + `.ob-desktop-tab` pill buttons (Admin/Reviewed/Activity) with `.active` accent state.
    - Panels: `review-hub-panel` + `review-hub-scroll-area` (GlassFlow classes) on all three panels — Admin, Reviewed, Activity.
    - Activity panel: `activity-filter-fab` + `review-hub-filter-bar` + `review-hub-filter-row` + `review-hub-filter-toggle` classes match mobile.
- **CSS overrides (`_styles_layout.html` `@media ≥769px`):**
    - `.outbox-pane .review-hub-scroll-area { padding-bottom: 20px !important }` — overrides mobile 96px dock-clearance.
    - `.ob-desktop-tab-strip`, `.ob-desktop-tab`, `.ob-desktop-tab.active` — new compact pill tab styles.
    - `#review-hub-main-header:not(.is-admin-tab) #admin-kpi-header-wrap { display:none }` — hides KPI chips on non-Admin tabs.
- **Badge sync:** `syncReviewHubHeaderCount()` now populates `#nav-hub-badge` (nav button) in addition to `#admin-fab-badge`.
- **Token:** `--dock-clearance-top: 72px` → `var(--desktop-header-height, 56px)`.
- **Deployed:** @643.
- **Pending:** Phase 5 (Gantt/Grid/Deck visual sweep) and Phase 6 (motion + regression validation) remain.

> [!success] 2026-04-01: WS20 Phases 1–3 COMPLETE — Desktop Executive Glass Parity
- **Phase 1 (Token Parity):** Added 6 desktop shell geometry tokens to `_styles_base.html` `:root`: `--desktop-shell-inset: 16px`, `--desktop-shell-radius: 16px`, `--desktop-shell-shadow`, `--desktop-easing`, `--transition-spring: 280ms cubic-bezier(0.16,1,0.3,1)`, `--desktop-header-height: 56px`. Dark mode shadow override added.
- **Phase 2 (Header Refactor):** Replaced transparent 3-column `.top-nav` with glassy framed header (`backdrop-filter: blur(12px)`, `border-bottom: 1px solid var(--border)`, `min-height: var(--desktop-header-height)`, `transition: background/border-color var(--transition-spring)`). KPI pills moved from `top-nav-left` → `nav-actions` (right zone). FAB trigger + dropdown removed entirely. Action buttons (Sync QB, Run Review, Refresh) now permanently visible in `.desktop-action-cluster`. All JS null guards confirmed safe before removal.
- **Phase 3 (Spatial Recomposition):** Workspace framed as a card via `@media (min-width: 769px)` CSS rule on `.workspace`: `margin: 0 var(--desktop-shell-inset) var(--desktop-shell-inset)`, rounded bottom corners, shadow, border-top:none (header provides top edge). `#digest-workspace` and `.pane-content` padding updated to use `calc(var(--desktop-header-height) + offset)` instead of hardcoded `88px`.
- **Pending smoke test:** Phases 4–6 remain. Need deployed GAS URL to validate visually.

> [!info] 2026-04-01: WS20 planned & refined — Desktop Executive Glass Parity
- **Primary conclusion:** The mobile GlassFlow shell now has the stronger product language. Desktop remains functionally rich, but its shell architecture still reads as an older generation with more fragmented action zones, weaker spatial hierarchy, and less coherent motion.
- **Key evidence in code (verified against live files):**
    - `src/WebApp.html:118–208` — `.top-nav` 3-column grid: brand+KPIs left / segmented-controls center / distributed action buttons right. No shell container geometry.
    - `src/_styles_layout.html:12` — `.top-nav` is `display:grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)` — bare nav, not a framed container.
    - `src/_styles_ui_core.html:78–80` — `.filter-strip` is `position: absolute !important; top: 16px !important` — floating, not anchored to content zone.
    - `src/v2_shell_GlassFlow.html:47–48` — benchmark: `v2-shell-glassflow-viewport` → `v2-shell-glassflow-container` — framed card with inset, radius, shadow, border.
    - `src/_styles_glassflow_core.html:7–21` — geometry contract: `--v2-shell-inset:12px`, `--v2-shell-radius:24px`, `--v2-shell-shadow`, spring easing.
- **WS20 direction:** Port GlassFlow clarity principles to desktop. Desktop keeps two-pane layout, KPI bar, multi-view switching — but inside a framed container with coherent header and contextual action model.
- **Full plan:** `WORKSTREAM_20_DESKTOP_GLASS_PARITY.md`
- **Planned phases:**
    - [ ] Phase 1 — Shell Architecture Audit & Token Parity
    - [ ] Phase 2 — Desktop Header, Dock, and Action Zoning Refactor
    - [ ] Phase 3 — Queue/Detail Spatial Recomposition
    - [ ] Phase 4 — Desktop Review Hub & Overlay Modernization
    - [ ] Phase 5 — Gantt / Grid / Deck Visual Consistency Sweep
    - [ ] Phase 6 — Desktop Motion, Density, and Regression Validation
- **Acceptance intent:** Desktop retains information density and power-user efficiency. Inherits GlassFlow’s framed geometry, token discipline, contextual action choreography, and spring motion.

> [!success] 2026-04-01: WS19 CLOSED — Final Visual & Logic Polish
- **Review Hub UX:** Refactored Admin sections to full-width list style with sticky sub-headers. Standardized 14px padding for all rows.
- **Thumb-Zone Navigation:** Moved Search & Filter sheet headers/close buttons to the bottom footer. Lowered Activity FAB and tray to `bottom: 56px + safe-area` for ultra-accessible reach.
- **Badge & Counter Reliability:** 
    - Refactored `syncReviewHubHeaderCount` to provide true tab-specific totals that persist during navigation.
    - Fixed Activity pill "0" issue by removing CSS `!important` display rules and robustness date parsing.
    - Synced Admin dock pill with header count logic and applied `99+` capping.
- **Activity Feed:** Promoted "what changed" text to 11px Bold `var(--text-main)`. Removed icons for a cleaner, high-density text feed. Navigation arrows now instantly close the Hub and focus the detail card.
- **WS19 Closed:** All phases of Workstream 19 are complete. The Review Hub is now fully integrated and optimized for the GlassFlow mobile shell.

> [!info] 2026-03-31: Session Wrap — WS19 remains active, handoff prepared
- **WS19 Status:** Do **not** close the workstream. The current slice is implemented, but final visual fit-and-finish and live validation are still pending.
- **Critical Constraint Captured:** The correct design boundary is to reimagine the Review Hub **within the existing GlassFlow slide-up container and existing dock system**. Do not replace the shell frame on resume.
- **Remaining Polish Items:**
    - [x] KPI Chip Sizing: 3-row chips read cleanly? (Refactored to vertical)
    - [x] Section Card Visuals: Check radius/border on Admin sections. (Refactored to list-style)
    - [x] Sticky Header backgrounds: Confirm `var(--card-bg)` masks cleanly.
    - [x] Activity Filter Bar: Verify horizontal padding aligns inputs with rows. (Unified at 14px)
    - [x] Dock Badge Sizing: 14px badges with 2px borders? (Repositioned to corner, borders removed)
- **Files touched:** `v2_shell_GlassFlow.html`, `src/_styles_glassflow_core.html`, `src/_module_admin.html`, `src/_module_special_crossings.html`, `src/_module_changelog.html`.
