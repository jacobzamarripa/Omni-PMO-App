# PRD.md — Omni PMO App

> Workstream progress tracker. Update checkboxes as phases complete.
> Mirror to Obsidian at: 01_Projects/Omni PMO App/OmniPMO_PRD.md

---

## Workstream 10 — Mobile Feature Parity + Shared Rendering Architecture

- [x] Phase 1 — Gantt quick peek (slide-up sheet + drag dismiss)
- [x] Phase 2 — Gemini on mobile (draft, AI peek, save note)
- [x] Phase 3 — Shared utility partials (DRY pass)
- [x] Phase 4 — Queue view modes (List + Grid)
- [x] Phase 5 — KPI HUD strip
- [x] Phase 6 — Critical Hub
- [x] Phase 7 — Changelog / Review Hub
- [x] Phase 8 — Deck workspace
- [x] Phase 9 — State contract alignment
- [x] Phase 10 — Shared rendering primitives

---

## Workstream 11 — Visual Redesign Pass

- [x] Flag badge class reconciliation (queue-flag/detail-flag → flag-badge)
- [x] Transition standardization (150–200ms across all interactive elements)
- [x] Drill-down slide animation (Queue → Detail)
- [x] Typography upgrade (Fira Code for FDH / technical value fields)
- [x] 3-level card surface depth (dark mode tokens)
- [x] Digest chart depth (proportional fill bars with gradient treatment)
- [ ] `_render_queue_card.html` cutover to WebApp.html ⛔ deferred — desktop architecture requires dedicated WS

---

## Workstream 12 — Single Responsive Surface

- [x] Phase 1 — Breakpoint tokens + routing cleanup (`_styles_base.html`, `02_Utilities.js`)
- [x] Phase 2 — Phone layout stacking (`_styles_layout.html`)
- [x] Phase 3 — Bottom tab navigation (`WebApp.html`, `_styles_layout.html`, `_module_router.html`)
- [x] Phase 4 — Touch targets + compact header (`_styles_components.html`, `_styles_layout.html`)
- [x] Phase 5 — Gantt landscape / portrait placeholder (`_styles_gantt.html`, `_module_gantt.html`)
- [x] Phase 6 — Grid hide + detail/admin scroll audit
- [x] Phase 7 — Archive mobile files + routing cleanup (`02_Utilities.js`, CLAUDE.md)
- [x] Phase 8 — Executive Glass & Spring Transition Refit
- [x] Phase 9 — Apple-Style Responsive Refit (Floating Header, Polymorphic Dock, Standalone Panels)

---

## Workstream 13 — High-Density Performance & Animation Audit

- [x] Optimized string-based rendering for Project Queue
- [x] Debounced search handlers for high-frequency input
- [x] CSS `content-visibility` for off-screen list performance
- [x] Animation frame audit (prevent layout shifts during transitions)
- [x] Virtual scroll evaluation for 500+ items
- [x] Canvas-based sparkline evaluation for Grid mode

---

## Workstream 14 — Stability-First Modularization

- [x] Phase 0 — Audit + ownership map (`MODULARIZATION_AUDIT.md`)
- [x] Phase 1 — Complete state ownership (`_state_payload.html`, `_state_analytics.html`, `_state_ui_shell.html`)
- [x] Phase 2 — Shared helper/token ownership (`_utils_ui_tokens.html`, helper remnant purge)
- [x] Phase 3 — Feature island extraction (`_module_critical_hub.html`, `_module_grid.html`, `_module_review_actions.html`, `_module_quick_peek.html`)
- [x] Phase 4 — Reduce `_module_webapp_core.html` to bootstrap/app-shell orchestration
- [x] Phase 5 — Purge ghost modularization remnants and finalize docs
- [x] Phase 6 — Live orchestration extraction (`applyFilters`, `openPane`, HUD renderers)
- [x] Phase 7 — Residual orchestration split (`updateRefDataIndicator`, startup UI handlers, remaining core-only UI plumbing)
- [x] Phase 8 — Post-modularization hardening (runtime smoke + ownership audit + dead-code trim)

---

## Workstream 15 — Naming Realignment ✅ Complete

- [x] Phase 1 — Full rename: DPA → Omni PMO App (directory, 8 files, GitHub, GAS title, Obsidian)

---

## Workstream 16 — Mobile Native Redesign

