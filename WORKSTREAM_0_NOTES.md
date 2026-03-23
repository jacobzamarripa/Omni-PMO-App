// ============================================================
// FILE: WORKSTREAM_0_NOTES.md
// ROLE: Checkpoint note describing Workstream 0 foundation changes, preserved assumptions, and handoff state for Workstream 1.
// DEPENDS ON: _registry.html, 02_Utilities.js, WebApp.html, CLAUDE.md
// DEPENDED ON BY: Engineers and agents validating the staged refactor sequence.
// MOBILE NOTES: Notes the GAS-specific route and bridge assumptions preserved at the foundation layer.
// AGENT NOTES: Read this after CLAUDE.md to understand what was intentionally changed, what was left untouched, and what is next.
// ============================================================

# Workstream 0 Checkpoint
> Last updated: March 21, 2026
> Workstream 1 complete March 21, 2026. CSS extracted, JS tagged, 19 data calls inventoried. Next: Workstream 2 state isolation.
> Workstream 1 closeout note: `02_Utilities.js` required a `createHtmlOutputFromFile('WebApp')` to `createTemplateFromFile('WebApp').evaluate()` fix so `<?!= include() ?>` directives in `WebApp.html` would process correctly.
> Workstream 2 complete March 21, 2026. Full `WebApp.html` state inventory mapped, consumer dependencies documented, and inline extraction-risk tags added. Next: Workstream 3 sequenced module extraction.
> Workstream 3 complete March 21, 2026. Low-risk modules extracted, queue/router/session state owners grouped in `WebApp.html`, and high-risk extractions deferred to Workstream 4.
> Workstream 4 complete March 21, 2026. Queue/router/session state owners extracted to dedicated partial files, include order updated, and smoke tests passed after each phase. Next: Workstream 5 high-risk module extractions.
> Workstream 5 complete March 21, 2026. High-risk modules extracted with smoke tests passed after each phase; `_module_tabs.html` deferred, `_module_gantt.html` partially extracted, and `WebApp.html` reduced to bootstrap anchors plus remaining shared runtime.
> Workstream 6 complete March 21, 2026. Router isolation and tabs extraction landed, pre-existing UI bugs were resolved, and the desktop FAB dropdown shipped for Sync QB / Run Review / Refresh.

---

## What Was Done (Workstream 0)

### Originally completed — preserved verbatim:
- Added shared `include(filename)` helper in `02_Utilities.js`.
- Added `_registry.html` and included it first in `WebApp.html`.
- Updated `CLAUDE.md` with an initial `## File Map`.
- Left the desktop monolith intact; no function signatures, globals, or `google.script.run` names changed.
- RESOLVED March 21, 2026: `doGet(view=codex)` reference to `CodexMobileApp` retired in place because that surface is not present in this workspace.

### Additional work completed as of March 21, 2026:
- `CLAUDE.md` File Map expanded to full agent navigation index with Agent Notes, Mobile Notes, and Agent Quick Reference table.
- `MobileApp.html` routing from `doGet()` confirmed working.
- `05_CDAnalyzer.js` Gemini calls confirmed working.
- `06_QBSync.js` QB writeback guard confirmed intact — CSV export path only, no direct QB writes.
- `_registry.html` confirmed loaded and functional.

---

## Confirmed Working Post-Workstream 0
- `_registry.html` — loaded first in `WebApp.html`, data-layer boundaries declared
- `MobileApp.html` — routing from `doGet()` confirmed
- `05_CDAnalyzer.js` — Gemini calls working
- `06_QBSync.js` — writeback guard intact

---

## Known Issues Carried Forward
- `WebApp.html` remains monolithic — partial extraction is Workstream 1
- Tab fullscreen bleed-through — root cause not yet isolated, do not move tab code until diagnosed

## Known Deferrals
- `_module_tabs.html` deferred — router/fullscreen orchestration and overlay layering must be resolved first. Revisit after Workstream 6 router isolation pass.
- `currentPanelTab` is still missing from `_state_router.html` — add it during the Workstream 6 router isolation pass before any tab extraction resumes.
- Auto device detection routing deferred — mobile surface requires explicit `?view=mobile` parameter. Revisit in Workstream 8 using a server-side user-agent approach or a published standalone mobile URL.

## Known UI Bugs (Pre-Existing)
- Admin panel close button — RESOLVED. Fixed via absolute positioning on `.panel-tab-close` in `_styles_components.html`. Minor cosmetic note: X button overlaps the Activity tab at narrow viewports — accepted for now.
- Hamburger menu visible on desktop — RESOLVED. Fixed via compound selector `.btn-icon.mobile-menu-toggle { display: none }` in `_styles_layout.html` beating the `.btn-icon` override.
- Dark mode icon missing on initial load — RESOLVED. Fixed by removing `getEl()` dependency from `applyTheme()` and adding a `DOMContentLoaded` guard in `_module_theme_controls.html`, plus bootstrap re-apply at the end of `initDashboard()` in `WebApp.html`.

---

## Data Call Inventory
> Current `WebApp.html` contains 19 live `google.script.run` occurrences as of March 21, 2026. The nested post-sync refresh inside `triggerQBSync()` is documented separately because it has a different extraction blocker than the outer sync call.

### askGeminiForQuickPeek
- `DATA CALL:` `askGeminiForQuickPeek`
- `COUPLED TO:` `currentActiveItem`, `allActionItems`, Gantt quick-peek panel, current item comment/Gemini fields, draft button state
- `EXTRACT BLOCKER:` Active-item ownership and quick-peek UI updates must be isolated from Gantt state first

### saveQuickPeek
- `DATA CALL:` `saveQuickPeek`
- `COUPLED TO:` `currentActiveItem`, `pmSessionMemory`, dock system UI, quick-peek textarea sync
- `EXTRACT BLOCKER:` Deck/save state adapters and dock feedback helpers still live in shared runtime state

### triggerQBSync
- `DATA CALL:` `triggerQBSync`
- `COUPLED TO:` `btn-qb-sync`, frosted loader, `globalRefDataDate`, ref-data badge UI, confirm flow
- `EXTRACT BLOCKER:` Sync orchestration state is still mixed with button/loading UI and mirror-date ownership

### triggerQBSync post-sync refresh
- `DATA CALL:` `triggerQBSync post-sync refresh`
- `COUPLED TO:` `initDashboard`, `btn-qb-sync`, frosted loader, startup overlay, run-review prompt
- `EXTRACT BLOCKER:` `initDashboard()` remains the bootstrap contract for all views

### executeRunReview
- `DATA CALL:` `executeRunReview`
- `COUPLED TO:` `btn-run-review`, frosted loader, target-date modal flow, `initDashboard`
- `EXTRACT BLOCKER:` Review-run orchestration and dashboard bootstrap are not isolated from the bridge

### triggerUIRefresh
- `DATA CALL:` `triggerUIRefresh`
- `COUPLED TO:` `btn-refresh`, frosted loader, `initDashboard`, toast feedback
- `EXTRACT BLOCKER:` Refresh UI orchestration still depends on bootstrap re-render ownership

### verifyXingFromAdmin
- `DATA CALL:` `verifyXingFromAdmin`
- `COUPLED TO:` `allActionItems`, `currentActiveItem`, reviewed tray, admin pane, `applyFilters()`, `advanceAfterAction()`, `p-last-check`
- `EXTRACT BLOCKER:` Crossings actions still mutate queue/detail/admin/reviewed state through the central owner

### markQbUpdatedFromAdmin
- `DATA CALL:` `markQbUpdatedFromAdmin`
- `COUPLED TO:` `allActionItems`, `currentActiveItem`, reviewed tray, admin pane, `applyFilters()`, `advanceAfterAction()`
- `EXTRACT BLOCKER:` Status-sync actions still mutate shared queue/detail/admin state and reviewed-tray flow

### commitStagedCrossings
- `DATA CALL:` `commitStagedCrossings`
- `COUPLED TO:` admin commit button state, toast/alert UI, admin pane render, active queue snapshot
- `EXTRACT BLOCKER:` Staged-crossing admin workflow needs an isolated admin state adapter first

### markChecked
- `DATA CALL:` `markChecked`
- `COUPLED TO:` `btn-admin-check`, `currentActiveItem`, queue card tags, detail pane tags, `p-last-check`
- `EXTRACT BLOCKER:` Detail and queue DOM mutation is interleaved with active-item state ownership

### markQbUpdated
- `DATA CALL:` `markQbUpdated`
- `COUPLED TO:` `btn-qb-update`, `currentActiveItem`, queue card tags, detail pane tags
- `EXTRACT BLOCKER:` Status-tag mutation spans queue and detail surfaces that still depend on shared item state

