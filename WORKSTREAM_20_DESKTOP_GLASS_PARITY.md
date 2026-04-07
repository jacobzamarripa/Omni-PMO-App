# Workstream 20 — Desktop Executive Glass Parity

> **Status:** CLOSED ✅ | **Branch:** main | **Started:** 2026-04-01 | **Closed:** 2026-04-06
> **Benchmark:** `src/v2_shell_GlassFlow.html` + `src/_styles_glassflow_core.html`
> **Target:** `src/WebApp.html` + desktop style chain
> **Deployed:** @643 (2026-04-02) | @Latest (2026-04-06)

## ⚡ Agent Handoff — Workstream Closed

**Phases complete:** 1 ✅ 2 ✅ 3 ✅ 4 ✅ 5 ✅ 6 ✅

**Summary of Final Polish (Phases 5-6):**
- **Dock Centering:** The search/filter dock is now dynamically anchored to the horizontal center of the active information card (Detail/Deck).
- **Vertical Equidistance:** Exact 12px gap symmetry enforced between Nav -> Dock and Dock -> Content.
- **Spring Physics:** All layout transitions and dock movements use the canonical `cubic-bezier(0.16, 1, 0.3, 1)` spring contract.
- **Visual Sweep:** Confirmed Gantt, Grid, and Deck views fill the new framed shell correctly. Deck presentation mode now breaks out of the frame correctly for full-immersion viewing.
- **Token Discipline:** Migrated hardcoded `--dock-content-offset` to dynamic calc expressions.

---

---

## Strategic Intent

The mobile GlassFlow shell (WS18–19) now has the stronger product language: a unified framed container,
branded header, contextual action model, and coherent shell geometry. The desktop shell has not kept pace.

**Goal:** Port the *clarity principles* of GlassFlow to desktop — not the phone layout. Desktop must retain
its information density and power-user efficiency while inheriting the visual discipline, framed geometry,
and contextual action choreography of the mobile shell.

**Non-goal:** Do NOT replicate the mobile single-column stack. Desktop gets two-pane layout, wider KPI bar,
multi-view switching, and floating tools — but all within a more coherent shell contract.

---

## The Gap (Verified Against Live Code)

| Problem | Desktop (live) | GlassFlow benchmark |
|---|---|---|
| Shell geometry | Bare `<body>` → `top-nav` → workspace; no container frame | `v2-shell-glassflow-container`: inset, border-radius 24px, shadow, border |
| Header structure | 3-column grid (`_styles_layout.html:12`): brand+KPIs / segmented-controls / actions — all separate | Single `v2-shell-glassflow-header` bar: brand left, contextual nav, actions right |
| Action model | Actions hardcoded in nav-right (`WebApp.html:192–207`); hides behind FAB on small screens | Contextual: back button appears only in detail state; sync actions behind single hamburger |
| Filter dock | `position: absolute !important; top: 16px` floating strip (`_styles_ui_core.html:78–80`) | No floating strip — filters are contextual, anchored to content zone |
| Floating widgets | Brief, Cal, Calc are freestanding draggable overlays (`WebApp.html:210–240`) | No floating widgets — tools surface contextually |
| Token scope | GlassFlow tokens (`--v2-shell-*`) exist only in `_styles_glassflow_core.html`; desktop uses none of them | All shell geometry driven by tokens, easy to tune |
| Motion | Desktop has some transitions but no consistent cubic-bezier contract | `cubic-bezier(0.16, 1, 0.3, 1)` throughout — spring physics |

---

## Phases

### ✅ Phase 1 — Shell Architecture Audit & Token Parity
**Goal:** Establish a shared geometry token layer that both shells can consume.

**Files:**
- `src/_styles_base.html` — add desktop shell tokens here (`:root` block, after existing tokens)
- `src/_styles_glassflow_core.html` — source of truth for geometry values to port
- `src/_styles_layout.html` — identify which desktop layout vars conflict or duplicate

**Tasks:**
- [ ] Audit `_styles_base.html:21` — identify any geometry tokens missing for desktop shell use (`--desktop-shell-radius`, `--desktop-shell-shadow`, `--desktop-shell-inset`, `--desktop-easing`)
- [ ] Port the GlassFlow geometry contract as desktop-scoped CSS variables in `_styles_base.html` under a `/* Desktop Shell Geometry */` comment block
- [ ] Audit `_styles_layout.html` for any hardcoded pixel values in `.top-nav`, `.workspace`, `.inbox-sidebar` that should become token-driven
- [ ] Document all token decisions in this file under "Token Decisions" section below

