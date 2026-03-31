# WORKSTREAM 19 — Review Hub Reimagination

> **Status:** Active — in progress
> **Philosophy:** "Ground-up redesign. High tactile density. Mobile-native interaction."

## 🎯 The Vision
The Review Hub needs a radical departure from the "floating card" layout. It should feel like a dedicated "Station" within the app, utilizing full-screen real estate or highly-integrated sliding surfaces that don't feel detached from the shell.

---

## 🛠️ Current State

### Completed in this session
- [x] Reworked Admin, Reviewed, and Activity internals inside the existing GlassFlow Review Hub sheet.
- [x] Preserved the existing slide-up container and existing admin dock as the controlling frame.
- [x] Restored dock-owned tab switching (`Admin`, `Reviewed`, `Activity`, `Close`) as the primary navigation model.
- [x] Added denser internal list/feed treatments and follow-up polish to better match the native GlassFlow language.

### Do Not Reopen
- [x] Do not replace the existing bottom-anchored Review Hub container.
- [x] Do not replace the existing dock with a new tab/header system.
- [x] Keep scope on the active GlassFlow shell only unless a future workstream explicitly expands it.

## 🛠️ Implementation Plan

### Phase 1 — Spatial Refactoring
**Goal:** Establish a new physical presence for the Hub.
- [x] Refactor `.outbox-pane` geometry to remain a bottom-anchored slide-up station with native-feeling momentum.
- [x] Fix the masking/padding issues where scrollable content feels "cut off" or detached from its container.
- [x] Unify the background blur and saturation (Executive Glass) to match the premium feel of the dock.

### Phase 2 — Admin Hub (Re-reimagined)
**Goal:** High-density task management.
- [x] **Header Integration:** Move KPI filters into a dedicated sub-header or utility bar that stays sticky at the top.
- [x] **Icon Restoration:** Ensure all filters have high-quality SVG icons for quick scanning.
- [x] **Persistent Utilities:** Make the "Crossing to Verify" section a permanent resident of the Admin tab as a top-docked tray.
- [x] **Card Design:** Abandon the legacy card style for a denser, more list-oriented approach with actionable rows.

### Phase 3 — Reviewed Hub (Visual Distinction)
**Goal:** Absolute clarity on what is staged vs. what is finished.
- [x] Implement high-contrast, labeled sections for "Staged for Export" and "Finalized Reviews".
- [x] Add action strips to section headers (Batch Export, Clear All) to reduce vertical clutter within the list.
- [x] Use visual cues (accents, labels) to distinguish staged items from finalized reviews.

### Phase 4 — Activity Hub (Extreme Compaction)
**Goal:** Handle high log volume without scrolling fatigue.
- [x] Transition from cards to a dense feed-style view.
- [x] Remove redundant "Go to Project" buttons in favor of a compact row-level navigation affordance.
- [x] Use iconography to represent event types (Updates, Syncs, Flags) instead of text labels.
- [x] Implement a two-line summary limit with tap-to-expand logic for long change values.

### Phase 5 — Native-Language Polish & Validation
**Goal:** Keep WS19 open for final visual fit-and-finish and handoff-safe continuation.
- [ ] Tune spacing, typography, and section weight from a live visual pass rather than source-only iteration.
- [ ] Validate the Review Hub against real project data volume on device/simulator/browser.
- [ ] Resolve any remaining visual mismatch between Review Hub internals and the broader GlassFlow app language.
- [ ] Confirm final swipe, dock, and tab behavior in the running app before closing WS19.

---

## 📋 Smoke Test Checklist (Future)
- [ ] Entire Hub surface feels like a native part of the GlassFlow shell.
- [ ] No "masking" artifacts or strange whitespace gaps at the edges.
- [ ] Tabs switch instantly with tactile feedback.
- [ ] Activity feed is legible even with 100+ entries.
- [ ] Swipe-to-dismiss is consistent across the entire Hub station.

## 🔄 Handoff Notes
- Another agent can resume WS19 without reopening architecture decisions.
- The active constraint is: redesign the internals within the existing Review Hub sheet and existing dock language.
- The next useful pass is live visual tuning, not another structural rewrite.
