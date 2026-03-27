# Stability-First Modularization Audit

Last updated: 2026-03-26 17:57 CDT

## Summary

This app is only partially modularized. The runtime is split across HTML partials, but `_module_webapp_core.html` still acts like a partial-monolith and continues to own bootstrap, app-shell orchestration, shared view-model state, feature-local state, UI timers, and helper remnants. The recent boot failures were caused by that overlap.

This document is the decision-complete spec for the next modularization workstream. It is stability-first. The goal is not to reduce line count for its own sake; the goal is to make ownership unambiguous so the assembled page can load safely and feature work stops reintroducing duplicate globals.

## Current Runtime Map

Live include order in `WebApp.html`:

1. `_registry`
2. `_styles_base`
3. `_styles_layout`
4. `_styles_components`
5. `_styles_gantt`
6. `_styles_deck`
7. `_state_queue`
8. `_state_router`
9. `_state_session`
10. `_utils_shared`
11. `_utils_notifications`
12. `_module_router`
13. `_module_tools_widgets`
14. `_module_changelog`
15. `_module_theme_controls`
16. `_module_queue_state`
17. `_module_digest`
18. `_module_admin`
19. `_module_special_crossings`
20. `_module_gantt`
21. `_module_deck`
22. `_module_tabs`
23. `_module_webapp_core`
24. `_module_mobile_nav`

Current runtime line counts:

- `_module_webapp_core.html`: 5743
- `_module_queue_state.html`: 973
- `_module_digest.html`: 951
- `_module_deck.html`: 918
- `_module_gantt.html`: 642
- `_module_admin.html`: 294
- `_module_router.html`: 288
- `_module_mobile_nav.html`: 207

Interpretation:

- `_module_webapp_core.html` is still the dominant runtime and remains the highest-risk file.
- The app already has real state owners for queue, router, and session.
- Several feature modules are real extractions, but core still holds overlapping state and behavior for those same domains.

## Ownership Contract

Target ownership rules:

- `_state_*.html` owns shared mutable state and persistence keys.
- `_utils_*.html` owns pure helpers, UI helper bundles, and static tokens only.
- Feature modules own behavior and rendering for their feature, plus feature-local state only when that state is not shared across modules.
- `_module_webapp_core.html` owns bootstrap and top-level orchestration only.
- No top-level `let`/`const` may be declared in more than one loaded script.
- No “INLINE COPY DISABLED” extraction remnants remain in live owners after a feature is fully extracted.

Allowed dependency direction:

- `_registry` -> no dependencies.
- `_state_*` -> may read `_registry` and earlier state files only.
- `_utils_*` -> may read `_registry` and browser APIs only.
- feature modules -> may read state owners, utils, and explicitly designated peer modules.
- `_module_webapp_core` -> may orchestrate all owners/modules, but may not introduce new shared state.
- `_module_mobile_nav` -> may call router/admin/search public entrypoints only.

## Target File Ownership

Keep existing owners:

- `_state_queue.html`
  - `allActionItems`
  - `committedItems`
  - `currentActiveItem`
  - `filteredItems`
  - `currentQueueIndex`
  - `activeFilters`
  - `GROUP_BY_OPTIONS`
  - `currentGroupBy`
  - `currentViewMode`
  - `queueGroupCollapseState`
  - add `activePieStageFilter`
  - add `openDropdownId`
- `_state_router.html`
  - `currentWorkspaceView`
  - `currentDetailFace`
  - `isDeckMode`
  - `deckIndex`
  - `currentDockPlacement`
  - `currentPanelTab`
  - `isGridMode`
  - `currentGridPivot`
  - add `deckPrevPivot`
  - add `pendingFaceAnimation`
- `_state_session.html`
  - `pmSessionMemory`
  - `stagedDeckItems`
  - `globalRefDataDate`
  - `isPresentationMode`
  - session storage keys
  - add `REVIEWED_TRAY_STORAGE_KEY`
  - add `isStagedReviewCollapsed`