### window.onload initial dashboard load
- `DATA CALL:` `window.onload initial dashboard load`
- `COUPLED TO:` boot timeout state, splash/welcome/detail panes, `initDashboard`, pane-content error UI
- `EXTRACT BLOCKER:` Bootstrap contract for all views must be isolated before moving the initial payload call

### window.onload Gemini usage badge load
- `DATA CALL:` `window.onload Gemini usage badge load`
- `COUPLED TO:` `gemini-badge` DOM, `updateGeminiBadge()`, startup load flow
- `EXTRACT BLOCKER:` Badge DOM ownership remains embedded in the shared bootstrap/runtime layer

### promptEmailExport
- `DATA CALL:` `promptEmailExport`
- `COUPLED TO:` `committedItems` reviewed tray, `btn-export-all`, `clearReviewedTray()`, alert/prompt UI
- `EXTRACT BLOCKER:` Reviewed-tray ownership and export side effects must be separated from outbox UI state

### askGeminiForDraft
- `DATA CALL:` `askGeminiForDraft`
- `COUPLED TO:` `currentActiveItem`, `p-comment`, `p-gemini-date`, draft button state, item Gemini fields
- `EXTRACT BLOCKER:` Detail-pane DOM writes and active-item mutation must be isolated from the AI bridge

### askGeminiFromGrid
- `DATA CALL:` `askGeminiFromGrid`
- `COUPLED TO:` `filteredItems`, grid draft container, grid button state, item Gemini fields
- `EXTRACT BLOCKER:` Grid-card DOM writes still depend on shared filtered-item state

### promptBatchDeckExport
- `DATA CALL:` `promptBatchDeckExport`
- `COUPLED TO:` `stagedDeckItems`, `pmSessionMemory`, dock system UI, `renderDeckStage()`, `renderOutbox()`
- `EXTRACT BLOCKER:` Staged export flow still depends on deck state ownership plus reviewed/outbox side effects

### askGeminiForDraftDeck
- `DATA CALL:` `askGeminiForDraftDeck`
- `COUPLED TO:` `ensureDeckIndex()`, current deck item, `deck-note` textarea, `syncDeckNote()`, deck button state
- `EXTRACT BLOCKER:` Deck runtime owns note state and current card context, so the AI bridge cannot move cleanly yet

### saveDeckToSheet
- `DATA CALL:` `saveDeckToSheet`
- `COUPLED TO:` `ensureDeckIndex()`, current deck item, `pmSessionMemory`, dock system UI, deck save flow
- `EXTRACT BLOCKER:` Save path still depends on central deck/session state and shared dock feedback helpers

---

## Workstream 1 Complete
> Completed March 21, 2026

### Scope-adjusted work completed
- Extracted CSS into `_styles_base.html`, `_styles_layout.html`, `_styles_components.html`, and `_styles_gantt.html`
- Extracted pure utility helpers into `_utils_shared.html`
- Extracted notification and dock-status helpers into `_utils_notifications.html`
- Tagged DOM-coupled utility functions in `WebApp.html` instead of extracting them
- Tagged all live frontend data-call sites in `WebApp.html` and documented them in the inventory above
- Completed Phase 4 as a tagging pass only — no feature modules were extracted because the remaining sections are still coupled to shared runtime state

### Open decisions resolved during Workstream 1
- `CodexMobileApp` route: already resolved in Workstream 0 and remains retired
- `_data_layer.html`: deferred by design; tagging pass completed instead of extraction because state ownership is not isolated
- `WebApp.html` shell: remains a mixed shell/runtime file with partial includes layered in gradually
- Phase 4 extraction scope: no module extraction performed because candidate sections still mutate shared state

### New risks / TODOs discovered
- Central runtime state is split across early workspace/deck globals and later queue/bootstrap globals, which increases extraction risk
- `initDashboard()` and `applyFilters()` remain the bootstrap contract for every major desktop view
- Gantt interactions are tightly bound to `currentActiveItem`, quick-peek DOM, dock inversion, and focus state
- Deck workspace still mutates queue/detail/admin/reviewed tray state and cannot move safely before state isolation
- Admin crossings/status actions still mutate reviewed-tray flow and shared queue/detail state

---

## Historical Workstream 1 Recommendation
- Isolate the central state layer before extracting more modules
- Define a single shared state owner for `allActionItems`, `filteredItems`, `currentActiveItem`, `pmSessionMemory`, `stagedDeckItems`, `currentWorkspaceView`, and Gantt focus/scroll state
- Move bootstrap and render orchestration behind state adapters before attempting `_data_layer.html`, admin, tabs, digest, Gantt, or deck extraction
- Treat `initDashboard()` and `applyFilters()` as the last major frontend runtime extractions after their consumers have been separated

---

## Preserved Assumptions (Do Not Override Without Deliberate Decision)

### Data Layer
- `Reference_Data` sheet is **read-only** — no frontend or engine writes to it
- `Master_Archive` is the working data layer — engine writes here via `01_Engine.js`
- `writebackQBDirect()` in `06_QBSync.js` is **guarded by early return** — guard must not be removed
- `QB_USER_TOKEN` lives in **Script Properties only** — never in frontend code or committed files
- CD Analyzer writes to its target sheet via `05_CDAnalyzer.js` only

### Engine Authority
- Tracker linkage state is computed in `01_Engine.js` — frontend reads engine output, not sheet columns
- Engine flags (`🔵 OFS`, `🟢 COMPLETE`, `⚪ ON HOLD`) must be stripped by shared frontend cleaner — not one-off inline handling
- Do not introduce parallel flag logic that duplicates what the engine already computes

### Frontend Conventions
- All CSS changes must search for existing `:root` variables first — do not duplicate classes
- `WebApp.html` and `MobileApp.html` are separate surfaces — changes on one are not assumed to work on the other
- Z-index ranges are fixed — do not add layers outside defined ranges without updating `CLAUDE.md`
- `logMsg()` in `00_Config.js` is the only approved logging method for backend — no `console.log()`
- `doGet()` routing lives in `02_Utilities.js` — any new app surface must be registered there and documented in `CLAUDE.md`

---

## Historical Workstream 1 Plan

### Goal
Decompose `WebApp.html` into named partials using `<?!= include('filename') ?>`
directives without changing any function signatures, variable names, or
`google.script.run` API surface.

### Extraction Order (Lowest → Highest Risk)

**Phase 1 — CSS (zero JS coupling)**
- `_styles_base.html` — `:root` variables, resets, typography
- `_styles_layout.html` — grid, flex, page-level containers
- `_styles_components.html` — tabs, cards, badges, buttons, modals
- `_styles_gantt.html` — Gantt-specific styles, resizable split panel

**Phase 2 — Utility JS (no DOM dependencies)**
- `_utils_shared.html` — formatters, date helpers, pure functions only
- `_utils_notifications.html` — badge logic, toasts, error display

**Phase 3 — Data Layer JS (depends on `_registry.html` only)**
- `_data_layer.html` — all `google.script.run` calls consolidated

**Phase 4 — Feature Modules (one at a time, verify after each)**
- `_module_cd_analyzer.html`
- `_module_special_crossings.html`
- `_module_qb_sync.html`
- `_module_admin.html`
- `_module_tabs.html` — do not extract until fullscreen bleed-through is diagnosed
- `_module_gantt.html` — highest risk, extract last

### Agent Rules for Workstream 1
- Do not change any function signatures, variable names, or `google.script.run` call signatures
- Add the standard file header block to every extracted partial (format in `CLAUDE.md`)
- Verify app loads and extracted feature works after each extraction before proceeding
- Flag tightly coupled global state with `// TODO: HIGH RISK` — do not refactor, leave in place
- Gantt ↔ Row Header coupling is known high-risk — extract Gantt last
- Bottom dock inverts in Gantt view — dropdown menus open upward, pills anchor above dock

### Open Decisions to Resolve During Workstream 1
- [ ] Audit which partials were already extracted — update File Map in `CLAUDE.md` before starting
- [ ] Decide whether `WebApp.html` shell becomes a thin include-only file or retains inline logic
- [ ] Diagnose tab fullscreen bleed-through before extracting `_module_tabs.html`
- [ ] Confirm Gantt resizable split scope — Workstream 1 or separate workstream?
- [ ] Resolve `CodexMobileApp` reference — stub, remove, or build?

---

## Workstream 2 Complete
> Completed March 21, 2026
> Browser smoke test passed March 21, 2026 — all major surfaces verified by user.

