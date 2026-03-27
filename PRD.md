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
- [ ] Animation frame audit (prevent layout shifts during transitions)
- [ ] Virtual scroll evaluation for 500+ items
- [ ] Canvas-based sparkline evaluation for Grid mode

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
