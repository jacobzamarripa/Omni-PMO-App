# Omni PMO App - AI Coding Guidelines

## Tech Stack
* **Environment:** Google Apps Script (V8 Runtime).
* **Frontend:** Vanilla HTML, CSS, and ES6 JavaScript served via `HtmlService`. No external bundlers (Webpack/Vite) are currently used.
* **Backend:** Standard `.js` (Apps Script) files.
* **Database:** Google Sheets (`Master_Archive`, `Reference_Data`) synced with QuickBase APIs.

## Architecture Rules
1. **No Node.js:** Do not suggest `npm install`, `require()`, or standard Node.js modules. Use `UrlFetchApp` for HTTP requests, `SpreadsheetApp` for database operations, and `CacheService` for caching.
2. **Frontend Modifications:** `WebApp.html` and `MobileApp.html` are massive files. When making CSS/JS changes, search for existing `:root` variables and reuse them. Do not duplicate CSS classes.
3. **Date Handling:** QuickBase sends dates with midnight timestamps (e.g., `00:00:00 GMT-0600`). Always normalize these on the frontend using standard UTC-locked formatting utilities to avoid timezone shifting bugs.
4. **HtmlService Routing:** ALL HtmlService routes in `doGet()` must use `createTemplateFromFile('filename').evaluate()` — never `createHtmlOutputFromFile()`. The latter blocks script execution in some GAS iframe contexts. This applies to every current and future app surface.
5. **Mobile CSS Includes:** `MobileApp.html` must never contain a large inline `<style>` block. All CSS must live in included partials (`_styles_mobile.html` etc.) and be pulled in via `<?!= include('_styles_mobile') ?>`. GAS HtmlService sanitizes large inline style blocks and can silently break script execution. This applies to any future mobile partials as well.
6. **Z-Index Standards:** * Modals/Widgets (Calculator, Calendar, Digest): `999990` - `999999`
   * Help panel: `100021`
   * Help overlay: `100020`
   * Critical hub overlay: `100020`
   * Top nav (header): `100015`
   * Review Hub panel: `100010`
   * Floating Pills: `3000`
   * Deck/Cards: `5` - `100`
7. **WebApp Template Serving:** `WebApp.html` must be served via `createTemplateFromFile('WebApp').evaluate()` in `02_Utilities.js`, never `createHtmlOutputFromFile()`. The latter will silently break all `<?!= include() ?>` directives.

## Error Handling & Logging
* Use the custom `logMsg()` function in `00_Config.js` instead of `console.log()` for backend logic, as it writes directly to the `System_Logs` sheet.

## Git Commit Convention
Every workstream closes with a structured Git commit using
this format:

  type(scope): one line summary

  - bullet per file created
  - bullet per file modified
  - smoke test result and date

  [One line on what this commit unblocks or completes.]

Valid type prefixes:
- refactor(ws[N]) — workstream close
- feat([module]) — new feature
- fix([file]) — bug fix
- docs — documentation only changes
- chore — config, tooling, cleanup

## Workstream Protocol
When executing any workstream in this project:
1. Read CLAUDE.md and WORKSTREAM_0_NOTES.md in full first
2. Read _registry.html before touching any data logic
3. Produce an inventory or audit and pause for approval
   before extracting anything
4. One phase at a time — pause after each phase for user
   smoke test before proceeding
5. No logic changes during structural refactors — extraction only
6. Add the standard file header to every new file created
7. Update CLAUDE.md File Map and WORKSTREAM_0_NOTES.md after
   every phase
8. Close every workstream with a structured Git commit
9. Never move initDashboard() or applyFilters() — bootstrap anchors
10. Redeploy as a new version after every structural change