## Workstream 3 Complete
> Completed March 21, 2026

### Modules extracted and confirmed working
- `_module_tools_widgets.html` extracted for calculator/calendar widget runtime. User smoke test passed after Phase 1.
- `_module_changelog.html` extracted for Review Hub changelog rendering. User smoke test passed after Phase 2.
- `_module_theme_controls.html` extracted for dark-mode/theme toggle runtime. User smoke test passed after Phase 2.

### State owner blocks introduced in `WebApp.html`
- `QUEUE STATE OWNER`
  Future home: `_state_queue.html`
  Variables grouped: `allActionItems`, `filteredItems`, `currentActiveItem`, `currentQueueIndex`, `activeFilters`, `currentGroupBy`, `currentViewMode`, `committedItems`
- `WORKSPACE ROUTER STATE OWNER`
  Future home: `_state_router.html`
  Variables grouped: `currentWorkspaceView`, `currentDetailFace`, `isDeckMode`, `deckIndex`, `currentDockPlacement`
- `SESSION & DECK STATE OWNER`
  Future home: `_state_session.html`
  Variables grouped: `pmSessionMemory`, `stagedDeckItems`, `globalRefDataDate`, `isPresentationMode`

### Notes
- Declaration relocations in Phase 3 preserved the same initializers and did not remove any runtime resets.
- No functions moved during Phase 3. The pass was grouping and comment scaffolding only.

## Workstream 4 Complete
> Completed March 21, 2026
> User smoke test passed after Phase 1, Phase 2, and Phase 3 extractions.
> Browser smoke test passed March 21, 2026 — all three state extractions verified by user across all major surfaces.

### State files extracted and confirmed working
- `_state_queue.html` extracted and confirmed working after Phase 1 smoke test
- `_state_router.html` extracted and confirmed working after Phase 2 smoke test
- `_state_session.html` extracted and confirmed working after Phase 3 smoke test

### Final include order in `WebApp.html`
1. `_registry`
2. `_styles_base`
3. `_styles_layout`
4. `_styles_components`
5. `_styles_gantt`
6. `_state_queue`
7. `_state_router`
8. `_state_session`
9. `_utils_shared`
10. `_utils_notifications`
11. `_module_tools_widgets`
12. `_module_changelog`
13. `_module_theme_controls`
14. `_module_queue_state`
15. `_module_digest`
16. `_module_admin`
17. `_module_special_crossings`
18. `_module_gantt`
19. `_module_deck`
20. main inline script

### Notes
- All three state owner blocks now live in dedicated partials and still initialize on the global `window` scope through top-level script declarations.
- `initDashboard()` and `applyFilters()` remain in `WebApp.html` as bootstrap anchors and were not moved.
- `WebApp.html` still contains the existing extraction tags and the remaining shared runtime scaffolding around the new includes.
- `_module_tabs.html` is intentionally absent from the include order because it was deferred.

### State Inventory Summary
- Total top-level variables in the main `WebApp.html` script: `84`
- Extraction safety count:
  - `Safe`: `49`
  - `Risky`: `15`
  - `Must Stay`: `20`
- Recommended Workstream 3 extraction order:
  1. Tools/widgets (`calculator`, `calendar`, widget drag/persistence)
  2. Changelog rendering
  3. Theme controls
  4. Queue state owner and filter/grouping state
  5. Workspace router shell
  6. Digest workspace
  7. Admin pane
  8. Special crossings/status actions
  9. Gantt workspace
  10. Deck/slide workspace

### Full State Inventory