Create new state owners:

- `_state_payload.html`
  - `allGlobalLogs`
  - `globalHeaders`
  - `globalAllFdhIds`
- `_state_analytics.html`
  - `globalEndCounts`
  - `globalTodayData`
  - `currentFilterStats`
- `_state_ui_shell.html`
  - `previousDockState`
  - `startupTimer`
  - `startupCountdown`
  - `frostedInterval`
  - `bslsHudLocked`
  - `projectsHudLocked`

Create new utility owner:

- `_utils_ui_tokens.html`
  - `QB_STYLES`
  - any future shared icon/token constants used across queue, gantt, grid, and deck

Feature ownership after cleanup:

- `_module_router.html`
  - workspace routing
  - dock placement/layout sync
  - detail/slide face transitions now in core:
    - `isSlideFaceActive`
    - `renderDetailWorkspaceFace`
    - `toggleDetailFace`
    - `animateCardFaceTransition`
    - `animatePendingFaceTransition`
    - `animateDockFaceShift`
  - `_SLIDE_SVG`
- `_module_queue_state.html`
  - queue render/filter behavior
  - search debounce state:
    - `_filterDebounce`
    - `_filterInput`
  - dropdown and active filter pill rendering currently in core
- `_module_gantt.html`
  - all gantt-local state
  - quick-peek surface currently still in core:
    - `renderQuickPeek`
    - `closeQuickPeek`
    - `syncQuickPeekNote`
    - `askGeminiForQuickPeek`
    - `saveQuickPeek`
    - `renderDeliverableChip`
    - tracker pill helpers
- `_module_admin.html`
  - `activeAdminFilter`
  - reviewed tray persistence behavior
- `_module_digest.html`
  - all digest constants and digest-local state
- `_module_deck.html`
  - deck-local state
  - `preTheaterThemeWasDark`

## `_module_webapp_core.html` Target End State

End-state responsibility of `_module_webapp_core.html`:

- startup boot sequence
- first payload fetch
- payload hydration fan-out into owner modules/state
- high-level app-shell orchestration
- refresh/run-review/QB-sync command entrypoints
- help/startup overlays only if they are not extracted into a dedicated shell module

Everything else moves out.

Target decomposition buckets:

1. Bootstrap
   - `runBootSequence`
   - `hideSplash`
   - `reportStartupPhase`
   - `showStartupFailure`
   - `checkViewportHandOff`
   - `window.onload`
   - `initDashboard`
   - `updateGeminiBadge`

2. App-shell orchestration
   - `syncRawDataStripState`
   - `syncDockLayoutSpacing`
   - `updateFloatingPillsPosition`
   - `syncDockClearanceState`
   - `toggleFilterStrip`
   - `searchHelp`
   - `toggleHelpPanel`
   - `updateRefDataIndicator`
   - frosted loader helpers
   - startup selector helpers

3. Move to existing owners
   - queue filter/pill/dropdown state -> `_state_queue` + `_module_queue_state`
   - detail face transition state -> `_state_router` + `_module_router`
   - reviewed tray/session collapse state -> `_state_session` + `_module_admin`
   - deck presentation state -> `_module_deck`
   - gantt HUD lock state -> `_state_ui_shell` or `_module_gantt`

4. Extract into new feature modules
   - `_module_critical_hub.html`
   - `_module_quick_peek.html` if gantt ownership becomes too crowded
   - `_module_grid.html`
   - `_module_review_actions.html`

## `_module_webapp_core.html` Global Classification

Keep in core bootstrap:

- `bootInterval`
- `startupTimer`
- `startupCountdown`
- `frostedInterval`

Move to existing owner:

- `deckPrevPivot` -> `_state_router.html`
- `activePieStageFilter` -> `_state_queue.html`
- `openDropdownId` -> `_state_queue.html`
- `pendingFaceAnimation` -> `_state_router.html`
- `isStagedReviewCollapsed` -> `_state_session.html`
- `REVIEWED_TRAY_STORAGE_KEY` -> `_state_session.html`
- `activeAdminFilter` -> `_module_admin.html`
- `_filterDebounce` -> `_module_queue_state.html`
- `_filterInput` -> `_module_queue_state.html`
- `_SLIDE_SVG` -> `_module_router.html`

Promote to new state owner:

- `previousDockState` -> `_state_ui_shell.html`
- `allGlobalLogs` -> `_state_payload.html`
- `globalHeaders` -> `_state_payload.html`
- `globalAllFdhIds` -> `_state_payload.html`
- `globalEndCounts` -> `_state_analytics.html`
- `globalTodayData` -> `_state_analytics.html`
- `currentFilterStats` -> `_state_analytics.html`
- `currentCriticalHubItems` -> `_state_analytics.html`
- `acknowledgedCriticalFdhs` -> `_state_analytics.html`
- `criticalHubState` -> `_state_analytics.html`
- `bslsHudLocked` -> `_state_ui_shell.html`
- `projectsHudLocked` -> `_state_ui_shell.html`

Promote to new utility owner:

- `QB_STYLES` -> `_utils_ui_tokens.html`

Delete from core once owner is live:

- any duplicate helper bundles already owned by `_utils_shared.html`
- any commented “INLINE COPY DISABLED” declaration blocks left behind by completed extractions

## Migration Sequence

Phase 0 — Audit and guardrails

- Land this audit/spec.
- Add PRD workstream entry for modularization.
- Require assembled runtime validation as a refactor acceptance step.

Phase 1 — Finish state ownership

- Create `_state_payload.html`, `_state_analytics.html`, and `_state_ui_shell.html`.
- Move the classified top-level globals out of `_module_webapp_core.html`.
- Do not move functions yet.
- Acceptance:
  - zero duplicate-declaration failures in assembled script load
  - boot still completes

Phase 2 — Finish shared helper ownership

- Create `_utils_ui_tokens.html`.
- Move `QB_STYLES` there.
- Ensure `_utils_shared.html` is the only owner of DOM helper shorthands.
- Remove remaining shared helper/token redeclarations from core and feature modules.

Phase 3 — Extract core feature islands

- Extract critical hub into `_module_critical_hub.html`.
- Extract grid behavior into `_module_grid.html`.
- Extract quick-peek and tracker pill behavior into `_module_quick_peek.html` if keeping it in `_module_gantt.html` would overload that module.
- Extract review action flows into `_module_review_actions.html`.

Phase 4 — Reduce core to orchestration

- Move detail-face orchestration to `_module_router.html`.
- Move queue search/dropdown/filter-pill behavior to `_module_queue_state.html`.
- Leave `_module_webapp_core.html` with bootstrap and app-shell orchestration only.
- Target: `_module_webapp_core.html` under 800 lines without changing behavior.

Phase 5 — Purge ghost modularization

- Delete dead commented extraction blocks from live owners.
- Remove obsolete references to `_module_legacy_core.html`.
- Update file header comments and docs to reflect final ownership.

## Acceptance and Regression Rules

Every modularization phase must pass:

- Assembled page loads all scripts in include order with zero duplicate-declaration failures.
- Exactly one bootstrap owner registers startup.
- Queue state initializes before dependent modules.
- Feature modules read owner state without redeclaring it.
- Boot and splash dismissal work.
- Queue render and selection work.
- Detail/deck transitions work.
- Gantt render/focus/session restore work.
- Digest render and filter interactions work.
- Admin/review tray flows work.
- Mobile nav continues to function after desktop bootstrap loads.

## Notes for the Implementer

- Do not chase line-count reduction first.
- Move state before moving behavior.
- Remove one ownership category at a time and validate the assembled runtime after each pass.
- If a function is still used by inline `onclick` HTML, it must remain globally reachable until event wiring is modernized.