## Recent UI / Workflow Lessons
1. **Tracker-linked projects:** The real frontend signal for vendor-tracker-linked projects is the engine output in `Field Production`, specifically `[📡 Tracker Linked]`. Do not assume DRG/Direct Vendor columns are the source of truth when the engine already computed tracker linkage.
2. **Tracker override behavior:** Vendor tracker data is already triangulated in `01_Engine.js` and can override baseline database assumptions during Daily Review generation. When adding frontend indicators, follow the review output the engine writes, not a guessed sheet flag.
3. **Frontend tracker pills:** For tracker visibility, prefer a reusable frontend pill keyed off the actual payload state. Keep the pill consistent across queue cards, grid cards, and detail headers.
4. **Diagnostic flag styling:** Engine flags may include emoji markers like `🔵 OFS`, `🟢 COMPLETE`, or `⚪ ON HOLD`. Shared frontend cleaners/tag classifiers must recognize and strip those cleanly so badges do not render as broken `?` icons.
5. **Layout changes:** When the request is for more breathing room around cards or panels, adjust viewport/container spacing first. Do not change internal module padding, card proportions, or aspect-ratio behavior unless the user explicitly asks for that.
6. **Detail vs. deck sizing:** Treat detail cards and deck slides separately. A change that works for the 16:9 deck slide may be wrong for the variable-height detail card.
7. **Admin panel spacing:** The admin/review panel is not anchored the same way as the Diagnostics Queue. If the goal is viewport padding, add spacing on the panel container itself rather than assuming dock padding will affect it.
8. **Bottom dock behavior:** When the dock moves to the bottom (notably in Gantt view), dropdown menus should open upward and floating filter pills should anchor above the dock.
9. **Gantt interactions:** Clicking a timeline item should be treated as both a navigation/open action and a focus action when the user asks for focus mode behavior.
10. **Before changing visuals:** Verify whether the user wants a larger component, more viewport margin, more internal padding, or a different aspect ratio. Those are not interchangeable.
11. **FAB dropdown replaced header button cluster in Workstream 6:** Sync QB, Run Review, and Refresh are now in the FAB dropdown. Dark mode and Help remain as standalone header buttons. Do not add new actions directly to the header markup — add them to the FAB dropdown instead.

## Safe Defaults For Future Changes
* Prefer using existing engine-generated markers over introducing new parallel flags.
* Reuse existing CSS variables and shared pill/tag helpers before adding one-off inline styles.
* For large layout tweaks, make the smallest possible change first and verify whether the issue is container spacing, internal spacing, or sizing constraints.
* In Gantt mode, assume dock behavior may need to invert vertically compared with top-dock detail mode.

## File Map
> Agent navigation index. Read this before opening any file.
> Last updated: March 22, 2026

### How to Use This Map
- Check **Agent Notes** before editing any file
- Check **Mobile Notes** if touching layout or event handling
- `QB_USER_TOKEN` lives in Script Properties only — never in frontend code
- `Master_Archive` and `Reference_Data` are read-only from the frontend
- `writebackQBDirect()` is guarded by early return — do not remove the guard
- When in doubt about tracker state, trust the engine output in `01_Engine.js` — not sheet flags
- Reuse existing `:root` CSS variables — do not duplicate classes or add one-off inline styles

---

### Backend — Core / Read First

| File | Role | Agent Notes |
|---|---|---|
| `00_Config.js` | Global constants, sheet names, formatting helpers, shared backend utility primitives | Read before touching any backend file. Sheet name constants live here — never hardcode sheet names elsewhere. |
| `01_Engine.js` | Daily review engine, archive parsing, vendor/ref lookups, mirror-sheet generation | Source of truth for tracker linkage and engine flags (`🔵 OFS`, `🟢 COMPLETE`, etc.). Do not replicate its logic in frontend. |
| `02_Utilities.js` | GAS entrypoints, HtmlService routing, web-app bridges, exports, utility workflows | Contains `doGet()` routing to `WebApp.html` vs `MobileApp.html`. Touch when adding new server-exposed functions. |
| `03_Analytics.js` | Historical benchmark and milestone timeline generation | Isolated — safe to edit without reading other backend files. |
| `05_CDAnalyzer.js` | Gemini/CD analysis workflows, AI narrative generation | Gemini entry points only. Do not hardcode model strings — pull from `00_Config.js`. |
| `06_QBSync.js` | QuickBase sync, change-log import, crossings queue staging, guarded writeback stub | Read QB guard comment before touching writeback. CSV export path only — no direct QB writes from frontend. `QB_USER_TOKEN` via Script Properties only. |