| Variable | Line | Type | Initial value | Represents | Reads | Writes | Safety |
|---|---:|---|---|---|---|---|---|
| `bootInterval` | 661 | interval id | uninitialized | splash boot progress timer | startup | startup | Safe |
| `isGridMode` | 708 | boolean | `false` | whether detail shell is showing grid context | detail, grid, router | router | Risky |
| `currentGridPivot` | 714 | string | `'velocity'` | active grid metric/log mode | bootstrap, grid | bootstrap, grid, router | Must Stay |
| `currentWorkspaceView` | 722 | string | `'detail'` | active desktop workspace | router, detail, grid, gantt, critical | router, filters, navigation | Must Stay |
| `currentDetailFace` | 728 | string | `'detail'` | active face inside detail workspace | detail, deck | face toggles, router | Must Stay |
| `deckIndex` | 734 | number | `0` | active deck card index | deck | deck nav, detail/grid open | Risky |
| `isDeckMode` | 740 | boolean | `false` | whether detail workspace is in slide/deck mode | detail, deck, grid, router | router | Must Stay |
| `isDeckEditing` | 746 | boolean | `false` | whether deck card is editable | deck | deck edit toggles | Safe |
| `pmSessionMemory` | 752 | object | `{}` | saved note/review memory per item/card | quick peek, deck, export, save | deck persistence flows | Must Stay |
| `stagedDeckItems` | 758 | array | `[]` | staged reviewed/deck items for outbox/export | outbox, deck, reviewed tray | outbox, deck, reviewed tray | Must Stay |
| `deckPrevPivot` | 764 | string | `'velocity'` | grid pivot to restore after deck mode | router | router | Safe |
| `isPresentationMode` | 770 | boolean | `false` | theater/presentation mode state | deck theme, dock, gantt shell | presentation toggles | Risky |
| `deckIdleTimer` | 776 | timeout id/null | `null` | deck idle timer for cinema mode | deck | deck idle reset | Safe |
| `activePieStageFilter` | 782 | string/null | `null` | active projects/BSL HUD stage filter | HUDs, pills, filters | HUD controls, filters | Risky |
| `activeFilters` | 788 | object | `{ sev/vendor/city/ofs/status }` | queue filter selections | queue, pills, filter UI | filters reset/recompute | Must Stay |
| `openDropdownId` | 794 | string/null | `null` | currently open filter dropdown | filter UI | filter UI | Safe |
| `CHANGELOG_PULSE_SESSION_KEY` | 800 | string | `'changelogPulseSeen'` | changelog pulse session key | changelog, bootstrap | none | Safe |
| `STAGED_REVIEW_SESSION_KEY` | 806 | string | `'dpa.stagedReviewItems.v1'` | staged review storage key | outbox persistence | none | Safe |
| `STAGED_REVIEW_COLLAPSED_SESSION_KEY` | 812 | string | `'dpa.stagedReviewCollapsed.v1'` | staged review collapse key | outbox persistence | none | Safe |
| `GANTT_VIEW_SCROLL_SESSION_KEY` | 818 | string | `'dpa.ganttScroll.v1'` | gantt scroll session key | gantt session | none | Safe |
| `GANTT_VIEW_FOCUS_SESSION_KEY` | 824 | string | `'dpa.ganttFocus.v1'` | gantt focus session key | gantt session | none | Safe |
| `GROUP_BY_SESSION_KEY` | 830 | string | `'dpa.queueGroupBy.v1'` | queue group-by session key | queue grouping | none | Safe |
| `GROUP_COLLAPSE_SESSION_KEY` | 836 | string | `'dpa.queueGroupCollapse.v1'` | queue group collapse key | queue grouping | none | Safe |
| `GROUP_BY_OPTIONS` | 842 | array | `['none', ...]` | allowed queue grouping modes | queue grouping | none | Safe |
| `pendingFaceAnimation` | 848 | object/null | `null` | pending detail/deck face animation state | face transitions | face transitions | Safe |
| `preferredPresentationCardTheme` | 854 | string/null | `null` | preferred theme for presentation card | deck theme | deck theme | Safe |
| `isStagedReviewCollapsed` | 860 | boolean | `false` | whether reviewed tray is collapsed | outbox | outbox toggle/persist | Safe |
| `currentDockPlacement` | 866 | string | `'top'` | dock location used by layout and gantt | dock, gantt | dock sync | Risky |
| `ganttHasMounted` | 872 | boolean | `false` | whether gantt DOM has mounted | gantt lifecycle | gantt lifecycle | Safe |
| `ganttNeedsRender` | 878 | boolean | `true` | whether gantt needs rerender | gantt lifecycle | gantt lifecycle, filters | Risky |
| `ganttFocusedFdh` | 884 | string/null | `null` | focused gantt project FDH | gantt, filters | gantt focus/open | Risky |
| `ganttScrollState` | 890 | object | `{ top: 0, left: 0 }` | saved gantt viewport | gantt | gantt open/restore | Risky |
| `ganttHasVisited` | 896 | boolean | `false` | whether user has entered gantt before | gantt, filters | gantt lifecycle | Risky |
| `currentGroupBy` | 902 | string | session value / `'none'` | active queue grouping mode | queue, filters, bootstrap | grouping controls | Must Stay |
| `queueGroupCollapseState` | 915 | object | session object / `{}` | collapsed queue sections by group | queue grouping | queue grouping | Safe |
| `setHtml` | 1410 | function ref | arrow fn | DOM helper for `innerHTML` | bootstrap, queue, detail, gantt | none | Safe |
| `setTxt` | 1416 | function ref | arrow fn | DOM helper for `innerText` | queue, admin, outbox | none | Safe |
| `setStyle` | 1422 | function ref | arrow fn | DOM helper for inline styles | bootstrap, detail | none | Safe |
| `setVal` | 1428 | function ref | arrow fn | DOM helper for input values | forms/reset helpers | none | Safe |
| `getEl` | 1434 | function ref | arrow fn | DOM lookup helper | all desktop surfaces | none | Safe |
| `previousDockState` | 1699 | array | `[]` | remembered dock collapse state | dock restore | dock restore | Safe |
| `_VIEW_MODES` | 2232 | array | `['inbox','list','grid']` | queue view mode options | queue view controls | none | Safe |
| `currentViewMode` | 2238 | string | localStorage / `'inbox'` | active queue view mode | queue rendering, chrome | queue view controls | Must Stay |
| `currentPanelTab` | 2271 | string | `'admin'` | active outbox/admin panel tab | admin/outbox shell | tab controls | Safe |
| `allGlobalLogs` | 2277 | array | `[]` | global changelog payload | changelog, digest, grid, history | bootstrap payload load | Must Stay |
| `hudLocked` | 2569 | boolean | `false` | lock state for gantt HUD | gantt HUD | gantt HUD | Safe |
| `_SUN_SVG` | 2600 | string | `'<svg...>'` | light mode icon markup | theme UI | none | Safe |
| `_MOON_SVG` | 2606 | string | `'<svg...>'` | dark mode icon markup | theme UI | none | Safe |
| `_SLIDE_SVG` | 2612 | string | `'<span...>'` | slide icon markup | workspace chrome | none | Safe |
| `_sysDark` | 2629 | `MediaQueryList` | `matchMedia(...)` | system dark-mode preference handle | theme init/listener | none | Safe |
| `_filterDebounce` | 2640 | timeout id | uninitialized | debounced search timer | search filter | search input | Safe |
| `_filterInput` | 2646 | element/null | `getEl('search-input')` | cached search input element | search filter | none | Safe |
| `frostedInterval` | 2659 | interval id | uninitialized | frosted loader animation interval | loader | loader | Safe |
| `DIGEST_STAGE_ORDER` | 2904 | array | `['permitApproved', ...]` | digest stage display order | digest | none | Safe |
| `DIGEST_STAGE_META` | 2910 | object | stage meta map | digest stage labels/colors | digest | none | Safe |
| `DIGEST_MAP_BOUNDS` | 2922 | object | national bounds | digest map projection bounds | digest | none | Safe |
| `DIGEST_STATE_BOUNDS` | 2928 | object | state bounds map | digest scoped map bounds | digest | none | Safe |
| `REVIEWED_TRAY_STORAGE_KEY` | 4221 | string | `'dpa.reviewedTray.v1'` | reviewed tray persistence key | reviewed tray | none | Safe |
| `allActionItems` | 4254 | array | `[]` | full dashboard action-item payload | queue, detail, grid, gantt, digest, admin, deck | bootstrap and mutation flows | Must Stay |
| `committedItems` | 4254 | array | `[]` | reviewed tray / committed queue items | outbox, export, reviewed tray | reviewed tray flows | Must Stay |
| `currentActiveItem` | 4254 | object/null | `null` | currently selected project/item | detail, admin, gantt, deck, quick peek | queue/grid/gantt/admin/deck selection | Must Stay |
| `globalHeaders` | 4254 | array | `[]` | raw data header list for detail/raw views | detail/raw data | bootstrap payload load | Must Stay |
| `globalEndCounts` | 4254 | object | `{}` | gantt end counts for HUD metrics | gantt HUD | renderGantt | Must Stay |
| `globalTodayData` | 4254 | object | `{ total/vendors/... }` | gantt today/HUD aggregate snapshot | gantt HUD | renderGantt | Must Stay |
| `currentFilterStats` | 4260 | object | stats skeleton | computed BSL/project filter aggregates | HUDs, filters | applyFilters/HUD recompute | Must Stay |
| `filteredItems` | 4271 | array | `[]` | active queue after filters | queue, detail, grid, gantt, deck | applyFilters and selection flows | Must Stay |
| `currentQueueIndex` | 4271 | number | `-1` | active queue/deck position | queue/deck nav | selection helpers | Risky |
| `globalRefDataDate` | 4277 | string | `""` | reference-data sync timestamp | ref badge, deck | QB sync, bootstrap | Must Stay |
| `globalAllFdhIds` | 4283 | array | `[]` | global FDH id list for search/datalist | bootstrap, smart datalist | bootstrap payload load | Risky |
| `currentCriticalHubItems` | 4289 | array | `[]` | filtered critical hub items | critical hub | applyFilters | Risky |
| `acknowledgedCriticalFdhs` | 4295 | array | `[]` | acknowledged critical FDHs | critical hub | applyFilters, critical hub actions | Risky |
| `criticalHubState` | 4301 | object | `{ market/vendor/type/... }` | critical hub filter/sort state | critical hub | critical hub controls | Must Stay |
| `activeAdminFilter` | 4356 | string/null | `null` | active admin task filter | admin pane, filters | admin controls, applyFilters | Risky |
| `startupTimer` | 4362 | timeout id | uninitialized | startup selector countdown timer | startup selector | startup selector | Safe |
| `startupCountdown` | 4368 | number | `6` | startup selector countdown seconds | startup selector | startup selector | Safe |
| `QB_STYLES` | 4375 | object | style map | shared QB visual tokens | gantt, detail, velocity bars | none | Safe |
| `bslsHudLocked` | 6444 | boolean | `false` | BSL HUD lock state | BSL HUD | BSL HUD controls | Safe |
| `projectsHudLocked` | 6450 | boolean | `false` | projects HUD lock state | projects HUD | projects HUD controls | Safe |
| `preTheaterThemeWasDark` | 7063 | boolean | `false` | prior theme before presentation mode | deck theme | presentation mode | Safe |
| `CALC_WIDGET_SESSION_KEY` | 7585 | string | `'calcWidgetPosition'` | calculator position key | calculator widget | none | Safe |
| `CALC_WIDGET_VIEWPORT_MARGIN` | 7591 | number | `20` | calculator clamp margin | calculator widget | none | Safe |
| `calcWidgetDragState` | 7597 | object/null | `null` | calculator drag state | calculator widget | calculator widget | Safe |
| `currentCalDate` | 7758 | `Date` | `new Date()` | current calendar month | calendar widget | calendar widget | Safe |
| `calcState` | 7782 | string | `''` | calculator expression/result state | calculator widget | calculator widget | Safe |

## State Consumer Map

<details>
<summary><code>isGridMode</code></summary>

- Reads: `openPane()` line `5570`, `renderGrid()` line `6149`, `switchWorkspaceView()` line `6863`
- Writes: `syncWorkspaceModeState()` line `1010`
- `google.script.run` callbacks: none directly
- Co-locate with: `currentGridPivot`, `currentWorkspaceView`

</details>

<details>
<summary><code>currentGridPivot</code></summary>

- Reads: render path is effectively owned by `renderGrid()` line `6149` and bootstrap visibility logic in `initDashboard()` line `4477`
- Writes: `initDashboard()` line `4477`, `updateGridPivot()` line `6138`, `renderGrid()` line `6149`, `switchWorkspaceView()` line `6863`
- `google.script.run` callbacks: `window.onload initial dashboard load`, `askGeminiFromGrid`
- Co-locate with: `currentViewMode`, `allGlobalLogs`, `filteredItems`, `currentWorkspaceView`

</details>

<details>
<summary><code>currentWorkspaceView</code></summary>