**Acceptance:** Running `grep -n "desktop-shell"` in `_styles_base.html` returns at least 4 tokens. No geometry values are hardcoded in `_styles_layout.html` where a token now exists.

---

### ✅ Phase 2 — Desktop Header, Dock & Action Zoning Refactor
**Goal:** Replace the scattered 3-column top-nav with a unified, framed header bar.

**Files:**
- `src/WebApp.html:118–208` — the `.top-nav` block; this is the primary edit target
- `src/_styles_layout.html:12–16` — `.top-nav` CSS to be rewritten
- `src/_styles_ui_core.html:71–76` — `.nav-brand`, `.btn-icon` to be updated or replaced

**Current structure (to replace):**
```
<div class="top-nav">                        ← 3-col grid
  <div class="top-nav-left">                 ← brand + KPI pills
  <div class="top-nav-center">               ← segmented view switcher + tool buttons
  <div class="nav-actions">                  ← action buttons + FAB dropdown
```

**Target structure:**
```
<div class="desktop-shell-header">
  <div class="desktop-shell-header-left">   ← brand mark only (no KPIs here)
  <div class="desktop-shell-header-center"> ← view switcher (same buttons, new container)
  <div class="desktop-shell-header-right">  ← KPI summary pill + action cluster
```

**Tasks:**
- [ ] Redesign `.top-nav` in `_styles_layout.html` to use new `desktop-shell-header` class with the framed, borderless bar pattern from GlassFlow header (see `_styles_glassflow_core.html:~70`)
- [ ] Move KPI pills from `top-nav-left` to a compact summary position on the right alongside actions — reduce visual weight of the KPI cluster on desktop
- [ ] Consolidate Sync QB / Run Review / Refresh into a single action cluster with a contextual trigger (matching GlassFlow hamburger pattern but desktop-appropriate)
- [ ] Keep theme toggle and help button exposed (they are used frequently)
- [ ] Remove `nav-fab-dropdown` fallback — desktop doesn't need a FAB
- [ ] Smoke test: all views (detail, grid, gantt, slide) switch correctly; KPIs still populate; sync actions still fire

**Acceptance:** Header is a single coherent bar. No floating dropdown FAB. Action buttons are visible without a secondary trigger. View switcher is centered.

---

### ✅ Phase 3 — Queue/Detail Spatial Recomposition
**Goal:** Tighten the inbox sidebar / reading pane geometry to match GlassFlow's framed card clarity.

**Files:**
- `src/_styles_layout.html:42–80` — tablet/phone breakpoints and workspace layout
- `src/_styles_panels.html` — panel-level geometry
- `src/WebApp.html` — workspace wrapper markup

**Context:**
The desktop detail view is a two-pane inbox layout: `--inbox-panel-width: 380px` sidebar + reading pane.
GlassFlow uses a single framed container with smooth slide transitions between queue and detail.
Desktop should keep the two-pane model but apply framing and spacing discipline.

**Tasks:**
- [ ] Wrap the desktop workspace in a `desktop-shell-container` analogous to `v2-shell-glassflow-container` — inset from viewport edges, rounded corners, shadow, border — using Phase 1 tokens
- [ ] Audit `--inbox-panel-width` usage in `_styles_layout.html` and `_styles_base.html:21` — confirm 380px is still the right sidebar width at 1440px+ screens; adjust if needed
- [ ] Ensure the reading pane has consistent gutter/padding using `--panel-gutter-x` and `--panel-gutter-y` tokens (already in `_styles_base.html:21`)
- [ ] Verify queue card rendering (`_render_queue_card.html`) uses correct spacing within the new shell geometry
- [ ] Smoke test: queue loads, cards render, detail opens, back/close works

**Acceptance:** Desktop app sits inside a framed container — visible inset from browser chrome. Reading pane and sidebar share consistent spatial grammar.

---

### ✅ Phase 4 — Desktop Review Hub & Overlay Modernization
**Completed:** 2026-04-02 | **Deployed:** @643

**What was done:**
- Replaced floating `position:fixed` admin-fab badge (the `99+` in top-right) with a proper nav header icon button (`#btn-review-hub`, `.desktop-hub-btn`). Calls `toggleAdminPanel()`, shows `#nav-hub-badge` count, `.is-active` accent state when panel open. Hidden on mobile.
- Rewrote `WebApp.html` outbox-pane HTML to match GlassFlow mobile structure exactly:
  - Header: title + count badge + close button (top row) + KPI mini chips (`admin-kpi-mini-wrap`) + desktop tab strip (`.ob-desktop-tab-strip`)
  - Removed legacy `admin-strip` with large number KPI cards
  - All 3 panels now use `review-hub-panel` + `review-hub-scroll-area` GlassFlow classes
  - Activity panel uses `activity-filter-fab` + `review-hub-filter-bar` + `review-hub-filter-row` + `review-hub-filter-toggle` matching mobile