---

### Frontend — Shells

| File | Role | Agent Notes | Mobile Notes |
|---|---|---|---|
| `WebApp.html` | Desktop HtmlService shell with extracted style/state/module partials, desktop nav FAB markup, and the remaining bootstrap anchors/shared runtime glue | **Massive file.** `initDashboard()` and `applyFilters()` remain the bootstrap anchors in the shell. Shared quick-peek paths, shared KPI HUD helpers, nav FAB toggle logic, and a few cross-module globals still live here. When extracting partials, use `<?!= include('filename') ?>`. | Desktop-only layout assumptions — flag any px widths before mobile work |
| `MobileApp.html` | Mobile HtmlService app surface — phone and tablet. **All 7 phases + Design Polish Pass complete (WS7).** CSS lives in `_styles_mobile.html` — never inline. Requires `?view=mobile` parameter. Bottom tab bar: Queue, Detail, Gantt, Admin, Digest. | Routed from `02_Utilities.js` doGet(). Treat as separate surface from `WebApp.html` — changes that work on desktop may break mobile. Read `_styles_mobile.html` before any CSS work here. WS8 items: auto device detection, PWA install, offline cache, Gantt quick peek, Crossings staged commit. | Primary mobile surface — touch targets, font sizes, and bottom tab bar behavior live here |
| `Sidebar.html` | Sidebar dashboard view, anomaly cards, lightweight filtering | Isolated — safe to edit independently | N/A |
| `DatePicker.html` | Modal date-picker partial used by GAS dialogs | Isolated modal — z-index range `999990–999999` | N/A |

---

### Frontend — Partials & Registry