- Reads: `renderDetailWorkspaceFace()` line `1073`, `animateDockFaceShift()` line `1185`, `syncGanttViewportLayout()` line `1719`, `handleGanttClick()` line `1897`, `handleGanttLabelClick()` line `1926`
- Writes: `isSlideFaceActive()` line `924`, `syncWorkspaceModeState()` line `1010`, `syncWorkspaceChrome()` line `1021`, `syncDockPlacementState()` line `1196`, `syncRawDataStripState()` line `1210`, `syncSlideActionDeck()` line `1222`, `syncDockClearanceState()` line `1592`, `getActiveSortValue()` line `1674`, `syncGanttIslandState()` line `1839`, `applyFilters()` line `4619`, `navigateFromCriticalHub()` line `4913`, `openPane()` line `5570`, `updateGridPivot()` line `6138`, `openPaneFromGrid()` line `6404`, `switchWorkspaceView()` line `6863`, `navGlobal()` line `7012`
- `google.script.run` callbacks: indirectly touched by `window.onload initial dashboard load`, `triggerQBSync post-sync refresh`, `executeRunReview`, `triggerUIRefresh`
- Co-locate with: `currentDetailFace`, `isDeckMode`, `deckIndex`, `ganttFocusedFdh`, `ganttScrollState`, `ganttHasVisited`

</details>

<details>
<summary><code>currentDetailFace</code></summary>

- Reads: face checks are centralized through `isSlideFaceActive()` line `924`
- Writes: `isSlideFaceActive()` line `924`, `toggleDetailFace()` line `1114`, `switchWorkspaceView()` line `6863`
- `google.script.run` callbacks: none directly
- Co-locate with: `currentWorkspaceView`, `isDeckMode`, `deckIndex`

</details>

<details>
<summary><code>deckIndex</code></summary>

- Reads: `updateDeckStageSelection()` line `6853`
- Writes: `renderDetailWorkspaceFace()` line `1073`, `openPaneFromGrid()` line `6404`, `ensureDeckIndex()` line `6842`, `navDeck()` line `6949`, `navGlobal()` line `7012`
- `google.script.run` callbacks: `askGeminiForDraftDeck`, `saveDeckToSheet`
- Co-locate with: `isDeckMode`, `stagedDeckItems`, `pmSessionMemory`, `filteredItems`

</details>

<details>
<summary><code>isDeckMode</code></summary>

- Reads: `syncWorkspaceChrome()` line `1021`, `renderDetailWorkspaceFace()` line `1073`, `toggleDetailFace()` line `1114`, `getActivePresentationCard()` line `1130`, `syncGanttIslandState()` line `1839`, `applyFilters()` line `4619`, `openPane()` line `5570`, `renderGrid()` line `6149`, `openPaneFromGrid()` line `6404`, `switchWorkspaceView()` line `6863`, `navGlobal()` line `7012`, `togglePresentationMode()` line `7064`
- Writes: `syncWorkspaceModeState()` line `1010`
- `google.script.run` callbacks: `promptBatchDeckExport`, `askGeminiForDraftDeck`, `saveDeckToSheet`
- Co-locate with: `currentWorkspaceView`, `currentDetailFace`, `deckIndex`, `pmSessionMemory`, `stagedDeckItems`

</details>

<details>
<summary><code>pmSessionMemory</code></summary>

- Reads: `saveQuickPeek()` line `2098`, `promptBatchDeckExport()` line `6762`, `navDeck()` line `6949`, `renderDeckStage()` line `7134`, `saveCurrentCardState()` line `7425`, `persistDeckInput()` line `7435`, `exportDeckReport()` line `7492`, `saveDeckToSheet()` line `7550`
- Writes: `saveCurrentCardState()` line `7425`, `persistDeckInput()` line `7435`, `syncDeckNote()` line `7444`
- `google.script.run` callbacks: `saveQuickPeek`, `promptBatchDeckExport`, `saveDeckToSheet`
- Co-locate with: `stagedDeckItems`, `deckIndex`, `currentActiveItem`, `isDeckMode`

</details>

<details>
<summary><code>stagedDeckItems</code></summary>

- Reads: `persistStagedReviewSession()` line `2283`, `getStagedReviewItems()` line `2319`, `syncDockStagingButton()` line `6745`, `renderDeckStage()` line `7134`
- Writes: `loadStagedReviewSession()` line `2289`, `reconcileStagedReviewItems()` line `2300`, `renderOutbox()` line `5943`, `clearStagedDeckItems()` line `6698`, `moveItemToReviewed()` line `6706`, `toggleStageCurrentDeckItem()` line `6719`, `promptBatchDeckExport()` line `6762`
- `google.script.run` callbacks: `promptBatchDeckExport`
- Co-locate with: `pmSessionMemory`, `committedItems`, `deckIndex`, `filteredItems`

</details>

<details>
<summary><code>isPresentationMode</code></summary>

- Reads: `syncActivePresentationCardTheme()` line `1156`, `animateDockFaceShift()` line `1185`, `syncSlideActionDeck()` line `1222`, `syncGanttIslandState()` line `1839`, `toggleSlideSpecificTheme()` line `6968`, `resetDeckIdleTimer()` line `6982`
- Writes: `togglePresentationMode()` line `7064`
- `google.script.run` callbacks: none directly
- Co-locate with: `preferredPresentationCardTheme`, `preTheaterThemeWasDark`, `deckIdleTimer`

</details>

<details>
<summary><code>activePieStageFilter</code></summary>

- Reads: `getProjectsHudFilterEntries()` line `1308`, `renderActiveFilterPills()` line `1476`, `applyFilters()` line `4619`
- Writes: `togglePieStageFilter()` line `1246`, `clearAllFilters()` line `4836`, `renderProjectsHUD()` line `6521`
- `google.script.run` callbacks: none directly
- Co-locate with: `currentFilterStats`, `activeFilters`

</details>

<details>
<summary><code>activeFilters</code></summary>

- Reads: `handleFilterCheck()` line `1279`, `getProjectsHudFilterEntries()` line `1308`, `clearFilterCategory()` line `1332`, `renderMultiSelect()` line `1349`, `toggleFilterValue()` line `1466`, `renderActiveFilterPills()` line `1476`, `applyFilters()` line `4619`
- Writes: `clearAllFilters()` line `4836`, plus internal mutation inside filter controls
- `google.script.run` callbacks: indirectly touched by nearly every callback that ends in `applyFilters()`
- Co-locate with: `filteredItems`, `currentGroupBy`, `activeAdminFilter`, `activePieStageFilter`, `currentActiveItem`

</details>

<details>
<summary><code>currentDockPlacement</code></summary>

- Reads: dock layout consumers are driven by `syncWorkspaceChrome()` line `1021`, `syncDockClearanceState()` line `1592`, `syncGanttIslandState()` line `1839`
- Writes: `syncDockPlacementState()` line `1196`, `updateFloatingPillsPosition()` line `1554`
- `google.script.run` callbacks: none directly
- Co-locate with: `currentWorkspaceView`, `isDeckMode`, gantt session state

</details>

<details>
<summary><code>ganttNeedsRender</code></summary>

- Reads: `ensureGanttRendered()` line `1774`
- Writes: `ensureGanttRendered()` line `1774`, `applyFilters()` line `4619`
- `google.script.run` callbacks: indirectly touched by `window.onload initial dashboard load`
- Co-locate with: `ganttHasMounted`, `ganttFocusedFdh`, `filteredItems`

</details>

<details>
<summary><code>ganttFocusedFdh</code></summary>

- Reads: `persistGanttViewSession()` line `1435`, `applyGanttFocusState()` line `1736`, `applyFilters()` line `4619`
- Writes: `restoreGanttViewSession()` line `1443`, `ensureGanttRendered()` line `1774`, `openGanttView()` line `1813`, `clearGanttFocus()` line `1828`, `handleGanttClick()` line `1897`
- `google.script.run` callbacks: `askGeminiForQuickPeek`
- Co-locate with: `ganttScrollState`, `ganttHasVisited`, `currentWorkspaceView`, `currentActiveItem`

</details>

<details>
<summary><code>ganttScrollState</code></summary>

- Reads: `persistGanttViewSession()` line `1435`, `restoreGanttViewport()` line `1709`
- Writes: `restoreGanttViewSession()` line `1443`, `captureGanttScrollState()` line `1458`, `openGanttView()` line `1813`
- `google.script.run` callbacks: none directly
- Co-locate with: `ganttFocusedFdh`, `ganttHasVisited`, `currentWorkspaceView`

</details>

<details>
<summary><code>ganttHasVisited</code></summary>

- Reads: `clearGanttFocus()` line `1828`, `applyFilters()` line `4619`
- Writes: `restoreGanttViewSession()` line `1443`, `captureGanttScrollState()` line `1458`, `ensureGanttRendered()` line `1774`, `openGanttView()` line `1813`
- `google.script.run` callbacks: none directly
- Co-locate with: `ganttFocusedFdh`, `ganttScrollState`

</details>

<details>
<summary><code>currentGroupBy</code></summary>

