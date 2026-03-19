# Omni PMO App - Backlog

## 🔴 NOW (Bugs & Quick Wins)
*Focus: UI Layout, Z-Index issues, and Data Formatting.*
**Status:** All `NOW` backlog items are complete.

- [x] **Deck view: Calendar + calculator widgets z-index**
  - **Expected:** Widgets always float on top of all deck content.
  - **Acceptance:** Opening calendar/calculator renders above the slide across all interactions (open/close, resize).
- [ ] **Diagnostics / action pills: Incorrect color mapping**
  - **Expected:** "OFS" and "Complete" pills consistently use the intended CSS variables.
  - **Acceptance:** No fallback to default/incorrect colors; matches design spec in all views.
  - **Task 7.2:** Layout bleed, Gantt dock positioning, and pill color audit in progress.
- [x] **Dates/times: Normalize formatting**
  - **Expected:** Ignore "midnight timestamp" noise (00:00:00) in change log and across app.
  - **Acceptance:** Change log displays date-only changes without time. Formatting is consistent.
- [x] **Dock + filter pills: Offset positioning + layering rules**
  - **Expected:** Filter pills float a few pixels above/below the dock depending on dock position.
  - **Acceptance:** No overlap with dock. Pills do not block widget interactions.
- [x] **Deck view: Polymorphic dock not switching cleanly**
  - **Expected:** Dock renders correct controls for active view only; no redundant spacers.
  - **Acceptance:** Switching views swaps dock contents correctly with no dead space.
- [x] **Review Hub/Admin panel: Add tab pill counter badges**
  - **Expected:** Purple badge for Activity, Green for Reviewed.
  - **Acceptance:** Badges update dynamically and match Admin counter badge styling.

## 🟡 NEXT (Core Workflow & Enhancements)
*Focus: Queue management, Admin panels, and Core Data filtering.*

- [ ] **Task 8: Split Slide Dock / Bottom Action Deck / Theater Dock Simplification**
  - Keep filters/search/face toggle in the shared top dock
  - Move Slide-only actions into a dedicated bottom action deck
  - Hide the top dock in Slide Theater mode and keep only the bottom control rail
  - Resolve the lingering empty dock space by removing Slide actions from the shared dock layout
- [x] **Theater mode: Detail card / deck slide sizing**
  - **Expected:** Increase card/slide size slightly while maintaining aspect ratio.
  - **Acceptance:** Card is visibly larger but retains comfortable margins (not edge-to-edge).
  - **Task 7.1:** Gantt Fullscreen view-switching and dock filters completed.
  - **Follow-up:** Task 7.2 addresses post-fix layout bleed and fullscreen dock regressions.
- [ ] **Diagnostics Queue: Simplify view modes**
  - **Expected:** Remove "Relaxed mode". Standardize on Grid, List, and Inbox modes across Detail and Deck views.
  - **Acceptance:** Relaxed mode code is removed; UI layout matches current intent for remaining modes.
- [ ] **Admin badges workflow: Diagnostics Queue → Reviewed**
  - **Expected:** Clearing an item removes it from the active queue and moves it to the Admin panel's Reviewed list.
  - **Acceptance:** Exports from the Reviewed tab produce correct groupings without duplicates.
- [ ] **Review Hub: "Staged" items grouped section**
  - **Expected:** Staged items appear under a collapsible "Staged" group in the Review tab. Commit/Export actions move to the group header.
  - **Acceptance:** Grouping persists per session; Commit/Export operates only on staged items.
- [ ] **Projects header pill HUD: Visual fixes & multi-select**
  - **Expected:** Fix spacing/typography. Support AND/OR multi-select filters.
  - **Acceptance:** User can select multiple vendors/cities simultaneously.
- [ ] **Header: Make "Critical" pill actionable**
  - **Expected:** Clicking the Critical pill opens a Critical Hub panel with a breakdown and actionable list.
  - **Acceptance:** Accurate live count; empty state handled gracefully.

## 🟢 LATER (New Features)
*Focus: Drag-and-drop, Advanced Analytics.*

- [ ] **Daily digest: QuickBase edits by person**
  - **Expected:** Show ranked list of top editors / top movers in the last 24h.
  - **Acceptance:** Integrates cleanly into morning briefing layout without breaking.
- [ ] **Filter dock: Add "Group by …" capability**
  - **Expected:** Reorganizes results into collapsible groups (Vendor / City / Stage).
  - **Acceptance:** Grouping respects existing filters/search and outputs correctly in exports.
- [ ] **Calculator: Make widget draggable**
  - **Expected:** Calculator can be dragged by a handle and position persists.
  - **Acceptance:** Snap-back constraints prevent dragging off-screen.
- [ ] **Vendor tracker: DRG "Direct Vendor" pill**
  - **Expected:** Google Sheet-backed flag shows a "DRG Tracker" pill in UI.
  - **Acceptance:** Displays consistently; opens correct DRG tracker link on click.