- CSS overrides in `_styles_layout.html` `@media (min-width:769px)`:
  - `.outbox-pane .review-hub-scroll-area { padding-bottom: 20px !important }` (overrides 96px mobile dock clearance)
  - `.ob-desktop-tab` / `.ob-desktop-tab.active` — compact pill tab styles
  - `#review-hub-main-header:not(.is-admin-tab) #admin-kpi-header-wrap { display:none }` — hides KPI chips on non-Admin tabs
- `--dock-clearance-top` updated to `var(--desktop-header-height, 56px)`
- `syncReviewHubHeaderCount()` now also updates `#nav-hub-badge`

**Key IDs preserved (JS compatibility):** `#panel-tab-admin/reviewed/changelog`, `#admin-badge`, `#ob-count`, `#changelog-badge`, `#kpi-admin-crossings/status/boms`, `#kpi-crossings-val/status-val/boms-val`, `#ob-panel-admin/reviewed/changelog`, `#admin-pane-content`, `#outbox-list`, `#changelog-list`, `#changelog-search`, `#changelog-time`, `#changelog-user`, `#changelog-current-fdh`, `#activity-filter-bar`, `#activity-filter-trigger`.

**Known remaining items for Phase 5:**
- Validate Gantt / Grid / Deck views fill the workspace shell correctly
- `--dock-content-offset: 88px` may still appear in some module scroll calculations — audit Phase 5

---

### Phase 5 — Gantt / Grid / Deck Visual Consistency Sweep
**Goal:** Ensure all secondary workspaces use the new shell geometry and token system consistently.

**Files:**
- `src/_styles_gantt.html` — Gantt-specific layout
- `src/_module_gantt.html` — Gantt logic and DOM
- `src/_module_grid.html` — Grid workspace
- `src/_styles_deck.html` — Deck/slide styles
- `src/_module_deck.html` — Deck logic
- `src/_styles_layout.html` — `#digest-workspace` padding (lines 18–37)

**Pre-work known state (post-Phase 4):**
- `body.gantt-view-active .workspace { display: none !important }` already added in Phase 3 — Gantt panel fills viewport, workspace card suppressed. Visual validation still needed.
- `#digest-workspace` padding already updated to `calc(var(--desktop-header-height) + 36px)` in Phase 3.
- `--dock-clearance-top` updated to `var(--desktop-header-height, 56px)` in Phase 4.
- `--dock-content-offset: 88px` in `_styles_base.html:21` — **still hardcoded**; audit where it's consumed vs where Phase 3 already replaced it with explicit `calc()`.

**Tasks:**
- [ ] Switch to Gantt view — verify Gantt panel fills viewport; check `--gantt-panel-height: 34vh` in `_styles_base.html:21` — is it appropriate post-Phase 3?
- [ ] Switch to Grid view — verify card density is appropriate in the new shell; no awkward stretching
- [ ] Switch to Deck/Slide view — verify presentation mode breaks out of the shell container to full viewport (Deck must ignore workspace framing in presentation mode)
- [ ] Audit `--dock-content-offset: 88px` — grep across all src files; replace remaining hardcoded consumers with `var(--desktop-header-height)` calc expressions
- [ ] Smoke test all 4 views: detail → grid → gantt → deck. No regressions.

**Acceptance:** All 4 view modes render without visual regressions inside the new shell.

---

### Phase 6 — Motion, Density & Regression Validation
**Goal:** Apply consistent spring physics, verify dark mode, and sign off the workstream.

**Files:**
- `src/_styles_base.html` — `--transition-fast`, `--transition-std` tokens (line 30)
- `src/_styles_glassflow_core.html` — `cubic-bezier(0.16, 1, 0.3, 1)` source
- `src/_styles_layout.html` — desktop transition rules

