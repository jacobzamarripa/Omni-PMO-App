# Omni PMO App - Backlog

## 🔴 NOW (Bugs & Quick Wins)
*Focus: UI Layout, Z-Index issues, and Data Formatting.*
**Status:** All `NOW` backlog items are complete.

- [x] **Deck view: Calendar + calculator widgets z-index**
  - **Expected:** Widgets always float on top of all deck content.
  - **Acceptance:** Opening calendar/calculator renders above the slide across all interactions (open/close, resize).
- [x] **Diagnostics / action pills: Incorrect color mapping**
  - **Expected:** "OFS" and "Complete" pills consistently use the intended CSS variables.
  - **Acceptance:** No fallback to default/incorrect colors; matches design spec in all views.
  - **Completed:** Unified web chip semantics for status and diagnostic surfaces.
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
**Status:** All `NEXT` backlog items are complete.

- [x] **Task 8: Split Slide Dock / Bottom Action Deck / Theater Dock Simplification**
  - Keep filters/search/face toggle in the shared top dock
  - Move Slide-only actions into a dedicated bottom action deck
  - Hide the top dock in Slide Theater mode and keep only the bottom control rail
  - Resolve the lingering empty dock space by removing Slide actions from the shared dock layout
- [x] **Theater mode: Detail card / deck slide sizing**
  - **Expected:** Increase card/slide size slightly while maintaining aspect ratio.
  - **Acceptance:** Card is visibly larger but retains comfortable margins (not edge-to-edge).
  - **Task 7.1:** Gantt Fullscreen view-switching and dock filters completed.
  - **Follow-up:** Task 7.2 addresses post-fix layout bleed and fullscreen dock regressions.
- [x] **Diagnostics Queue: Simplify view modes**
  - **Expected:** Remove "Relaxed mode". Standardize on Grid, List, and Inbox modes across Detail and Slide views.
  - **Acceptance:** Relaxed mode code is removed; UI layout matches current intent for remaining modes.
  - **Completed:** Queue modes now use one Inbox / List / Grid system with matching behavior across Detail and Slide.
  - **Follow-up complete:** Queue Grid spacing and schedule beads now match between Detail and Slide.
- [x] **Admin badges workflow: Diagnostics Queue → Reviewed**
  - **Expected:** Clearing an item removes it from the active queue and moves it to the Admin panel's Reviewed list.
  - **Acceptance:** Exports from the Reviewed tab produce correct groupings without duplicates.
  - **Completed:** Reviewed now persists locally until export/clear, Admin clears feed the Reviewed tray, and the panel is sectioned into Staged + Reviewed.
- [x] **Review Hub: "Staged" items grouped section**
  - **Expected:** Staged items appear under a collapsible "Staged" group in the Review tab. Commit/Export actions move to the group header.
  - **Acceptance:** Grouping persists per session; Commit/Export operates only on staged items.
  - **Completed:** Staged items now persist for the browser session, render in a collapsible Review-tab group, and header actions operate only on staged items.
- [x] **All views: Audit + clean up view-specific docks**
  - **Expected:** Each view's dock is verified and cleaned so spacing is consistent with no dead space.
  - **Scope:** Review each view dock (Deck, Theater, and all other supported view modes).
  - **Acceptance:**
    - Every view dock has intentional spacing only — no dead/blank zones.
    - No duplicate or unused spacer components remain.
    - Dock alignment and padding matches the design system across all views.
  - **Completed:** Dock spacing is now normalized across detail, grid, deck, and theater states; empty dock zones and slide-action clusters are auto-suppressed; and floating active-filter pills anchor with a small gap from the currently visible dock instead of using fixed positions.