| File | Role | Agent Notes | Mobile Notes |
|---|---|---|---|
| `_registry.html` | Declarative registry of data-layer boundaries, guarded integrations, shared frontend state names | **Read first before any data logic.** Loaded before all other partials. | N/A |
| `_styles_base.html` | Global design tokens, resets, typography, and core theme variables | Read before editing any shared color, spacing, or theme token. | Contains viewport tokens like `--inbox-panel-width` that need mobile review |
| `_styles_layout.html` | Structural page framing, panel positioning, and responsive layout scaffolding | Read with `WebApp.html` markup before changing workspace or pane structure. | Contains desktop-first pane widths and touch-device layout assumptions |
| `_styles_components.html` | Non-Gantt component visuals, overlays, controls, and utility widget styling | Read after `_styles_base.html`; prefer existing component selectors over adding new ones. | Contains hover states, dense controls, and fixed-size widgets that are desktop-biased |
| `_styles_gantt.html` | Gantt timeline, sticky headers, quick peek, HUD, and Gantt-owned styles | Read with Gantt markup/runtime before touching timeline visuals or layering. | Contains fixed row-header widths, hover HUD patterns, and fullscreen layout assumptions |
| `_styles_mobile.html` | CSS partial for `MobileApp.html` — all mobile styles live here. Included via `<?!= include('_styles_mobile') ?>` in `MobileApp.html`. Never put large CSS blocks inline in `MobileApp.html`. Token system complete (WS7 Polish Pass): all hardcoded colors replaced with tokens; key tokens: `--text-inverse`, `--overlay-strong`, `--overlay-chip-count`, `--overlay-chip-active`, `--overlay-gantt-spike`, `--flag-critical`, `--flag-review`, `--pill-*`, `--qb-*`. | GAS sanitizes large inline style blocks and can silently break script execution — CSS must stay in this partial. Read before any mobile CSS work. Reuse existing `:root` tokens — do not add hardcoded colors. | This IS the mobile CSS surface — all touch targets, tab bar, orientation hints, and mobile layout tokens live here |
| `_state_queue.html` | Authoritative queue, selection, filter, grouping, and queue view-mode state owner | Load before shared utilities, modules, and the main runtime. Keeps queue globals on `window` via top-level declarations. | Any future mobile queue/filter surface should read from this shared state owner |
| `_state_router.html` | Authoritative workspace routing, detail face, deck mode, deck index, and dock placement state owner | Load after `_state_queue.html` and before modules. Bottom-dock inversion behavior depends on this state staying global. | Dock-placement behavior will matter for any mobile surface that mirrors Gantt/dock patterns |
| `_state_session.html` | Authoritative PM session memory, staged deck, ref-data date, and presentation mode state owner | Load after `_state_router.html`. Used by deck staging, export flows, PM memory, and ref-data indicators. | Any mobile surface showing ref-data age or staged deck status should read from this state owner |
| `_utils_shared.html` | Pure shared frontend helpers for escaping, date normalization, and classification logic | Safe to read alone for pure helper changes, but verify call sites in `WebApp.html` before changing return behavior. | Indirect mobile impact through shared formatting and status classification |
| `_utils_notifications.html` | Shared dock-status, toast, and UI error wrapper helpers | Depends on existing DOM ids and `previousDockState` in `WebApp.html`; read call sites before editing. | Desktop-oriented dock and toast assumptions will need adaptation for mobile surfaces |
| `_module_router.html` | Workspace routing, dock sync, view switching, and panel tab orchestration helpers | Read `_state_router.html` first. Owns `switchWorkspaceView()`, dock placement sync, Review Hub panel mode sync, and panel tab switching. | Desktop router/dock assumptions should guide mobile architecture, not be copied directly |
| `_module_tools_widgets.html` | Calculator and calendar widget runtime with drag, persistence, and inline control handlers | Low-risk extracted module. Public surface remains on `window` for existing inline handlers and keyboard listeners. | Fixed-position widget behavior and drag UX remain desktop-biased |
| `_module_changelog.html` | Review Hub changelog rendering module | Keep `allGlobalLogs` global in `WebApp.html` until bootstrap state moves. Rendering only lives here; payload hydration remains in shell. | Changelog panel density and controls remain desktop-first |
| `_module_theme_controls.html` | Shared dark-mode icons, theme toggle handlers, and system-theme listener | Keep presentation-mode theme handoff in `WebApp.html`; only shared theme controls live here. | Mobile theme button shares this runtime, but presentation specifics still live in desktop shell |
| `_module_queue_state.html` | Queue rendering, grouping, filter UI helpers, selection adapter, and queue view helpers | Reads queue/selection/filter globals from `_state_queue.html`. Keep bootstrap anchors in `WebApp.html`; this module should stay load-ordered before downstream admin/gantt/deck modules. | Future mobile queue work can reuse grouping/filter logic, not desktop markup |
| `_module_digest.html` | Digest workspace rendering, analytics summaries, vendor map, and digest side-panel helpers | Depends on `allGlobalLogs` hydration from `WebApp.html` and queue selection state from `_state_queue.html`. | Desktop digest layout is dense; mobile should adapt data helpers and not reuse the full workspace layout |
| `_module_admin.html` | Admin pane rendering, panel helpers, reviewed tray persistence, and outbox rendering | Reads queue/review state from `_state_queue.html`. Crossings-specific rendering/actions were split into `_module_special_crossings.html`. | Review Hub panel layout remains desktop-first |
| `_module_tabs.html` | Review Hub tab UI and badge handlers | Depends on router ownership from `_module_router.html`. Badge updates live here; fullscreen bleed-through is documented but not fully resolved. | Mobile tab UX should be redesigned rather than reusing desktop tab markup directly |
| `_module_special_crossings.html` | Special crossings admin section, verification action, staged commit workflow, and crossings review helpers | Keep Gemini/registry contracts unchanged. Still depends on shared queue/admin review state. | Desktop review flow only for now |
| `_module_gantt.html` | Partial Gantt extraction: core render/session/focus helpers, row-header-coupled `renderGantt()`, and hover HUD helpers | Conservative partial only. Quick-peek write flows, shared KPI HUD helpers, and shared workspace dock orchestration still remain in `WebApp.html`. | Mobile timeline should reuse data ideas only; desktop sticky headers/fullscreen assumptions remain here |
| `_module_deck.html` | Deck/slide workspace rendering, PM memory helpers, staging/export flows, and presentation/theater runtime | Reads `stagedDeckItems`, `pmSessionMemory`, and `isPresentationMode` from `_state_session.html`. `moveItemToReviewed()` still writes back into queue/admin state by design. | Presentation keyboard/runtime behavior is desktop-specific; mobile should not reuse it directly |

