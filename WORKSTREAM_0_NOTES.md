// ============================================================
// FILE: WORKSTREAM_0_NOTES.md
// ROLE: Checkpoint note describing Workstream 0 foundation changes, preserved assumptions, and handoff state for Workstream 1.
// DEPENDS ON: _registry.html, 02_Utilities.js, WebApp.html, CLAUDE.md
// DEPENDED ON BY: Engineers and agents validating the staged refactor sequence.
// MOBILE NOTES: Notes the GAS-specific route and bridge assumptions preserved at the foundation layer.
// AGENT NOTES: Read this after CLAUDE.md to understand what was intentionally changed, what was left untouched, and what is next.
// ============================================================

# Workstream 0 Checkpoint (condensed 2026-03-26)
> WS15 complete (2026-03-27). Project renamed DPA → Omni PMO App across all platforms (commit a66a489).
> Resume point: WS16 or WS13 remaining items — confirm with user.

---

## Session Close Protocol (Required at every workstream close)

Run these steps in order after every workstream's final smoke test passes:

1. **Update phase table** — mark completed phases `✅` in the Phase Overview table above
2. **Append closeout line** — add `> Workstream N complete [date]. [summary]. Next: Workstream N+1.` to the header block
3. **Update AGENT_LOG.md** — append `> [!info] YYYY-MM-DD: WS[N] Complete` entry with phases, lessons, deferred items, and commit reference
4. **Update PRD.md** — check `[x]` for all completed phases; add `[ ]` stubs for next workstream if known
5. **Commit** — `git add` all modified/new files; use `refactor(ws[N]): summary` format per CLAUDE.md
6. **Output cold-start prompt** — paste-ready message for next session (see template below)

### Cold-Start Prompt Template

```
Handoff — DPA WS[N+1], resuming at Phase 1

Resume DPA WS[N+1]. Check memory and WORKSTREAM_0_NOTES.md for resume point.

Project: Omni-PMO-App
Path: /Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App

WS[N+1] scope: [one-line goal]

Protocol:
- You write one Copilot prompt at a time
- I paste into Copilot, smoke test, report pass/fail
- You update WORKSTREAM_0_NOTES.md after each pass
- Prefix every response with [Turn: X/25]

---
WS[N] done. Clean session reset. Go.
```

---

## Workstream History (condensed)

- [x] **WS0–WS1** (2026-03-21): GAS template routing fix, CSS extracted to 4 style partials, utility helpers extracted, 19 `google.script.run` calls inventoried (Data Call Inventory below).
- [x] **WS2–WS4** (2026-03-21): State inventory mapped; queue/router/session owners extracted to `_state_queue`, `_state_router`, `_state_session`.
- [x] **WS5–WS6** (2026-03-21): High-risk module extractions, router isolation, tabs extraction, desktop FAB dropdown (Sync QB / Run Review / Refresh).
- [x] **WS7** (2026-03-23): Full mobile app built (`MobileApp.html`) — 7 surfaces (Queue/Detail/Actions/Gantt/Admin/Digest + Polish).
- [x] **WS8** (2026-03-23): Auto-routing (`document.write` pattern), PWA closeout, offline queue caching.
- [x] **WS9** (2026-03-24): SVG icon system, system dark/light mode, polymorphic orientation dock, queue card redesign, Gantt bar colors.
- [x] **WS10** (2026-03-24): Full mobile feature parity — Gantt quick peek, Gemini on mobile, KPI HUD, Critical Hub, Changelog/Review Hub, Deck workspace, shared rendering primitives extracted.
- [x] **WS11** (2026-03-24): Visual redesign — transition tokens, slide animations, Fira Code typography, 3-level card depth. `_render_queue_card.html` WebApp cutover ⛔ deferred.
- [x] **WS12** (2026-03-26): Single Responsive Surface — `MobileApp.html` + `_styles_mobile.html` retired, WebApp.html fully responsive (9 phases).
- [ ] **WS13** (2026-03-26): Performance audit — 3 of 6 items done. Open: animation frame audit, virtual scroll eval, canvas sparkline eval.
- [x] **WS14** (2026-03-26): Stability-first modularization — 15+ modules extracted, `_module_webapp_core.html` reduced from 5,743 to 814 lines (8 phases).

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
- `WebApp.html` and `MobileApp.html` are separate surfaces — changes on one are not assumed to work on the other (MobileApp.html archived WS12)
- Z-index ranges are fixed — do not add layers outside defined ranges without updating `CLAUDE.md`
- `logMsg()` in `00_Config.js` is the only approved logging method for backend — no `console.log()`
- `doGet()` routing lives in `02_Utilities.js` — any new app surface must be registered there and documented in `CLAUDE.md`

---

## Design System Quick Reference

- **Style:** Data-Dense Dashboard + Dark Mode OLED
- **Pattern:** Drill-Down Analytics (queue → detail → quick peek)
- **UX rules:** 44px min touch targets, 8px+ gap, `touch-action: manipulation`, `overscroll-behavior: contain`
- **Micro-interactions:** 50–100ms state feedback, `navigator.vibrate(10)` on confirm actions
- **Anti-patterns:** No HUD/Sci-Fi FUI, no emoji icons (SVG only since WS9)
- **Typography:** Fira Code for FDH identifiers / technical values

---

## Architectural Guard Rails (WS12+)

- NEVER change `initDashboard()` or `applyFilters()` in `_module_webapp_core.html`
- NEVER change desktop layout at screen widths above 768px
- NEVER change any `.gs` backend files without a deliberate decision
- All CSS goes in existing style partials — no inline style blocks
- Responsive CSS = `@media (max-width: Npx)` only — do not change base rules
- Open deferred items: push notifications (GAS trigger + client sub design needed), external home screen icon wrapper (requires external hosting)
