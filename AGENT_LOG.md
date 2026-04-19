# Agent Log — Omni PMO App

> [!success] 2026-04-19: Diagnostic Flag Evolution & SVG Icon Integration
- **Emoji Reduction:** Stripped all emojis from backend diagnostic flags in `01_Engine_Archive.js` and `02_Utilities.js`. Standardized flags as plain text (e.g., `LIGHTING RISK`, `INVALID DATE`) to improve professional aesthetic and data consistency.
- **SVG Icon Adoption:** Integrated inline SVG icons (`fire` for Critical, `shield` for Warning) across the Dashboard and Diagnostic Hub. Replaced hardcoded emojis with scalable, theme-aware SVG assets.
- **Expanded Dashboard Feed:** Refactored `renderDashFlagsFeed` to show both Critical and Warning flags. Grouped items by severity to capture all "pertinent" operational risks in a single view.
- **Enhanced Diagnostic Hub:** Renamed "Critical Hub" to "Diagnostic Hub" (kicker) and updated categorization to include dedicated buckets for `Date / Timing Issue` and `Lighting / Flow Risk`.
- **Logic Modernization:** Updated `getSeverity` and `getDiagnosticTagClass` in `_utils_shared.html` to rely on keyword matching rather than emoji detection. Included `INVALID DATE` and `MISSING BOM` in the high-severity "Critical" tier.
- **Refined Red Pill:** Updated `activeCritCount` in `_module_queue_state.html` to include both Critical and Warning items, ensuring the global "Actionable" count captures all pertinent risks.

> [!success] 2026-04-16: Dependency Parsing Robustness & Full Map Scrolling integrated
- **Robust Regex Extraction:** Refactored `06_QBSync.js` to aggressively regex FDH patterns (`[A-Z]{3}\d{2}-F\d+`) from all dependency fields. This breaks up concatenated link strings (e.g., `TDO04-F96->TDO04-F208`) into individual parts before mapping.
- **Node Shrinking Fixed:** Updated `_module_mini_sld.html` with `flex: 0 0 auto` and `min-width: max-content` on all nodes. This prevents pills from shrinking to fit the viewport and enables proper horizontal side-scrolling.
- **Topological Integrity:** Restored `UPSTREAM UNKNOWN` and `DOWNSTREAM UNKNOWN` placeholders at the ends of the recursive chains to provide a clear map of where information stops.
- **Centering Polish:** Retained the smooth-scroll centering logic to ensure the current project remains the anchor of the visual map.

> [!info] 2026-04-17: Turn-20 mental state checkpoint — spotlight search visual convergence
- **What is solved:** The desktop spotlight shell, trigger language, and input sizing now feel materially closer to the app. Search routing behavior remains stable across desktop and mobile, and the branch stack is cleanly merged with a new follow-on branch for result styling.
- **Current defect:** Search result rows still show right-edge spill/clipping under certain content widths. The detached card treatment improved hierarchy but introduced containment problems and felt less native than the inbox surfaces elsewhere in the app.
- **Reference decision:** The correct visual target is Review Hub + SIGNAL, not macOS Spotlight. Review Hub provides the sticky-section behavior; SIGNAL provides the dense, contained inbox-row treatment.
- **Active direction:** Collapse results into contained inbox sections, ensure rows can shrink correctly with `min-width: 0` grid/flex rules, and use sticky group headers inside the dropdown scroll container instead of stacked floating cards.

> [!success] 2026-04-16: Quickbase FDH Dependencies (Table bvmsmt5cf) integrated
- **Version Control:** Created `feat/quickbase-dependencies` branch for isolated development.
- **Data Ingestion:** Added `syncFDHDependencies()` to `06_QBSync.js` to fetch and aggregate predecessor/successor pairs from Quickbase Table `bvmsmt5cf`. 
- **Storage:** Implemented automatic column injection (`QB_Blocked_By`, `QB_Blocks`) into `5-Reference_Data` during sync.
- **Engine Logic:** Updated `getReferenceDictionary` to parse dependency strings into arrays. Added `BLOCKED BY PREDECESSOR` flagging logic to the engine build in `01_Engine_Archive.js`.
- **UI Enhancements:** Refactored `renderMiniSld` in `_module_mini_sld.html` to support multiple dependency nodes with horizontal scrolling.
- **Admin Tooling:** Added `discoverDependencyFields()` and a corresponding "Quickbase Hub" menu item to aid in FID discovery and live validation.
- **Verification:** Changes staged and ready for live field mapping. Logic assumes `Check and Balance` field follows `PRED->SUCC` pattern or explicit successor field is present.