> **Status:** Archived as historical design context. Active mobile shell work moved to `WORKSTREAM_18_GLASSFLOW_PANEL_REFINEMENT.md`.
> **Archived design spec:** `_docs_archive/workstream_16/WORKSTREAM_16_NATIVE_DESIGN.md`
> **Archived validation matrix:** `_docs_archive/workstream_16/WORKSTREAM_16_VALIDATION_MATRIX.md`
> **Archived V2 experiment brief:** `_docs_archive/workstream_16/WORKSTREAM_16_MOBILE_V2_EXPERIMENT.md`
> **Archived setup docs:** `_docs_archive/workstream_16/`
> **Philosophy:** Mobile is not the desktop app scaled down. It is a purpose-built native surface sharing the same data layer, routing contract, and state model. Target: intuitive, iOS-native UX feel.

- [x] Phase 0 — Mobile debt audit + salvage map
- [x] Phase 1 — Shell contract reset (viewport zones, nav model, z-index) → `_docs_archive/workstream_16/WORKSTREAM_16_PHASE1_CONTRACT.md`
- [x] Phase 2 — Remove WS12 legacy surfaces; scaffold `#mobile-rail`
- [x] Phase 3 — Queue↔detail switching mechanism (`body.mobile-detail-open` CSS pattern)
- [x] Phase 4 — Mobile design tokens + rail polish (icon-only rail, `--m-*` tokens, `#mobile-back-btn` nav bar, startup skip)
- [x] Phase 5 — Native queue list (iOS 2-line rows, large nav title, hidden density elements)
- [x] Phase 6 — Native detail layout (hero header, stacked sections, hidden dock/strip)
- [x] Phase 7 — Admin bottom sheet (`.outbox-pane` as sliding sheet at `≤480px`)
- [x] Phase 8 — Filter bottom sheet (`.smart-dock` as sheet behind `body.mobile-filter-open`)
- [x] Phase 9 — View transitions (CSS push/pop animation for queue↔detail; fixes queue auto-open bug)
- [x] Phase 10 — Gantt mobile (auto-show full-screen in landscape; no rail button; restore on portrait)
- [ ] Phase 11 — Cross-device validation matrix → `_docs_archive/workstream_16/WORKSTREAM_16_VALIDATION_MATRIX.md`
- [x] Phase 12 — Remove Grid from mobile; queue-first startup hardening
- [x] Phase 13 — Mobile contextual floating dock (`#mobile-dock`)
- [x] Phase 14 — Mobile detail breathing room + action migration to dock
- [x] Phase 15 — Search/Filter unified slide-up sheet (`#mobile-sf-sheet`)

---

## Workstream 17 — Desktop Context Dock

> **Plan:** `_docs_archive/workstream_17/WORKSTREAM_17_DESKTOP_CONTEXT_DOCK.md`
> **Philosophy:** Shrink the dock, not the capability.

- [x] Phase 0 — Research + desktop direction
- [x] Phase 1 — Dock contract + surface design
- [x] Phase 2 — Markup refactor
- [x] Phase 3 — Interaction wiring
- [x] Phase 4 — Contextual choreography
- [x] Phase 5 — Collision hardening
- [x] Phase 6 — Final polish + signoff

---

## Workstream 18 — GlassFlow Panel-by-Panel Refinement ✅ Phases 1-5 Complete

> **Plan:** `WORKSTREAM_18_GLASSFLOW_PANEL_REFINEMENT.md`
> **Philosophy:** Contextual dock, creative interior. One panel at a time to completion before moving on.

- [x] Phase 1 — Queue + contextual dock foundation
- [x] Phase 2 — Detail card + contextual dock
- [x] Phase 3 — Admin panel + contextual dock
- [x] Phase 4 — Gantt + contextual dock
- [x] Phase 5 — Filters & search unification
- [x] Phase 6 — Dock Cleanup & Contextual Synchronization

---

## Workstream 19 — Review Hub Reimagination

> **Plan:** `WORKSTREAM_19_REVIEW_HUB_REIMAGINATION.md`
> **Philosophy:** Ground-up redesign. High tactile density. Mobile-native interaction.
> **Status:** Active — keep WS19 open for follow-on refinement and live visual validation.

- [x] Phase 1 — Spatial Refactoring
- [x] Phase 2 — Admin Hub Re-reimagined
- [x] Phase 3 — Reviewed Hub Visual Distinction
- [x] Phase 4 — Activity Hub Extreme Compaction
- [ ] Phase 5 — Native-language polish, live visual tuning, and smoke validation
