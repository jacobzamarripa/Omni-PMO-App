# Copilot Handoff — Omni PMO Mobile App
**Workstream 7 closed March 23, 2026**

This document is a complete handoff for any AI agent or developer continuing work on the Omni PMO mobile surface.

---

## What Was Built (WS7)

A fully functional mobile app surface (`MobileApp.html`) served via GAS HtmlService at `?view=mobile`. Five tab surfaces with bottom tab bar navigation, all built and polished:

| Tab | Phase | What it does |
|---|---|---|
| Queue | Phase 2 | Project list with search, filter, group-by, pull-to-refresh |
| Detail | Phase 3 | Full project detail, swipe nav, commit/skip actions, PM note |
| Actions | Phase 4 | Run Review, Sync QB, Refresh via FAB; all backed by `google.script.run` |
| Gantt | Phase 5 | Timeline with month/week zoom, today line, EOM + spike markers, bar tap → Detail |
| Admin | Phase 6 | Crossings / QB Status / Missing BOMs sub-tabs, Mark Updated writeback |
| Digest | Phase 7 | Pipeline stats, stage breakdown bars, vendor leaderboard, activity feed |
| Polish | Phase A+B | Token cleanup (39 replacements), visual consistency (radius, padding, font) |

---

## File Architecture

```
MobileApp.html          ← JS runtime, HTML markup, all tab logic
_styles_mobile.html     ← ALL CSS for mobile (never inline in MobileApp.html)
02_Utilities.js         ← doGet() routing — ?view=mobile → MobileApp.html
00_Config.js            ← logMsg(), constants shared with mobile backend calls
01_Engine.js            ← getDashboardData() source of truth for all queue data
```

**Hard rule:** Never put a `<style>` block directly in `MobileApp.html`. GAS HtmlService sanitizes large inline style blocks and silently breaks script execution. All CSS goes in `_styles_mobile.html` and is included via `<?!= include('_styles_mobile') ?>`.

---

## Data Flow

```
getDashboardData()          ← called on load via google.script.run
    ↓
mobileState.all             ← full project array, source of truth for all tabs
mobileState.filtered        ← filtered subset used by Queue
mobileState.committed       ← locally reviewed items (not persisted to server)
mobileState.activeItem      ← selected project for Detail
globalLogs                  ← activity log array (used by Digest feed)
vendorGoals                 ← vendor goal map (used by Digest leaderboard)
globalEndCounts             ← EOM BSL map (used by Gantt)
globalTodayData             ← today stats (used by Digest summary)
```

No new backend calls were added in WS7 — all tabs consume the existing `getDashboardData()` payload.

---

## CSS Token System (complete as of Polish Pass)

All colors in `_styles_mobile.html` use `:root` tokens. Never add a hardcoded hex or rgba. Key tokens:

| Token | Value | Used for |
|---|---|---|
| `--text-inverse` | `#ffffff` | White text on dark/colored buttons and pills |
| `--flag-critical` | `#ef4444` | Critical severity outlines, error colors |
| `--flag-review` | `#f59e0b` | Warning/review severity |
| `--pill-complete-bdr` | `#22c55e` | Complete state borders and fills |
| `--pill-ofs-bg` | `rgba(59,130,246,0.15)` | OFS tint backgrounds |
| `--pill-ofs-bdr` | `#3b82f6` | OFS borders and Gantt OFS bars |
| `--pill-permitting-bdr` | `#a855f7` | Permitting state (note: differs from legacy `#8b5cf6`) |
| `--pill-hold-bdr` | `#94a3b8` | On-hold state |
| `--qb-ug` | `#f97316` | Active/UG state, Gantt active bars |
| `--accent-hub` | `#3b82f6` | Primary action blue (buttons, indicators) |
| `--overlay-strong` | `rgba(15,23,42,0.82)` | Dark overlay (orientation hint bg) |
| `--overlay-chip-count` | `rgba(0,0,0,0.15)` | Sub-tab chip count badge bg |
| `--overlay-chip-active` | `rgba(255,255,255,0.25)` | Active chip count badge bg |
| `--overlay-gantt-spike` | `rgba(239,68,68,0.08)` | Gantt spike band bg |