> [!success] 2026-04-15: Direct manual QB sync promoted; frontend action menu cleaned up
- **Manual QB sync is now direct:** `triggerQBSync()` in the web app no longer starts the async trigger chain or polls sync status. It now calls `syncAndRebuildDashboard()` directly and refreshes from the returned payload in one round-trip.
- **Async trigger path preserved:** `kickoffQBSync()`, `getQBSyncStatus()`, `_runQBSyncPhase1()`, and `_runQBSyncPhase2()` remain intact for scheduled automation, recovery, and fallback operator flows.
- **Frontend action surface trimmed:** Desktop and mobile action menus now keep only user-facing actions (`Sync QB + Rebuild`, `Process Incoming`, `Run Review`, `Refresh UI`, plus mobile `Review Hub`) and remove backend-maintenance-only entries from the primary menu surface.
- **SVG action icons added:** Retained menu actions now render with explicit inline SVG icons for clearer affordance and desktop/mobile consistency.
- **Verification:** `node scripts/validate-sync-hotpaths.js` passed with new assertions covering the direct manual sync contract and preservation of the async backend path.

> [!success] 2026-04-15: Automation health + trigger reliability hardening validated
- **Daily automation trigger family hardened:** `setupDailyTrigger()` now reinstalls only the `runMiddayAutomation` family instead of deleting all project triggers. Verified healthy at **3/3** active triggers.
- **CD trigger family made observable:** `installCDTrigger()` / `removeCDTrigger()` now record install/remove timestamps and active counts. Verified healthy at **11/11** active triggers with `pendingCount=0`.
- **QB async sync state hardened:** Added shared cleanup for orphaned phase triggers and transient properties, plus terminal-state persistence (`lastStatus`, `lastRunId`, `lastResult`, `lastError`) and compact operator logs in `System_Logs`.
- **Archive resume path deduped:** resumable ingestion now deletes stale `processIncomingResume` triggers before scheduling a new one, and records resume schedule/start timestamps for health inspection.
- **Operator visibility added:** `getAutomationHealth()`, snapshot helpers, and concise `System_Logs` summaries now expose daily automation, QB sync, archive ingestion, and CD ingestion health without relying on Apps Script execution logs.
- **Trigger-context bug fixed:** `backfillMissingReports()` now supports silent mode so scheduled `runMiddayAutomation()` no longer crashes on `SpreadsheetApp.getUi()` alerts. Latest validated run completed with `daily=done`, `dailyTriggers=3/3`, `resume=0`, `archive=idle`, `cdTriggers=11/11`.
- **Verification:** `node scripts/validate-sync-hotpaths.js` passed after the hardening and silent gap-scan fix.

> [!info] 2026-04-15: Turn-20 mental state checkpoint — Phase 2 stabilized, focus shifts to trigger latency
- **Confirmed wins:** Phase 2 rebuild cost has been materially reduced through mirror-write fast paths, payload `refDict` reuse, and short-lived dictionary caching. Latest validated rebuild landed around **48.8s**, down from prior ~71s and far below the earlier ~201s baseline.
- **Current bottleneck:** End-to-end async sync time is now dominated by the scheduler gap between Phase 1 completion and Phase 2 start (`queueLatencyMs` reached ~169s in the latest production log), not rebuild compute.
- **Operational posture:** Keep the two-phase sync contract intact. Prefer instrumentation and explicit guardrails before any attempt to collapse, merge, or refactor trigger flow.
- **Active slice:** Added trigger-chain instrumentation around kickoff, Phase 1 scheduling, and Phase 2 scheduling so the next logs can distinguish orphan cleanup, trigger scheduling delay, and actual Apps Script trigger latency.