- [x] **Projects header pill HUD: Visual fixes & multi-select**
  - **Expected:** Fix spacing/typography mismatch vs. design spec. Support AND/OR multi-select filters.
  - **Scope:** Pill HUD layout, responsive behavior, and filter logic.
  - **Acceptance:**
    - Pill HUD renders consistently across breakpoints and does not overlap/clamp other header controls.
    - User can select multiple filter values per category (multiple vendors, cities, health states, etc.).
    - Multiple active selections represented as multiple pills or a summarized pill per design.
    - User can clear individual selections and "clear all".
    - Filtering logic applies AND/OR semantics as documented per filter type.
  - **Completed:** Header KPI/HUD spacing is breakpoint-tuned, selector chips summarize multi-select state, active selections remain removable as pills with clear-all support, and the Projects HUD now documents OR-within-category / AND-across-category semantics while reflecting active filters.
- [x] **Header: Make "Critical" pill actionable (open Critical Hub)**
  - **Expected:** Clicking the Critical pill opens a Critical Hub panel with a breakdown and actionable list.
  - **Hub contents:**
    - Clear count breakdown (what is considered "critical").
    - List of critical items with quick actions (navigate, assign, resolve/acknowledge).
    - Filtering/sorting by market, vendor, type.
  - **Acceptance:**
    - Critical pill is consistently clickable and opens the hub.
    - Hub content matches the pill count and is not empty when count > 0.
    - User can click an item and be taken to the relevant record/context.
    - If count = 0, hub shows a clear "no critical items" empty state — no confusing blank.
  - **Completed:** The Critical pill now opens a filterable Critical Hub with live count parity, derived critical-type breakdowns, market/vendor/type sorting and filters, navigate + local acknowledge actions, and a non-blank empty state.

## 🟢 LATER (New Features)
*Focus: Drag-and-drop, Advanced Analytics, Data Source Indicators, Architecture.*