- Reads: `persistQueueGroupingSession()` line `928`, `isQueueGroupCollapsed()` line `951`, `syncWorkspaceChrome()` line `1021`, `renderActiveFilterPills()` line `1476`, `initDashboard()` line `4477`, `applyFilters()` line `4619`, `renderList()` line `5250`
- Writes: `setGroupBy()` line `935`, `toggleQueueGroupSection()` line `942`, `getGroupedQueueSections()` line `986`
- `google.script.run` callbacks: indirectly touched by callbacks that re-run `initDashboard()` or `applyFilters()`
- Co-locate with: `activeFilters`, `queueGroupCollapseState`, `filteredItems`, `currentViewMode`

</details>

<details>
<summary><code>allGlobalLogs</code></summary>

- Reads: `renderChangeLog()` line `2381`, `buildDigestCommandCenterData()` line `3390`, `renderGrid()` line `6149`, `getRecentChangesForItem()` line `7816`
- Writes: `initDashboard()` line `4477`
- `google.script.run` callbacks: `window.onload initial dashboard load`, `triggerQBSync post-sync refresh`, `executeRunReview`, `triggerUIRefresh`
- Co-locate with: `currentGridPivot`, `allActionItems`, `renderChangeLog`, digest workspace

</details>

<details>
<summary><code>allActionItems</code></summary>

- Reads: `handleGanttClick()` line `1897`, `syncQuickPeekNote()` line `2058`, `askGeminiForQuickPeek()` line `2066`, `selectItemForNav()` line `2891`, `buildDigestVendorMetrics()` line `3128`, `buildDigestCommandCenterData()` line `3390`, `renderDigestWorkspace()` line `3663`, `renderMiniSld()` line `3902`, `verifyXingFromAdmin()` line `4017`, `markQbUpdatedFromAdmin()` line `4043`, `updateAdminBadge()` line `4069`, `showHUD()` line `4157`, `getActiveQueueItems()` line `4325`, `updateCityDropdown()` line `4459`, `advanceAfterAction()` line `5908`, `promptBatchDeckExport()` line `6762`
- Writes: `initDashboard()` line `4477`, `moveItemToReviewed()` line `6706`, in-place mutations in admin/gantt/detail callbacks
- `google.script.run` callbacks: `askGeminiForQuickPeek`, `verifyXingFromAdmin`, `markQbUpdatedFromAdmin`, `markChecked`, `markQbUpdated`, `window.onload initial dashboard load`
- Co-locate with: `filteredItems`, `currentActiveItem`, `globalHeaders`, `globalEndCounts`, `globalTodayData`, `committedItems`

</details>

<details>
<summary><code>committedItems</code></summary>

- Reads: `getReviewedBadgeCount()` line `2323`, `persistReviewedTray()` line `4307`, `getReviewedFdhSet()` line `4321`, `promptEmailExport()` line `6038`
- Writes: `loadReviewedTray()` line `4311`, `addToReviewedTray()` line `4330`, `clearReviewedTray()` line `4341`, `renderOutbox()` line `5943`
- `google.script.run` callbacks: `promptEmailExport`
- Co-locate with: `stagedDeckItems`, `currentActiveItem`, reviewed tray helpers, outbox render

</details>

<details>
<summary><code>currentActiveItem</code></summary>

- Reads: `renderDetailWorkspaceFace()` line `1073`, `toggleDetailFace()` line `1114`, `syncRawDataStripState()` line `1210`, `openGanttForCurrentProject()` line `1823`, `syncQuickPeekNote()` line `2058`, `askGeminiForQuickPeek()` line `2066`, `saveQuickPeek()` line `2098`, `renderChangeLog()` line `2381`, `markChecked()` line `4106`, `markQbUpdated()` line `4123`, `renderList()` line `5250`, `advanceAfterAction()` line `5908`, `askGeminiForDraft()` line `6054`, `navGlobal()` line `7012`, `syncDeckNote()` line `7444`, `toggleCinemaHistory()` line `7825`
- Writes: `handleGanttClick()` line `1897`, `verifyXingFromAdmin()` line `4017`, `markQbUpdatedFromAdmin()` line `4043`, `openPane()` line `5570`, `skipReview()` line `5925`, `commitReview()` line `5934`, `openPaneFromGrid()` line `6404`, `renderDeckStage()` line `7134`
- `google.script.run` callbacks: `askGeminiForQuickPeek`, `saveQuickPeek`, `verifyXingFromAdmin`, `markQbUpdatedFromAdmin`, `markChecked`, `markQbUpdated`, `askGeminiForDraft`, `askGeminiForDraftDeck`, `saveDeckToSheet`
- Co-locate with: `allActionItems`, `filteredItems`, `pmSessionMemory`, `committedItems`, `deckIndex`

</details>

<details>
<summary><code>globalHeaders</code></summary>

- Reads: raw data/detail rendering helpers
- Writes: `initDashboard()` line `4477`
- `google.script.run` callbacks: `window.onload initial dashboard load`
- Co-locate with: `allActionItems`, `currentActiveItem`

</details>

<details>
<summary><code>globalEndCounts</code></summary>

- Reads: `showSpikeHUD()` line `4190`
- Writes: `renderGantt()` line `5092`
- `google.script.run` callbacks: none directly
- Co-locate with: `globalTodayData`, `currentFilterStats`, gantt module

</details>

<details>
<summary><code>globalTodayData</code></summary>

- Reads: `showTodayHUD()` line `4199`
- Writes: `renderGantt()` line `5092`
- `google.script.run` callbacks: none directly
- Co-locate with: `globalEndCounts`, `currentFilterStats`, gantt module

</details>

<details>
<summary><code>currentFilterStats</code></summary>

- Reads: `applyFilters()` line `4619`, `renderProjectsHUD()` line `6521`, `renderBslsHUD()` line `6631`
- Writes: `applyFilters()` line `4619`
- `google.script.run` callbacks: none directly
- Co-locate with: `filteredItems`, `globalEndCounts`, `globalTodayData`, `activePieStageFilter`

</details>

<details>
<summary><code>filteredItems</code></summary>

- Reads: `toggleQueueGroupSection()` line `942`, `renderDetailWorkspaceFace()` line `1073`, `ensureGanttRendered()` line `1774`, `openPane()` line `5570`, `askGeminiFromGrid()` line `6096`, `renderGrid()` line `6149`, `openPaneFromGrid()` line `6404`, `getDeckItems()` line `6829`, `navGlobal()` line `7012`
- Writes: `applyFilters()` line `4619`
- `google.script.run` callbacks: `askGeminiFromGrid`, `verifyXingFromAdmin`, `markQbUpdatedFromAdmin`, `window.onload initial dashboard load`
- Co-locate with: `allActionItems`, `currentActiveItem`, `currentQueueIndex`, `activeFilters`, `currentGroupBy`

</details>

<details>
<summary><code>currentQueueIndex</code></summary>

- Reads: deck/queue navigation helpers
- Writes: `openPane()` line `5570`
- `google.script.run` callbacks: none directly
- Co-locate with: `filteredItems`, `currentActiveItem`, `deckIndex`

</details>

<details>
<summary><code>globalRefDataDate</code></summary>

- Reads: `updateRefDataIndicator()` line `4568`, `renderDeckStage()` line `7134`
- Writes: `triggerQBSync()` line `2709`, `initDashboard()` line `4477`
- `google.script.run` callbacks: `triggerQBSync`, `triggerQBSync post-sync refresh`, `window.onload initial dashboard load`
- Co-locate with: `initDashboard`, `updateRefDataIndicator`, QB sync actions

</details>

<details>
<summary><code>globalAllFdhIds</code></summary>

- Reads: `buildSmartFdhDatalist()` line `7100`
- Writes: `initDashboard()` line `4477`
- `google.script.run` callbacks: `window.onload initial dashboard load`
- Co-locate with: `initDashboard`, deck search/datalist helpers

</details>

<details>
<summary><code>currentCriticalHubItems</code></summary>

- Reads: `getCriticalHubVisibleItems()` line `4861`, `navigateFromCriticalHub()` line `4913`, `renderCriticalHub()` line `4940`
- Writes: `applyFilters()` line `4619`
- `google.script.run` callbacks: none directly
- Co-locate with: `criticalHubState`, `acknowledgedCriticalFdhs`, `filteredItems`

</details>

<details>
<summary><code>acknowledgedCriticalFdhs</code></summary>

- Reads: `getCriticalHubVisibleItems()` line `4861`, `renderCriticalHub()` line `4940`
- Writes: `applyFilters()` line `4619`, `resetCriticalAcknowledged()` line `4901`, `acknowledgeCriticalItem()` line `4906`
- `google.script.run` callbacks: none directly
- Co-locate with: `currentCriticalHubItems`, `criticalHubState`