> [!success] 2026-04-13: Automated API Sync & Signal Polling Implementation
- **Consolidated Automation Schedule**: Updated `setupDailyTrigger` to run strictly at **7:00 AM**, **12:00 PM**, and **4:00 PM**, aligning with peak workflow windows.
- **API Pipeline Integration**: Injected the `syncFromQBWebApp()` QuickBase API sync directly into the `executeDailyAutomationPipeline`. This ensures the reference data is always refreshed *before* folder ingestion and dashboard generation.
- **Change-Detection Logic**: 
    - Updated `syncChangeLogs()` to identify the latest change timestamp and set a `LATEST_SIGNAL_EVENT_MS` property if new records are found.
    - Updated `processIncomingForQuickBase()` to trigger the same signal event when new Drive reports are successfully ingested.
- **Signal Polling (Option A)**:
    - Added a lightweight `checkSignalUpdates` backend endpoint to compare client "last seen" times with the server's latest event.
    - Implemented a frontend `setInterval` in `src/_module_signal.html` that polls for updates every 5 minutes and automatically triggers the Signal popup when new information is detected.
- **Files touched:** `src/01_Engine_Archive.js`, `src/02_Utilities.js`, `src/06_QBSync.js`, `src/_module_signal.html`.

> [!success] 2026-04-13: "Running Reports" Ingestion & Intentional Backfilling
- **Robust Date Extraction**: Refactored `parseFileToRows` and `normalizeDateString` to handle row-level dates, including support for Excel serial numbers and fuzzy date-header identification ("Work Date", "Service Date", etc.).
- **Value-Based Date Hunt**: Implemented a "Date Hunt" fallback that scans cell values if headers are missing, ensuring cumulative spreadsheets (running logs) correctly attribute work to historical dates.
- **Manual Override by Placement**: Restricted the automatic "force re-process" behavior exclusively to the `Production_Incoming` (`REFERENCE_FOLDER_ID`) root. Files dropped here bypass the `PROCESSED` metadata check, providing a surgical, intentional way to trigger re-ingestion without aggressive recursive scanning.
- **Diagnostic Transparency**: Added detailed logging to the `System_Logs` sheet, showing the identified date column and a summary of added vs. skipped rows for every file run.
- **Files touched:** `src/01_Engine_Archive.js`, `src/02_Utilities.js`.

> [!info] 2026-04-13: Drive intake decision recorded — stay GAS-only, preserve webhook future path
- **Current decision**: Keep the existing Apps Script timed-trigger discovery flow for Drive-fed imports. Power Automate reliably lands files into Google Drive, and the current GAS-only watcher pattern is already operationally sufficient.
- **Reasoning**: Avoid adding Google Cloud webhook infrastructure just to shave a few seconds off transfer detection. The extra moving parts are not justified for the current workflow.
- **Future option preserved**: If near-real-time detection becomes necessary later, add a minimal Cloud Run receiver for Google Drive `changes.watch`, filter events to explicit target folder IDs, and hand off to the existing GAS import path rather than rewriting ingestion logic.
- **Files touched:** `CLAUDE.md`, `AGENT_LOG.md`.

> [!success] 2026-04-08: SIGNAL Performance Optimization & High-Signal Tracking
- **Targeted Drive Ingestion**: Refactored `getSignalDrive` to perform a keyword-based targeted scan for `CDs_and_Permits` and `BOMs` folders. Eliminated the slow full-tree traversal, resulting in significantly faster loading times (< 3s) and guaranteed tracking of critical project documentation.
- **Rolling 24-Hour Snapshot**: Updated the "Current" timeframe logic to use a strict rolling 24-hour lookback from the exact time of the request. This ensures recent activity is always visible even when the master archive hasn't been updated for several hours.
- **Improved Traversal Pruning**: Enhanced the Drive traversal logic to descend only into high-signal folder branches, preventing GAS timeouts while maintaining a depth-limit safe search for project-specific files.
- **Files touched:** `src/02_Utilities.js`.

