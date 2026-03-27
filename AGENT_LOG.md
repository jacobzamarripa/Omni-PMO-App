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