**Tasks:**
- [ ] Add `--transition-spring: 300ms cubic-bezier(0.16, 1, 0.3, 1)` to `:root` in `_styles_base.html` alongside existing transition tokens
- [ ] Apply `--transition-spring` to `desktop-shell-container` enter/glow state transitions (Phase 3 work)
- [ ] Apply `--transition-spring` to header action cluster show/hide if contextual visibility is added
- [ ] Full dark mode pass: toggle to dark, verify all new Phase 2–3 containers use `var(--card-bg)` and `var(--border)` correctly (no hardcoded hex)
- [ ] Run the standard smoke test: App loads → data renders → detail opens → filter works → gantt opens → deck opens → Review Hub opens → dark mode toggles → no console errors
- [ ] Update PRD.md checkboxes and AGENT_LOG.md with WS20 closed entry

**Acceptance:** Dark mode is clean. All transitions use the spring easing contract. Zero console errors on load.

---

## Key Constraints (Read Before Any Phase)

1. **No phone layout on desktop.** Desktop keeps two-pane layout, KPI bar, and multi-view switcher. Only borrow geometry discipline and token system.
2. **No logic changes in structural phases.** Phases 1–3 are CSS/HTML shell only. Do not touch `.js` files or module logic during layout work.
3. **GAS CSS size limit.** Never exceed 500 lines of CSS in any single `<style>` block — GAS HtmlService may ignore it. Add to existing partials or create a new `_styles_desktop_shell.html` if needed.
4. **Token-first.** Every new pixel value introduced must first be considered as a CSS variable. If it will be reused in 2+ places, it becomes a token in `_styles_base.html`.
5. **Smoke test after each phase.** Do not advance to the next phase with a failing smoke test.
6. **Floating widgets are acceptable if anchored.** Brief, Cal, and Calc widgets can remain — but they should be anchored to a consistent trigger zone (Phase 2 action cluster) rather than scattered.

---

## File Map (WS20 Scope Only)

| File | Role in WS20 | Phase |
|---|---|---|
| `src/_styles_base.html` | Add desktop shell geometry tokens | 1, 6 |
| `src/_styles_glassflow_core.html` | Source of benchmark geometry values | 1 |
| `src/_styles_layout.html` | Rewrite `.top-nav`, workspace layout | 1, 2, 3, 5 |
| `src/_styles_ui_core.html` | Update `.nav-brand`, filter dock, modal sizing | 2, 4 |
| `src/_styles_panels.html` | Panel geometry for new container | 3, 4 |
| `src/WebApp.html` | Restructure header markup (lines 118–208), wrap workspace | 2, 3 |
| `src/_module_tabs.html` | Review Hub desktop validation | 4 |
| `src/_module_admin.html` | Admin section desktop validation | 4 |
| `src/_styles_gantt.html` | Gantt fit in new shell | 5 |
| `src/_styles_deck.html` | Deck fit, presentation mode breakout | 5 |

---

## Token Decisions
> Fill this in during Phase 1 execution.

| Token | Value | Rationale |
|---|---|---|
| `--desktop-shell-inset` | `16px` | Slightly larger than mobile's 12px — more breathing room on wide screens |
| `--desktop-shell-radius` | `16px` | Less rounded than mobile's 24px — preserves desktop density feel |
| `--desktop-shell-shadow` | `0 4px 24px rgba(0,0,0,0.08)` | Softer than mobile's `0 8px 32px` — desktop surface is larger, shadow should recede |
| `--desktop-shell-shadow` (dark) | `0 4px 32px rgba(0,0,0,0.36)` | Stronger in dark mode to maintain depth on near-black bg |
| `--desktop-easing` | `cubic-bezier(0.16, 1, 0.3, 1)` | Same spring contract as GlassFlow — consistent feel across shells |
| `--transition-spring` | `280ms cubic-bezier(0.16, 1, 0.3, 1)` | Slightly faster than mobile (300ms) — desktop interactions feel snappier |
| `--desktop-header-height` | `56px` (provisional) | Placeholder; Phase 2 will calibrate after header refactor |

---

## Handoff Notes for Any Agent

- Read `CLAUDE.md` and `PRD.md` first.
- The mobile benchmark lives in `src/v2_shell_GlassFlow.html` (shell markup) and `src/_styles_glassflow_core.html` (shell CSS). Read both before starting Phase 1.
- The desktop shell entry point is `src/WebApp.html`. All desktop HTML lives here. CSS is split across the `_styles_*.html` partials.
- GAS does not have a local dev server. All validation requires a deployed GAS web app URL. Automation testing uses `scripts/agent_automation/` (see `CLAUDE.md` for Playwright loop pattern).
- Do not edit `_module_legacy_core.html` — it is a deprecation target.
- Do not edit `.js` backend files during visual phases (1–5).
- Context budget: start a new chat after Phase 3 or at turn 20.