> [!success] 2026-04-08: SIGNAL UI Final Tightening (Inbox Style & Focused Signal)
- **QUICKBASE CHANGES (Inbox Card Style)**: Redesigned the Quickbase changes panel to match the Diagnostic Queue's "inbox card" view. Each entry now features a bold **FDH ID**, a secondary line with **Status Pills** for both the change type and its value, and metadata (user/timestamp) in a structured header. The entire card is clickable for seamless navigation.
- **DRIVE FOLDERS (Focused Signal)**: Refined the Drive activity panel to track ONLY `CDs_and_Permits` and `BOMs`. Restored the original hybrid layout (large icons at top, structured list below) to provide a clear, focused view of critical project documentation.
- **APP LOG (Console Aesthetic)**: Maintained the enhanced terminal console aesthetic with a deep black background (`#0a0a0a`), vibrant green monospaced text, CRT scanline effects, and a blinking cursor.
- **Files touched:** `src/_module_signal.html`.

> [!success] 2026-04-07: Backend Report Automation & Logic Cleanup
- **Optimized Ingestion Engine**: Refactored the daily report ingestion to an "Immediate Move" pattern. Files are now moved to the Master Archive as soon as they are parsed, eliminating the exponential slowdown caused by re-scanning folders after GAS timeouts.
- **Production_Incoming Alignment**: Corrected the `REFERENCE_FOLDER_ID` configuration to target the live Power Automate sync folder. Added MIME-type detection to identify Excel files even without `.xlsx` extensions.
- **EOD Automation Pipeline**: Implemented a 4-trigger daily schedule (9AM, 12PM, 3PM, 4:30PM) to ensure all reports are ingested and a final compiled review is generated before the 5PM cutoff.
- **Legacy Logic Purge**: Fully removed **CD Analysis** and **Special Crossings** logic, including `src/05_CDAnalyzer.js`, `src/_module_special_crossings.html`, and their associated backend functions and UI components.
- **Professional Menu Reorganization**: Rebuilt the Google Sheets UI under a single **Omni PMO** menu with a logical hierarchy (Data Pipeline, Review Engine, Quickbase Hub, Reporting, Maintenance). Removed all emojis for a cleaner, enterprise-grade look.
- **Signal Promotion**: Formally promoted the Signal monitoring logic from "experimental" to a Core Production Feature with updated high-resolution portfolio monitoring labels.
- **Special Crossings Restoration**: Recovered from a frontend crash by re-implementing `renderSpecialCrossingsAdminSection` directly into `_module_admin.html`. Restored full visibility of locally-populated crossing data in KPI chips and detail cards while maintaining the removal of legacy AI ingestion code.
- **Files touched:** `src/00_Config.js`, `src/01_Engine_Archive.js`, `src/01_Engine_DataDicts.js`, `src/02_Utilities.js`, `src/06_QBSync.js`, `src/WebApp.html`, `src/_module_admin.html`, `src/v2_shell_GlassFlow.html`, `src/05_CDAnalyzer.js` (deleted), `src/_module_special_crossings.html` (deleted).

> [!success] 2026-04-07: Standardized Headers & FAB Alignment Refinement
- **Standardized Header Template**: Unified the `Diagnostics Queue`, `Review Hub`, and `Manager Review` panels under a single compact `.inbox-header` template with a consistent **52px min-height**.
- **2-Tone Branding Alignment**: Enforced the 2-tone color palette (`var(--text-muted)` + `var(--accent)`) across all panel titles using the `.inbox-title-stack` pattern for a cohesive system-wide look.
- **Precision FAB/Close Morphing**: Re-anchored the Admin FAB to `top: 76px; right: 24px;` and the circular panel close buttons to `top: 8px; right: 12px;` (relative to a 12px panel margin). This ensures the centers of both buttons overlap perfectly, creating a high-fidelity "morphing" effect when toggling panels.
- **Deck Mode Orchestration**: Fixed responsiveness and alignment issues in Deck Mode by removing inline style overrides and hardening the `setAdminPanelOpen` logic. The FAB now correctly toggles the `Manager Review` action panel and persists its state reliably.
- **Structural Cleanup**: Repaired malformed HTML containers in `WebApp.html` and `v2_shell_GlassFlow.html` that were causing layout bleed, and eliminated duplicate code fragments at file ends.
- **Files touched:** `src/WebApp.html`, `src/v2_shell_GlassFlow.html`, `src/_module_admin.html`, `src/_module_deck.html`, `src/_module_router.html`, `src/_styles_badges.html`, `src/_styles_glassflow_core.html`, `src/_styles_layout.html`, `src/_styles_panels.html`.