</details>

<details>
<summary><code>criticalHubState</code></summary>

- Reads: `getCriticalHubVisibleItems()` line `4861`, `setCriticalHubFilter()` line `4886`, `toggleCriticalHubType()` line `4891`, `toggleCriticalShowAcknowledged()` line `4896`, `renderCriticalHub()` line `4940`
- Writes: critical-hub controls above
- `google.script.run` callbacks: none directly
- Co-locate with: `currentCriticalHubItems`, `acknowledgedCriticalFdhs`, `filteredItems`

</details>

<details>
<summary><code>activeAdminFilter</code></summary>

- Reads: admin badge/card rendering through `renderAdminPane()` line `3930`
- Writes: `toggleAdminFilter()` line `2218`, `renderAdminPane()` line `3930`, `applyFilters()` line `4619`, `clearAllFilters()` line `4836`
- `google.script.run` callbacks: `verifyXingFromAdmin`, `markQbUpdatedFromAdmin`, `commitStagedCrossings`
- Co-locate with: `allActionItems`, `filteredItems`, `currentActiveItem`, `committedItems`

</details>

<details>
<summary><code>currentViewMode</code></summary>

- Reads: `renderList()` line `5250`
- Writes: `syncWorkspaceChrome()` line `1021`, `cycleViewMode()` line `2245`, `applyViewMode()` line `2253`
- `google.script.run` callbacks: indirectly touched by `initDashboard()` and `applyFilters()`
- Co-locate with: `currentGroupBy`, `currentWorkspaceView`, `filteredItems`

</details>

## Workstream 3 Recommendation

### Module boundary recommendations

| Module | State required | Global vs args | Risk | Prerequisite | Order |
|---|---|---|---|---|---:|
| `_module_tools_widgets.html` | `calcWidgetDragState`, `currentCalDate`, `calcState` | Can stay local to module | Low | none beyond helper bundle | 1 |
| `_module_changelog.html` | `allGlobalLogs`, `CHANGELOG_PULSE_SESSION_KEY`, `currentGridPivot` | `allGlobalLogs` should stay global until bootstrap moves; others can be imported/closed over | Medium | isolate changelog render from bootstrap DOM setup | 2 |
| `_module_theme_controls.html` | `_sysDark`, `_SUN_SVG`, `_MOON_SVG`, `preferredPresentationCardTheme` | `_sysDark` and icons can be module-local; theme preference can remain global initially | Medium | none; keep presentation-mode handoff in shell | 3 |
| `_module_queue_state.html` | `allActionItems`, `filteredItems`, `currentActiveItem`, `currentQueueIndex`, `activeFilters`, `currentGroupBy`, `currentViewMode`, `committedItems` | Must remain global behind a state owner first | High | first isolate central queue state and selection adapter | 4 |
| `_module_tabs.html` | `currentWorkspaceView`, `currentDetailFace`, `isDeckMode`, `deckIndex`, `currentDockPlacement`, gantt session state | These must remain global until router extraction | High | queue state owner plus workspace-mode adapter | 5 |
| `_module_digest.html` | `allActionItems`, `filteredItems`, `allGlobalLogs`, `currentActiveItem`, `currentCriticalHubItems`, `criticalHubState` | Most can be passed only after queue/bootstrap state is isolated | High | queue state owner and changelog/log state split | 6 |
| `_module_admin.html` | `activeAdminFilter`, `allActionItems`, `filteredItems`, `currentActiveItem`, `committedItems` | Should remain global until admin adapter exists | High | reviewed tray adapter and queue selection isolation | 7 |
| `_module_special_crossings.html` | `allActionItems`, `filteredItems`, `currentActiveItem`, `committedItems`, `activeAdminFilter` | Must stay global until admin/review state is isolated | High | admin adapter and reviewed tray adapter | 8 |
| `_module_gantt.html` | `allActionItems`, `filteredItems`, `currentActiveItem`, `ganttNeedsRender`, `ganttFocusedFdh`, `ganttScrollState`, `ganttHasVisited`, `currentDockPlacement`, `globalEndCounts`, `globalTodayData`, `activePieStageFilter` | Gantt session can become module-owned later; queue selection must stay global first | High | queue state owner, tabs/router split, HUD helper separation | 9 |
| `_module_deck.html` | `currentWorkspaceView`, `currentDetailFace`, `deckIndex`, `isDeckMode`, `isDeckEditing`, `pmSessionMemory`, `stagedDeckItems`, `filteredItems`, `currentActiveItem`, `committedItems`, `globalRefDataDate`, `isPresentationMode` | Current card selection and session memory must remain global first | High | queue state owner, reviewed tray adapter, router extraction | 10 |

### Direct answers
1. `initDashboard()` and `applyFilters()` must stay in `WebApp.html` as the bootstrap anchor for Workstream 3 start. They are the payload hydrator and state recompute fan-out for every major desktop surface.
2. No. None of the 19 live `google.script.run` call sites can be moved cleanly before isolating their coupled state. Even the simplest calls still terminate in shared bootstrap, queue, admin, deck, or badge ownership.

### Sequenced extraction plan
1. Extract the low-risk tools/widget cluster first.
2. Extract changelog rendering and theme controls.
3. Introduce a queue/bootstrap state owner inside `WebApp.html` before moving any data calls.
4. Move workspace router helpers after queue state is centralized.
5. Extract digest once `allGlobalLogs` and selection state have adapters.
6. Extract admin and special-crossings only after reviewed tray state is isolated.
7. Extract gantt after router and queue state stabilize.
8. Extract deck last, after reviewed tray, queue selection, and router concerns are separated.

## Workstream 5 Complete
> Completed March 21, 2026

### Extracted modules confirmed working
- `_module_queue_state.html`
- `_module_digest.html`
- `_module_admin.html`
- `_module_special_crossings.html`
- `_module_gantt.html` (partial extraction only)
- `_module_deck.html`

### Deferred / partial scope notes
- `_module_tabs.html` deferred — router/fullscreen orchestration and overlay layering must be resolved first. Revisit after the Workstream 6 router isolation pass.
- `_module_gantt.html` was intentionally extracted as a conservative partial:
  - Extracted: core Gantt render/session/focus helpers, hover HUD helpers, and Gantt-local session state
  - Left in `WebApp.html`: quick peek write path (`renderQuickPeek()`, `closeQuickPeek()`, `syncQuickPeekNote()`, `askGeminiForQuickPeek()`, `saveQuickPeek()`)
  - Left in `WebApp.html`: shared KPI HUD helpers (`renderProjectsHUD()`, `renderBslsHUD()`)
  - Left in `WebApp.html`: shared workspace helpers (`syncDockPlacementState()`, `syncWorkspaceChrome()`)
- `currentPanelTab` is still owned in `WebApp.html` and is missing from `_state_router.html`. Add it during Workstream 6 before attempting `_module_tabs.html`.

## Workstream 6 Complete
> Completed March 21, 2026

### Files created or modified
- `_module_router.html` — created
- `_module_tabs.html` — created
- `_state_router.html` — `currentPanelTab` added
- `_styles_layout.html` — z-index fixes, help stacking updates, and `.top-nav` raised to `100015`
- `_styles_components.html` — admin X button fix, nav FAB styles, and dropdown animation/layer updates
- `_module_theme_controls.html` — `getEl()` removed from `applyTheme()` and `DOMContentLoaded` guard added
- `WebApp.html` — FAB markup, `toggleNavFab()`, dark-mode bootstrap re-apply, include-order updates, and router/tabs extraction points

### Bug fix outcomes
- Admin X button — RESOLVED
- Hamburger menu — RESOLVED
- Dark mode icon on load — RESOLVED

### Feature outcomes
- FAB dropdown — COMPLETE
  - Sync QB, Run Review, and Refresh now route through the compact desktop nav dropdown
  - Dark mode and Help remain standalone header buttons

## Workstream 7 Recommendation
- Target mobile buildout in `MobileApp.html`
- Use the extracted desktop module/state boundaries as the reference architecture
- Do not reuse desktop layout assumptions directly
- Gantt quick peek TODOs still open in `WebApp.html`: `renderQuickPeek()`, `closeQuickPeek()`, `syncQuickPeekNote()`, `askGeminiForQuickPeek()`, and `saveQuickPeek()`
- Shared KPI HUD TODOs still open in `WebApp.html`: `renderProjectsHUD()` and `renderBslsHUD()`
- `_module_tabs.html` fullscreen bleed-through still needs diagnosis in the mobile context
- Remaining HIGH RISK TODOs from prior workstreams:
  - `initDashboard()` remains the bootstrap anchor and shared desktop hydration contract
  - `applyFilters()` remains the shared render/orchestration anchor across queue, admin, grid, digest, and gantt
  - Deck/export flows still write back into queue/admin/reviewed state through shared runtime ownership
  - Gantt extraction is still partial; row-header-coupled render paths and shared workspace orchestration remain mixed into the shell