---

## Visual Consistency Baseline (post-Polish)

After the Polish Pass, these values are the standard. Match them when adding new elements:

| Element | Radius | Padding | Font |
|---|---|---|---|
| Primary cards (Queue, Admin, Detail sections) | `16px` | `16px` | FDH: 16px/900; meta: 13px/600–700 |
| Detail header card | `24px` | `18px` | Title: 24px/900 (intentional hero) |
| Digest stat cards | `16px` | `14px 16px` | Value: 26px/900; label: 11px/600 |
| Digest feed entries | `16px` | `10px 14px` | FDH: 12px/900; body: 12px |
| Pills / flags | `999px` | `6px 10px` | 11px/800 |
| Sub-tab chips (Admin) | `20px` | `6px 14px` | 11px/800 |
| Zoom chips (Gantt) | `20px` | `6px 18px` | 13px/600 |
| Action buttons | `14px` | `0 16px` min-h 44px | 14px/800 |
| Section titles | — | — | 13px/900/uppercase |
| Tab bar labels | — | — | 11px/800 |

---

## Orientation Map

| Tab | Required orientation |
|---|---|
| Queue | Portrait only |
| Admin | Portrait only |
| Detail | Landscape only |
| Gantt | Landscape only |
| Digest | Either |

Enforcement: floating pill hint auto-dismisses after 3 seconds. JS checks `window.innerWidth > window.innerHeight` on `setActiveTab()`.

---

## Z-Index Standards (mobile)

| Layer | Z-index |
|---|---|
| Overlays / modals | `999990–999999` |
| Mobile header | `100015` |
| Floating pills | `3000` |
| Tab bar | `200` |
| Gantt sticky row headers | `5` |

---

## Known Issues (at WS7 close)

| Issue | Deferred to |
|---|---|
| Auto device detection (requires `?view=mobile` manually) | WS8 |
| PWA / home screen install support | WS8 |
| Offline queue caching | WS8 |
| Push notifications via GAS triggers | WS8 |
| Gantt quick peek (bar tap → Detail only, no inline peek) | WS8 |
| Crossings staged commit on mobile Admin (read-only now) | WS8 |
| `_module_tabs.html` fullscreen bleed-through on desktop (unresolved) | WS8 |

---

## WS8 Starting Points

**Auto device detection** — edit `doGet()` in `02_Utilities.js`. Check `e.parameter.view` first (explicit override), then fall back to `e.userObject` or a `navigator.userAgent` server-side check. Route to `MobileApp.html` for mobile agents.

**PWA install** — add a `manifest.json` served via a GAS doGet route or embedded as a `<link>` tag. Add service worker registration in `MobileApp.html` `<head>`. GAS apps can be pinned to home screen on iOS via Safari "Add to Home Screen" if the manifest is present.

**Gantt quick peek** — reference `renderQuickPeek()`, `closeQuickPeek()`, `syncQuickPeekNote()` in `WebApp.html` for the desktop field contract. Mobile version should be a slide-up sheet (z-index 999995) triggered by bar tap instead of navigating to Detail.

**Crossings staged commit** — reference `_module_special_crossings.html` for the desktop verify → stage → commit → CSV export workflow. The mobile Admin Crossings sub-tab already renders the cards; it needs the action row and confirmation modal added.

---

## Do Not Touch

- `initDashboard()` and `applyFilters()` in `WebApp.html` — desktop bootstrap anchors, mobile does not use them but they must not be moved
- `writebackQBDirect()` guard in `06_QBSync.js` — do not remove the early return
- `QB_USER_TOKEN` — Script Properties only, never in frontend code
- Inline `<style>` blocks in `MobileApp.html` — always use `_styles_mobile.html`