> [!success] 2026-04-06: High-Fidelity Dock Refinement & WS20 Conclusion
- **Dynamic Card-Anchored Centering**: Replaced hardcoded dock offsets with a robust, multi-pass JS calculation in `syncDockClearanceState()`. The search dock now dynamically anchors its horizontal center to the active information card (`#project-schedule-card` or `#deck-stage-card`), ensuring perfect alignment even as panels slide or cards resize.
- **Vertical Equidistance (12px Symmetry)**: Enforced a strict 12px vertical gap symmetry. The distance from Nav to Dock and Dock to Content is now exactly equal, creating a high-fidelity "floating" integrated feel.
- **Stabilized Layout Sync**: Implemented a triple-pass measurement strategy (Immediate + rAF + 150ms/320ms settle) to ensure pixel-perfect positioning after CSS transitions and DOM updates.
- **Interactivity & Layering**: Elevated dock `z-index` to `2000050` to guarantee it remains clickable above all transition overlays. Standardized spring-physics transitions (`0.28s cubic-bezier(0.16, 1, 0.3, 1)`) for all dock movement.
- **WS20 Closure**: Completed the visual consistency sweep for Gantt, Grid, and Deck views. All desktop views now respect the new framed shell geometry and dynamic clearance model.

> [!success] 2026-04-06: Review Hub Layout Refactor & Interaction Polish
- **KPI Row Repositioning (Desktop & Mobile)**: Moved the `admin-kpi-mini-wrap` out of the Review Hub header and into a dedicated 3-column grid row immediately below the tabs (Desktop) or header (Mobile). This provides significantly more breathing room and visual clarity.
- **Header Cleanup**: Simplified the `review-hub-main-header` layout, removing "crammed" elements and establishing a consistent vertical hierarchy: Header -> Tabs -> KPIs -> Content.
- **Redesigned Admin FAB (Desktop)**: Updated the floating Admin FAB to a refined 36px diameter with improved dark mode visuals, including a glassy backdrop and high-contrast shadows.
- **Unified Close Interaction**: Added a dedicated Red X button (`review-hub-close-btn`) to the shared Review Hub header. This button is absolutely positioned to perfectly overlay the FAB's starting coordinates, creating a seamless "morphing" swap effect when the panel opens.
- **Layering & Visibility**: Lowered the FAB's `z-index` so it is correctly covered by the sliding panel. Updated CSS to ensure the FAB is properly hidden during startup/loading now that it resides at the body's top level.
- **Dead Code Cleanup**: Removed legacy navigation hub button logic (`btn-review-hub`) and redundant close buttons from the desktop panel markup to prevent future agent drift.

> [!success] 2026-04-05: WS21 — Universal Surface Tier (iPad mini)
- **New surface tier:** Added `html.surface-ipad` detection in `WebApp.html` auto-routing IIFE. Detects iPadOS 13+ (which reports Macintosh UA) via `pointer: coarse + min-width: 600px + min-height: 600px`. Sets `document.documentElement.classList.add('surface-ipad')` and `window.__surfaceIpad = true` without any redirect (iPad stays on WebApp.html desktop shell).
- **Variant state:** After all modules load, `setV2Variant('iPad')` is called when `__surfaceIpad` is set. Desktop and phone paths unchanged.
- **New CSS partial:** `src/_styles_ipad.html` — 15 sections covering: root tokens (sidebar 240-300px by orientation), touch-action/tap-highlight polish, 44px touch target floor on all interactive elements, reading pane momentum scrolling, grid rows 52px, Gantt rows 44px, admin/outbox as bottom sheet (70vh, 20px top radius, slide from translateY(100%)), help panel constrained, critical hub overlay constrained, queue item padding, deck touch-action passthrough.
- **Gantt rotate hint:** `_styles_gantt.html:233` updated to exclude `.surface-ipad` from the portrait rotate-hint — iPad can show Gantt in both orientations.
- **No shell changes:** `v2_shell_GlassFlow.html` untouched. Desktop experience bit-for-bit unchanged (all iPad CSS scoped under `html.surface-ipad`).
- **PRD:** WS21 added; Phases 1-3 marked complete, Phase 4 (QA) pending.