---

## Workstream 7 — Mobile Buildout (Complete)
Started: March 21, 2026
Completed: March 23, 2026

### Phases Complete
- Phase 1: Shell + tab bar + orientation system
  CSS architecture fix: all CSS in `_styles_mobile.html`
  via `include()` — GAS sanitizes large inline style blocks
- Phase 2: Queue tab — commit 4a10674
  Data: `getDashboardData()` → `mobileState.all`
  Cards: fdh, city, vendor, status, health, days left, flags
  Search, filter, group by, pull to refresh working
- Phase 3: Detail view — commit 642d566
  All major sections rendering
  Swipe navigation, back button, local commit/skip
  Orientation hint active for landscape requirement
  PM note scaffold, no backend writes
- Phase 4: Actions — commit 4457b9a
  Run Review: `webAppTrigger3a(dateStr)` with native date picker
  (pre-filled UTC today, min 30 days ago, max today)
  Sync QB: `syncFromQBWebApp()` with confirm modal, result.success guard
  Refresh: `loadQueueData(true)` from any tab — no navigation
  Detail Commit: `commitBatchReviewsToLog([{fdh,vendor,flags,comment}])`
  best-effort after local state advance
  All actions: loading overlay + success/error toasts
  All google.script.run calls have withSuccessHandler + withFailureHandler
- Phase 5: Gantt timeline — commit 83a4f80 — March 22, 2026
  Single overflow: auto container, row labels sticky-left 132px, date header sticky-top
  Month (22px/day) and Week (34px/day) zoom toggle chip below tab bar
  Today line centered on render and zoom toggle via requestAnimationFrame
  EOM markers: faint vertical line + BSL count at each month boundary
  Spike markers: tinted band + count label when 5+ projects end same day
  Bar tap: `openQueueDetail(idx)` → Detail tab, same pattern as queue cards
  Orientation hint (landscape) fires on tab switch, auto-dismisses 3s
  Render triggered by: setActiveTab('gantt'), loadQueueData success, zoom toggle
  Severity outlines: crit=red border, warn=amber border on bars
  Files: `MobileApp.html` + `_styles_mobile.html` only

- Phase 6: Admin tab — commit 54a20ec — March 22, 2026
  Three sub-tab chips: Crossings, QB Status, Missing BOMs with live counts
  Data from mobileState.all filtered by flag strings (no new backend call)
  Crossings: read-only cards, tap → Detail. Staged commit deferred.
  QB Status: "Mark Updated" → local flag swap + markStatusSyncComplete(fdh) best-effort background write
  Missing BOMs: instruction cards, tap → Detail
  updateAdminBadge() called from applyQueueFilters() — badge stays live on refresh
  renderAdminTab() called from setActiveTab('admin') + loadQueueData success
  adminOpenDetail() handles items outside active queue filter via mobileState.all fallback
  Empty state per sub-tab when no items outstanding
  Files: MobileApp.html + _styles_mobile.html only

- Phase 7: Digest tab -- commit 805acc0 -- March 23, 2026
  Summary stats: pipeline count, BSL total, critical count from mobileState.all
  Stage breakdown: grouped by item.stage with proportional fill bars
  Vendor leaderboard: top 10 by BSL total with daily velocity and goal vs actual
  Activity feed: 25 most recent globalLogs sorted by timestampObj descending
  Feed taps: adminOpenDetail(fdh) for matched projects; muted system style for unmatched
  globalLogs + vendorGoals captured from existing getDashboardData() payload -- no new call
  renderDigestTab() triggered on setActiveTab('digest') + loadQueueData success
  Files: MobileApp.html + _styles_mobile.html only

- Design Polish Pass -- commits d5066e9 (Phase A), 056053a (Phase B) -- March 23, 2026
  Phase A (token cleanup): 39 hardcoded colors → tokens; 5 new overlay tokens + --text-inverse added
  Phase B (visual consistency): Admin/Digest card radius → 16px; admin card padding → 16px;
  digest stat card padding → 14px 16px; admin FDH title → 16px; admin sub-tab chips → 11px/800;
  gantt + digest secondary text weight → 600
  Files: _styles_mobile.html only — no markup changes

### Workstream 7 Complete
All 7 feature phases + Design Polish Pass complete as of March 23, 2026.
Five mobile tab surfaces built and polished. Token system complete.

---

---

## Workstream 8 Recommendation
Priority items deferred from WS7 and prior workstreams:

### Deferred from WS7
- **Auto device detection routing** — mobile surface requires explicit `?view=mobile` parameter.
  Implement server-side user-agent detection in `doGet()` (`02_Utilities.js`) to route automatically.
- **PWA / home screen install support** — add Web App Manifest and service worker registration
  so the mobile URL can be saved to the iOS/Android home screen with full-screen launch.
- **Push notifications via GAS triggers** — time-based GAS triggers can call a notification
  endpoint; requires a registered push subscription on the client.
- **Offline queue caching** — cache last-loaded `mobileState` in localStorage so the queue
  renders stale data when the device is offline.

### Deferred from WS6
- **Crossings staged commit on mobile Admin** — Admin Crossings sub-tab currently shows
  read-only cards. Staged commit workflow (verify → commit → CSV export) was deferred from
  Phase 6. Reference `_module_special_crossings.html` for the desktop implementation contract.
- **`_module_tabs.html` fullscreen bleed-through diagnosis** — tab badge fullscreen bleed-through
  documented but unresolved. Needs diagnosis in the mobile context as well.

### Deferred from WS5
- **Gantt quick peek** — bar tap currently navigates to Detail tab. A slide-up quick-peek panel
  (showing key fields inline without tab switch) was deferred. Reference desktop `renderQuickPeek()`
  contract in `WebApp.html` for field set.

## Phase 5 Plan (Approved — Built March 22, 2026)

Data fields: `item.cxStart` (bar start), `item.cxEnd`
(bar end), `item.fdh` (row label), `item.vendor` (sub-label),
`item.stage`/`status` (bar color via `getQBStatusClass()`),
`item.flags` (severity tint), `item.bsls` (EOM BSL count).
`bench`, `vel`, HUD fields deferred.

Layout: single `overflow: auto` container. Row labels
sticky left at 132px. Date header sticky top.
Vertical scroll syncs label and bar rows together.

Zoom: Month (22px/day) and Week (34px/day) toggle
chip pinned below tab bar. Today line centered on
render and zoom toggle.

EOM markers: faint vertical line + BSL count label
at each month boundary.

Spike markers: tinted vertical band + label when
5+ projects end same day. No HUD on mobile.

Tap: fires `openQueueDetail(index)` → Detail tab
with selected project. Same pattern as queue card.

Orientation: landscape lock, hint auto-dismisses 3s.

Out of scope for Phase 5: quick peek, bead markers,
HUD, KPI HUD.

Files: `MobileApp.html` + `_styles_mobile.html` only.
No backend changes.

### Known Issues / Deferrals
- Auto device detection routing deferred to WS8
- CSS must stay in `_styles_mobile.html` — never inline in `MobileApp.html`
- Mobile URL requires `?view=mobile` parameter
- Use dev URL for testing — no redeployment unless explicitly requested

### Payload Field Names (getDashboardData)
fdh, city, vendor, status, stage, ofsDate,
targetDate, bsls, flags, vendorComment,
fieldProduction, isTrackerLinked, cxStart,
cxEnd, draft, vel, qbRef, rowNum, gaps,
isXing, cdIntel, geminiInsight, geminiDate,
specXDetails, isDrgTracked, drgTrackerUrl,
rid, bench, rawRow

### mobileState Structure
- `mobileState.all` — full project list
- `mobileState.committed` — locally reviewed items
- `mobileState.activeItem` — selected project
- `mobileState.activeIdx` — queue position
- `mobileState.activeTab` — current tab
- `mobileState.filtered` — filtered project list
- `globalEndCounts` — matches registry contract
- `globalTodayData` — matches registry contract

### Orientation Map
- Portrait only: Queue, Admin, Actions/FAB
- Landscape only: Detail, Gantt
- Either: Digest
- Enforcement: floating pill hint, auto-dismisses after 3 seconds