- [x] **Gantt refactor: Promote to first-class view + Today indicator on Project Schedule Card**
  - **Summary:** Retire the Gantt bottom-drawer panel pattern. Promote Gantt to a full-screen, first-class view showing a master timeline of all projects. Extract the Today indicator from the Gantt and embed a faithful replica on every Project Schedule Card in the main view. Lazy-load Gantt graphics so they no longer impact initial app load or view-switching performance.
  - **Motivation:**
    - The bottom-drawer Gantt was appropriate before the Project Schedule Card existed, but the card now provides sufficient timeline context in the main view.
    - Timeline context (today's position relative to project start/end) is valuable in the main view and shouldn't require opening a heavy panel to access.
    - Gantt rendering (SVG bars, axis, scroll) is the most graphics-intensive part of the app. Deferring it to an explicit navigation event should yield a noticeable performance improvement across all other views.

  - **Workstream 1 — Retire the Gantt drawer, promote to full-screen master timeline view**
    - Remove the bottom-slide Gantt panel/drawer from the main view layout entirely.
    - The existing view switcher Gantt picker becomes the canonical entry point; it now opens a true full-screen Gantt view (not a drawer overlay).
    - The Gantt view displays a **master timeline of all projects** (not project-scoped).
    - Clicking the timeline area on a Project Schedule Card navigates to the Gantt view in **focus mode**, scrolled and scoped to that specific project's timeline. Focus mode surfaces that project's row prominently within the master Gantt — it is not a separate view, but a contextual entry point into the shared Gantt with that project in focus.
    - Remove all drawer-related Gantt code paths (open/close animation, bottom-slide container, panel z-index logic).
    - **Acceptance:**
      - Gantt view is reachable via the view switcher (opens master timeline) and via Project Schedule Card timeline click (opens master timeline focused on that project).
      - Card-click focus correctly scrolls to and highlights the clicked project's row in the master Gantt.
      - Navigating to the Gantt via view switcher (without a focus context) opens the master timeline at today or at the last scroll position.
      - Gantt view renders all projects in a single master timeline.
      - No drawer/panel remnant exists in the codebase or UI.
      - View switcher correctly marks Gantt as the active view when selected.
      - Navigating away from Gantt and back preserves scroll position (session persistence).

  - **Workstream 2 — Today indicator on the Project Schedule Card**
    - Extract the Today indicator from the Gantt component into a standalone, reusable visual primitive.
    - Embed this primitive on every Project Schedule Card in the main view.
    - **Visual spec (must match Gantt exactly):**
      - A thin red vertical line spanning the full height of the card's timeline area, intersecting **behind** all project timeline bars.
      - A floating "Today" pill sitting above the red line, matching the exact pill style used in the Gantt (font, padding, color, shadow).
      - The pill and line are positioned by calculating today's date as a percentage offset between the project's start and end dates.
    - If today falls outside the project's date range (before start or after end), the indicator is hidden or clamped to the nearest edge with a muted visual treatment.
    - **Acceptance:**
      - Every Project Schedule Card with a valid start and end date shows the Today indicator.
      - Visual treatment matches the Gantt Today indicator exactly (pill style, line weight, color, layering).
      - Indicator position is mathematically correct relative to the card's timeline span.
      - Out-of-range dates handled gracefully — no overflow, no broken layout.
      - Indicator updates correctly when the active date or filter changes.

  - **Workstream 3 — Lazy-load Gantt rendering**
    - Gantt component (SVG bars, date axis, row layout, scroll state) must **not** initialize or render until the user explicitly navigates to the Gantt view.
    - On first navigation to Gantt view, render with a loading state (skeleton or spinner) while the component mounts.
    - Subsequent navigations to Gantt within the same session use a cached/mounted instance — do not re-destroy on every view switch, just hide/show.
    - **Acceptance:**
      - App initial load triggers zero Gantt rendering logic.
      - Switching between Deck/Theater/Detail/etc. causes no Gantt-related computation or DOM activity.
      - First open of Gantt view shows a loading state, then renders completely.
      - Re-opening Gantt within the same session renders immediately (cached instance).
      - No measurable regression in Gantt render quality or interactivity after lazy-loading is applied.

- [ ] **Filter dock: Add "Group by …" capability**
  - **Expected:** Filter dock includes a "Group by" selector (Vendor / City / Health / Stage / etc.). Selecting a grouping reorganizes the result set into collapsible/scrollable groups. Works across views (Deck/Theater/Detail) and respects existing filters/search.
  - **Acceptance:**
    - User can choose `Group by: <field>` from a defined set of supported fields.
    - Groups render with clear headers and item counts.
    - Export/report output remains correct when grouped (exports grouped structure or flattened rows predictably).
    - Setting Group by to "None" returns to ungrouped list/grid without losing filters.

- [ ] **Calculator: Make widget draggable**
  - **Expected:** Calculator can be clicked-and-dragged to reposition within the app workspace. Position persists at least for the current session (ideally per-user between sessions). Must continue to float above other UI layers.
  - **Acceptance:**
    - User drags calculator via a clear handle region (header bar) without accidentally clicking buttons.
    - Snap-back or edge constraints prevent dragging fully off-screen.
    - Closing/reopening calculator returns it to last position (session persistence minimum).
    - No layout glitches in Deck/Theater/other views.

- [x] **Vendor tracker: DRG "Direct Vendor" pill**
  - **Background:** A Google Sheet flag already exists for Direct Vendor tracking (DRG), but the app has no visible indicator.
  - **Expected:** Projects flagged for Direct Vendor tracking display a "DRG Tracker" / "Direct Vendor" pill/badge in relevant surfaces (header, project card, detail view). Pill provides context on hover/click (tooltip or hub link explaining what it means, and optionally a link to the tracker sheet).
  - **Acceptance:**
    - DRG-flagged projects display the pill consistently across all views.
    - Non-flagged projects do not show the pill.
    - Pill text + color follows design system and does not conflict with other status pills.
    - If a link is included, it opens the correct DRG tracker (permissions-dependent).
  - **Completed:** DRG flags now flow from the sheet/reference data into the dashboard payload, and flagged projects show a consistent teal tracker pill in list cards, grid cards, activity cards, and the detail header with hover context plus a tracker-sheet link when available.