> [!success] 2026-04-04: Canonical OFS rewrite from reference-data source of truth
- **Architectural reset:** Replaced the “effective OFS” fallback model with a canonical OFS contract sourced only from `5_Reference_Data` `OFS DATE`.
- **New payload field:** `actionItems` now carry `canonicalOfsDate`, with legacy `ofsDate` forced to that same canonical value for compatibility while the rest of the app is still on mixed consumers.
- **Fallback removed:** The shared frontend OFS helpers no longer fall back to `targetDate`. Blank `OFS DATE` now means OFS is truly missing/TBD and should not appear in OFS month pills, filters, or calendar placements.
- **Diagnostics added:** Added OFS diagnostic metadata (`rawMirrorOfsDate`, `rawReferenceOfsDate`, `ofsDateMismatch`) plus a shared `getOfsDiagnosticMeta()` helper so remaining OFS mismatches can be audited instead of guessed.
- **Archive output aligned:** Mirror/archive export paths now write the canonical reference OFS value rather than whichever legacy alias happened to be present.
- **Validation note:** `node scripts/validate-mobile-shell.js` still fails only on the pre-existing desktop Review Hub marker assertions in `src/WebApp.html`; no new validation failure was introduced by the OFS rewrite.

> [!success] 2026-04-04: OFS consistency sweep across ingest + frontend render paths
- **Root cause expanded:** Fixing the reference-data ingest header (`OFS DATE` vs `Budget OFS`) restored the payload, but several frontend modules were still bypassing that corrected path and reading raw `item.ofsDate` directly.
- **Shared resolver added:** Introduced frontend OFS helpers in `src/_utils_shared.html` so the app now resolves one canonical effective OFS date via `item.ofsDate || item.targetDate`, then derives labels/month state from that shared source.
- **Queue/detail/grid/deck aligned:** Rewired OFS month pills, detail footer pills, deck exports, queue sort logic, mobile queue summaries, quick-peek, digest aging, and OFS dropdown generation to use the shared effective OFS helper instead of ad hoc parsing.
- **Calendar aligned too:** The calendar milestone builder now uses the same OFS resolver, so calendar OFS pills cannot drift from queue/deck/grid behavior.
- **Label cleanup:** Updated visible desktop hover copy from `Budget OFS` to `OFS DATE` where the UI exposes that field directly, matching the actual reference-data column name.
- **Validation note:** `node scripts/validate-mobile-shell.js` still fails only on the pre-existing desktop Review Hub marker assertions in `src/WebApp.html` (`review-hub-desktop-row-top`, `review-hub-desktop-row-tabs`, `review-hub-desktop-row-kpis`, `review-hub-kpi-strip`). No new validator regressions were introduced by the OFS sweep.

> [!success] 2026-04-04: Calendar milestone reformat for CX / OFS planning
- **Calendar widget rebuilt:** Reworked the existing `cal-widget` from a bare mini month grid into a larger executive planning calendar with month totals, milestone legend, taller day cards, and direct FDH pill rendering.
- **Milestone scope locked:** The calendar now renders only `CX START`, `CX COMPLETE`, and `OFS` milestones using existing queue data already in memory (`cxStart`, `cxEnd`, `ofsDate`) instead of introducing new backend shape or fetch behavior.
- **Pill semantics:** `CX START` and `CX COMPLETE` render as yellow/amber variants, while `OFS` uses the established teal pill treatment. Each pill shows the `FDH` identifier and milestone type in the day cell.
- **Overflow handling:** Dense days now show up to three visible milestone pills before collapsing the remainder into a `+N more` summary chip.
- **Navigation behavior:** Clicking any calendar pill opens the corresponding project in the shared detail pane through the existing `openPane()` selection flow rather than adding a second navigation path.
- **Executive OFS fix:** Calendar OFS milestones now fall back to `targetDate` when `ofsDate` is blank, matching the rest of the app’s OFS handling so the executive OFS view does not silently drop rows.
- **Root cause found:** The canonical OFS column in `5_Reference_Data` is `OFS DATE`, but shared ingest logic was still hardcoded to `Budget OFS`. Updated the reference-data and frontend payload mappers to accept both headers so OFS repopulates everywhere downstream.
- **Calendar scope corrected:** Removed the cross-app calendar-pill filtering experiment after it caused regressions. Calendar milestone pills are local again; the OFS correctness fix is now at the data-ingest layer instead of a UI workaround.
- **Validation note:** `node scripts/validate-mobile-shell.js` still fails only on the pre-existing desktop Review Hub marker assertions (`review-hub-desktop-row-top`, `review-hub-desktop-row-tabs`, `review-hub-desktop-row-kpis`, `review-hub-kpi-strip`) unrelated to the calendar slice.