### WebApp Include Order
- `_registry.html`
- `_styles_base.html`
- `_styles_layout.html`
- `_styles_components.html`
- `_styles_gantt.html`
- `_state_queue.html`
- `_state_router.html`
- `_state_session.html`
- `_utils_shared.html`
- `_utils_notifications.html`
- `_module_router.html`
- `_module_tabs.html`
- `_module_tools_widgets.html`
- `_module_changelog.html`
- `_module_theme_controls.html`
- `_module_queue_state.html`
- `_module_digest.html`
- `_module_admin.html`
- `_module_special_crossings.html`
- `_module_gantt.html`
- `_module_deck.html`
- main inline script

---

### Documentation

| File | Role |
|---|---|
| `CLAUDE.md` | This file — agent navigation index and coding guidelines |
| `WORKSTREAM_0_NOTES.md` | Checkpoint note for foundation workstream and preserved assumptions |

---

### Data Layer Boundaries (Critical)
```
QuickBase (system of record)
    ↓  read-only sync via 06_QBSync.js
Reference_Data sheet (GAS mirror — READ ONLY)
    ↓  read-only to frontend
Master_Archive sheet (working data)
    ↑  engine writes here via 01_Engine.js
    ↓  verified rows queue to →
Crossings queue staging → CSV export → manual QB entry
CD Analyzer → writes via 05_CDAnalyzer.js only
```

---

### Z-Index Standards

| Layer | Range |
|---|---|
| Modals / Widgets (Calculator, Calendar, Digest) | `999990 – 999999` |
| Help panel | `100021` |
| Help overlay | `100020` |
| Critical hub overlay | `100020` |
| Top nav (header) | `100015` |
| Review Hub panel | `100010` |
| Floating Pills | `3000` |
| Deck / Cards | `5 – 100` |

---

### Agent Quick Reference

| I want to... | Start by reading... |
|---|---|
| Add a new `google.script.run` call | `_registry.html`, `02_Utilities.js` |
| Add a tracker indicator or pill | `01_Engine.js` output first, then `WebApp.html` pill/tag helpers |
| Change QB writeback behavior | `06_QBSync.js`, `_registry.html` |
| Add a Gemini feature | `05_CDAnalyzer.js`, `00_Config.js` |
| Change global styles / tokens | Search `:root` in `WebApp.html` or `MobileApp.html` — reuse, don't duplicate |
| Work on Gantt | `WebApp.html` Gantt section + bottom dock inversion rules (see Safe Defaults) |
| Add an admin/review panel feature | `WebApp.html` admin section — note panel is not anchored like Diagnostics Queue |
| Take a feature mobile | `MobileApp.html` + bottom dock upward-open behavior |
| Add a new backend utility | `00_Config.js` for constants, `02_Utilities.js` for GAS entrypoint |
| Debug engine flags or tracker state | `01_Engine.js` — do not guess from sheet columns |
| Add logging | Use `logMsg()` in `00_Config.js` — never `console.log()` for backend |