> [!success] 2026-04-04: OMNISIGHT / OMNIFLOW startup rebrand and loader polish
- **Startup splash reworked:** Replaced the old “engine/terminal” startup screen with a calmer executive brand lockup built around `OMNISIGHT` and `OMNIFLOW`. The first impression now reads as portfolio intelligence + workflow execution rather than a faux console.
- **Shell-specific branding split:** Refined the startup treatment so desktop now presents `OMNISIGHT` only, while the GlassFlow mobile shell presents `OMNIFLOW` only. The split keeps each shell sharper and prevents the loader from trying to explain both products at once.
- **Dark / light mode parity:** Added a dual-theme splash treatment with soft atmospheric gradients, a glass panel, restrained shimmer on the progress rail, and neutral typography that stays premium in both light and dark mode.
- **Shared blocking loader aligned:** Updated the in-app frosted loader to use the same brand language and calmer hierarchy, so sync/review refresh states no longer fall back to generic loading chrome.
- **Boot copy normalized:** Startup step text now references shell-specific handoff language instead of “Benny engine” and fake low-level runtime messaging. Desktop speaks in `OMNISIGHT` decision-surface language; mobile speaks in `OMNIFLOW` workflow language.
- **Validation note:** `node scripts/validate-mobile-shell.js` still fails on pre-existing missing desktop Review Hub marker patterns (`review-hub-desktop-row-top`, `review-hub-desktop-row-tabs`, `review-hub-desktop-row-kpis`, `review-hub-kpi-strip`) unrelated to this loader slice.

> [!success] 2026-04-04: Review Hub activity recovery + dock clearance rollback
- **Activity badge/count recovery:** Reworked changelog badge counting so Activity no longer depends on `timestampObj` being populated. The Review Hub activity badge now reflects milestone logs reliably instead of sitting hidden at `0`.
- **Activity timestamp parsing hardened:** Added shared changelog timestamp parsing fallback (`timestampObj` -> `timestamp` -> `time/date`) for filtering and sorting, so older/newer activity rows render in the right order even when the payload is inconsistent.
- **Verbose date pill cleanup:** Date-style activity values such as `Fri Jun 05 2026 00:00:00 GMT-0500 (Central Daylight Time)` are now normalized before rendering, preventing raw JS `Date.toString()` output from leaking into pills and row text.
- **Activity notification pill fix:** The visible Activity badge was still stale because desktop and mobile shells both define `changelog-badge`, while the updater only wrote to the first DOM match. The updater now syncs every badge instance and counts recent milestone activity using the hardened timestamp fallback.
- **Activity badge logic unified:** Replaced the old session-gated “pulse seen” notification behavior with a canonical changelog count path. The pill now uses the same milestone/time-window selector as the Activity tab itself, so the badge can’t drift independently from the feed logic.
- **Desktop pane offset fix:** Tightened `syncDockClearanceState()` so the compact floating dock no longer pushes the Diagnostic Queue / Review Hub panes downward by itself. Only the expanded desktop filter panel can request extra clearance now.
- **Validation note:** Patch was verified by code-path inspection and diff review in `src/_module_changelog.html`, `src/_module_tabs.html`, and `src/_module_webapp_core.html`. No runtime smoke test was executed in this session.

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
