# WORKSTREAM 16 — Native Mobile Design Specification

> **Status:** Active — Phase 4 pending
> **Date:** 2026-03-27
> **Supersedes:** WORKSTREAM_16_MOBILE_REBUILD.md (objectives intact; design model replaced)
> **Author:** WS16 Agent Session

---

## 1. Core Mandate

> Mobile is not the desktop app on a small screen. It is a separate visual experience sharing the same data layer, routing contract, and state model.

The mechanical plumbing from Phase 2–3 is sound:
- `#mobile-rail` bottom tab bar — keeps
- `body.mobile-detail-open` CSS toggle pattern — keeps
- One shared router (`switchWorkspaceView()`) — keeps
- No DOM reparenting — keeps

What replaces entirely: **everything visual**. Every component that renders on `≤ 480px` must be designed from scratch according to the Apple HIG principles below.

---

## 2. Design Language — Apple HIG Applied

### 2.1 Typography Scale

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Large Nav Title (Queue screen) | 28px | 800 | -0.4px |
| Navigation Bar Title (Detail) | 17px | 700 | -0.2px |
| Primary Row Text (FDH) | 16px | 600 | 0 |
| Secondary Row Text (City · Vendor) | 13px | 500 | 0 |
| Section Header | 12px | 800 | +0.5px (uppercase) |
| Body / Note Input | 15px | 400 | 0 |
| Status Pill | 10px | 800 | +0.3px |
| Metadata / Timestamp | 11px | 500 | 0 |

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`

### 2.2 Spacing Scale

```
--m-gutter:    16px   (horizontal page padding at all times)
--m-row-pad:   16px   (row internal padding)
--m-section:   20px   (between sections)
--m-card-pad:  16px   (card internal padding)
--m-touch:     52px   (minimum tappable height — everything interactive)
--m-nav-h:     52px   (top navigation bar height)
--m-rail-h:    56px   (bottom rail tab bar content height)
```

### 2.3 Visual Language

- **Corners**: 12px for rows/cards, 16-20px for sheets/modals, 0px at viewport edges
- **Surfaces**: Flat by default. Elevation via `box-shadow` only for sheets
- **Borders**: Use sparingly — 1px `var(--border)` for separators only
- **Status colors**: Same palette as desktop (`--color-critical`, `--color-review`, etc.). Applied as left-edge stripe (4–5px) on queue rows
- **No hover states**: Every interactive element must be immediately operable by tap alone
- **Tap feedback**: `background` shift on `:active` (0.1s), no transform on list rows (reduces jitter)
- **Input zoom prevention**: All inputs `font-size: 16px` on phone (iOS auto-zoom threshold)

### 2.4 Navigation Model

```
[ QUEUE SCREEN ]                   [ DETAIL SCREEN ]
  ┌───────────────────┐               ┌───────────────────┐
  │  Large: Queue  47 │               │  < Queue   FDH-X  │  ← compact nav bar
  │  ─────────────── │               ├───────────────────┤
  │  🔍 Search...    │               │  [Hero: FDH name] │
  ├───────────────────┤               │  [Subtitle: city] │
  │  Row ─────── ❯   │  tap a row →  │  [Status pill]    │
  │  Row ─────── ❯   │               ├───────────────────┤
  │  Row ─────── ❯   │               │  Card: Schedule   │
  │  Row ─────── ❯   │               │  Card: Velocity   │
  │  ...             │               │  Card: Diagnostic │
  ├───────────────────┤               │  Card: PM Note    │
  │  [●][▪][─][▣][≡] │               │  [Skip] [Commit]  │
  └───────────────────┘               └───────────────────┘
```

Transition: `body.mobile-detail-open` drives the panel swap. **No CSS animations yet** (Phase 4 scope). Animations are Phase 9.

---

## 3. Screen-by-Screen Specification

### 3.1 Queue Screen — `.inbox-sidebar`

#### Header: Large Navigation Title
```
┌────────────────────────────────────────────┐
│                                             │
│  Queue  ●47                                 │  28px bold + count badge
│                                             │
│  ┌─[ Search projects... ]───────────────┐  │  full-width search input
│  └──────────────────────────────────────┘  │
│                                             │
└────────────────────────────────────────────┘
```
- Remove: `.inbox-title-stack`, `#view-toggle-btn`, `#sort-queue` select, `#sidebar-pivot-select`
- All of these are `display:none` at `≤480px`
- The `#search-input` in the smart-dock is the canonical search input. On phone, a second visible search bar in the queue header calls `handleSearchInput()` on the shared input — OR the smart-dock search bar is repositioned via CSS into the queue header area. Decision: **CSS repositioning** of `#filter-strip .dock-zone:nth-child(2)` into the sidebar header using `order` and flex tricks — no DOM cloning.

#### Queue Rows — `.email-card`

**Desktop card** (unchanged for desktop):
- 5+ lines: FDH, city/vendor, pill row, mid summary, flag row, footer row

**Mobile override** (`@media (max-width: 480px)`):
```
┌───┬──────────────────────────────┬──────────┬──┐
│░░░│ FDH-A-1234                   │ ●● pill  │❯ │
│░░░│ Yorba Linda · Anza Telecom   │          │  │
└───┴──────────────────────────────┴──────────┴──┘
```
- Left health stripe: 4px, status color
- Minimum height: `var(--m-touch)` = 52px
- Display: 2 lines only. Everything else `display:none`
- Chevron: `›` or SVG, 16px, `var(--text-muted)`, right pad 12px
- `.em-tags`, `.queue-card__footer`, `.queue-flag-row`, `.queue-card__mid`, `.queue-card__submeta`, `.queue-card__prodline`: all `display:none !important`
- Remove: `.email-card:hover` transform (no hover on touch)
- Selected state: left stripe becomes accent blue (same as desktop)

#### Group Headers — `.queue-group-header`
- `display:none` on phone — too much interaction overhead. Items render as flat list.

#### `.inbox-list` scrolling
- `overflow-y: auto`
- `-webkit-overflow-scrolling: touch`
- No padding — rows extend edge to edge (16px internal padding handles the feel)

---

### 3.2 Detail Screen — `.reading-pane`

#### Navigation Bar (replaces `#mobile-back-btn`)
The plain `#mobile-back-btn` added in Phase 3 becomes a proper 52px nav bar:
```
┌────────────────────────────────────────────┐
│ ‹ Queue       FDH-A-1234                   │  52px, border-bottom
└────────────────────────────────────────────┘
```
- Back button: `‹` chevron + "Queue" text in accent color, left-aligned, 44px touch area
- Project ID: centered or adjacent to back button, muted, clipped with text-overflow

#### Hero Section
```
┌────────────────────────────────────────────┐
│                                             │
│  FDH-A-1234                                 │  24px, weight 800
│  Yorba Linda                                │  14px, muted
│                                             │
│  [ FIELD CX | IN PROGRESS         ]        │  status pill, full-width
│                                             │
└────────────────────────────────────────────┘
```

#### Content Cards (stacked, full-width)
Each section becomes a distinct card-like section with a section header:

```
PROJECT SCHEDULE
─────────────────────────────────────────────
[progress bar, full width]
CX Start: Apr 1 · Complete: Jun 30
Target Date: May 15 · Days Left: 49

FIELD VELOCITY
─────────────────────────────────────────────
[velocity bars, full width]

VENDOR UPDATE
─────────────────────────────────────────────
"No update provided."

DIAGNOSTICS
─────────────────────────────────────────────
[flag badges — each on its own row]

PM NOTE
─────────────────────────────────────────────
[full-width textarea, 120px min height]
DRAFT W/GEMINI   [Skip] [✔ Commit]
```

**Layout transforms via CSS at `≤480px`**:
- `.qb-top-row`: `flex-direction: column` → Schedule card on top, Velocity card below
- `.interaction-split`: `flex-direction: column` → Vendor comment above, PM note below
- `.pane-content`: `padding-top: 0` (nav bar is above it)
- `.filter-strip.smart-dock`: `display: none` (search moved to queue header; dock filters accessed via rail)
- `#welcome-screen`: `display: none` (phone always shows detail when `mobile-detail-open`)
- `#raw-data-strip`: `display: none` on phone (too dense for mobile)

#### `.smart-dock` on phone
Hidden by default. Opening via filter rail button reveals it as a bottom sheet (Phase 8).

---

### 3.3 Bottom Rail — `#mobile-rail`

**Current issues:**
- Shows text labels ("Queue", "Grid", "Gantt", "Deck", "Filter") — too verbose
- Active state only works via CSS nth-child selectors — but when detail is open there's no clear "Queue" active signal

**Redesigned:**
- **No text labels** — icon only
- **Active state**: accent color fill + 3px dot below icon (iOS tab bar pattern)
- **Icons**: Use filled SVG for active, stroke SVG for inactive — swap via CSS `body-class` selectors on separate `<use>` elements or just always use stroke + accent color (simpler)
- **Height**: `calc(56px + env(safe-area-inset-bottom))` — unchanged
- **Background**: `var(--card-bg)` with `backdrop-filter: blur(20px)` — glass effect only in dark mode
- `pointer-events: none` on rail, `pointer-events: auto` on `.rail-btn` — unchanged

---

### 3.4 Top Navigation Bar — `.top-nav`

**Current state (functional)**:
The `@media (max-width: 768px)` in `_styles_layout.html` already:
- Hides KPI nav, center tools, gemini badge, nav fabs
- Shows hamburger, theme, help

**WS16 add at `≤480px`**:
- `.top-nav` height: `var(--m-nav-h)` = 52px (existing, correct)
- `.nav-brand-title`: show only when NOT in queue/detail — replace with context title
  - On queue screen: hide entirely (large title in queue header takes over)
  - On detail screen: show current FDH in the top-nav? No — detail has its own nav bar. `display: none`.
- `#btn-hamburger`: keep, provides access to sync/run/refresh that don't fit in rail

---

### 3.5 Startup Overlay

On `≤480px`, the workspace chooser modal should be skipped entirely. Phone auto-starts into Queue view. The modal only makes sense at desktop widths where all workspaces are meaningfully different right away.

---

## 4. Component Transforms Summary

| Component | Desktop | Mobile (`≤480px`) |
|---|---|---|
| `.inbox-header` | Compact header with selects | Large title + search bar |
| `.inbox-title-stack` | "Diagnostics / Queue" | Hidden |
| `#sort-queue` select | Inline sort selector | Hidden (long-press or sort via filter sheet) |
| `.email-card` | 5-line dense card | 2-line iOS row (FDH + city/vendor + pill + chevron) |
| `.queue-group-header` | Sticky collapsible group | Hidden |
| `.queue-card__footer`, `.em-tags`, `.queue-flag-row` | Visible detail | Hidden |
| `#mobile-back-btn` | Hidden | Proper 52px nav bar with project ID |
| `.filter-strip.smart-dock` | Floating dock in reading pane | Hidden (filter sheet pattern) |
| `.qb-top-row` | Side-by-side Schedule + Velocity | Stacked column |
| `.interaction-split` | Side-by-side Vendor + PM Note | Stacked column |
| `#raw-data-strip` | Raw data diagnostic strip | Hidden |
| `#mobile-rail` labels | Text labels under icons | Hidden — icons only |
| Startup overlay | Workspace chooser | Auto-skip, straight to Queue |

---

## 5. Revised Phase Plan

### ✅ Phase 0 — Audit (complete)
### ✅ Phase 1 — Shell Contract (complete — mechanical contract kept; design augmented here)
### ✅ Phase 2 — Legacy Deletion + Rail Scaffold (complete)
### ✅ Phase 3 — Queue↔Detail Switching Mechanism (complete)

---

### Phase 4 — Mobile Token System + Rail Polish
**Scope:** CSS only. No JS, no markup (except `#mobile-back-btn` markup refinement).
**Files:** `_styles_layout.html`, `_styles_base.html`
- Define `--m-*` token block inside `@media (max-width: 480px)` `:root {}`
- Remove text labels from `#mobile-rail` via CSS (`display:none` on `.rail-btn span`)
- Active state: accent color + 3px bottom dot on active rail button
- `#mobile-back-btn`: transform into full-width 52px nav bar (markup replacement in `WebApp.html`)
- Top nav: `display:none` for brand-title when queue/detail are active on phone
- Startup overlay: `display:none` at `≤480px` + auto-start into queue via `_module_startup_refdata.html` init

### Phase 5 — Native Queue List
**Scope:** CSS redesign of `.email-card` and `.inbox-header` at `≤480px`.
**Files:** `_styles_badges.html`, `_styles_responsive.html` (or new `_styles_mobile_queue.html`)
- Queue header: large title (28px) + count badge. Selects hidden. Search bar visible.
- `.email-card` at phone: 52px min-height, 2 lines, left stripe, chevron, no hover transform
- Hide: footer, flag rows, group headers, mid summary
- `.queue-group-header` → `display: none`
- Padding/spacing: 16px horizontal gutters, rows touch edge-to-edge with internal padding

### Phase 6 — Native Detail Layout
**Scope:** CSS transforms for reading pane content at `≤480px`.
**Files:** `_styles_badges.html`, `_styles_responsive.html`, `_styles_layout.html`
- `.qb-top-row` → `flex-direction: column`
- `.interaction-split` → `flex-direction: column`
- `.smart-dock` → `display: none`
- Hero section: FDH name 24px, city 14px muted, status pill full-width
- Section headers above each card group (CSS `::before` content on key containers)
- `#raw-data-strip` → `display: none`
- `#welcome-screen` → `display: none` on phone (no "select a project" empty state — go to queue)
- `.pane-content` → `padding-top: 8px` + enough bottom room for rail

### Phase 7 — Admin Sheet Pattern
**Scope:** `.outbox-pane` transition from side panel to bottom sheet on phone.
**Files:** `_styles_layout.html`, `_styles_responsive.html`
- `.outbox-pane` at `≤480px`: `position: fixed; bottom: calc(56px + env(safe-area-inset-bottom)); left: 0; right: 0; height: 70vh; border-radius: 20px 20px 0 0; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1)`
- `.outbox-pane.open` at phone: `transform: translateY(0)`
- Add drag handle (`::before` 36px × 4px pill at top center of sheet)
- `#admin-fab` → `display: none` on phone; admin triggered via `#btn-hamburger` → mobile menu "Review Hub" entry

### Phase 8 — Filter Sheet
**Scope:** Expose filter controls via bottom sheet at `≤480px`.
**Files:** `_styles_layout.html`, `_styles_responsive.html`
- `.smart-dock` at `≤480px when body.mobile-filter-open`: slides up as bottom sheet
- Sheet: `position: fixed; bottom: calc(56px + ...); left: 0; right: 0; max-height: 60vh; border-radius: 20px 20px 0 0`
- Filter rail button in `#mobile-rail` drives `body.mobile-filter-open` (already wired)
- Scrim: `body.mobile-filter-open::after` darkens workspace behind sheet

### Phase 9 — View Transitions
**Scope:** CSS transform animations for queue→detail push.
**Files:** `_styles_layout.html`
- `.inbox-sidebar` default: visible, `transform: translateX(0)`
- `.reading-pane` default: `transform: translateX(100%)`
- `body.mobile-detail-open .inbox-sidebar`: `transform: translateX(-100%)`
- `body.mobile-detail-open .reading-pane`: `transform: translateX(0)`
- Both: `transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)`
- **Note**: Only add transitions after Phase 5–6 confirm layout correctness

### Phase 10 — Gantt + Deck Mobile
**Scope:** Gantt horizontal scroll + deck full-screen on phone.
- Gantt: single viewport lane, horizontal scroll, pinch-zoom hint banner
- Deck: full-screen stage, swipe left/right gestures (touch events)

### Phase 11 — Validation Matrix
**Scope:** Cross-device smoke test.
- iPhone SE (375px) — queue, detail, back, filter, admin
- iPhone 14 (390px) — same
- iPhone 14 Pro Max (430px) — same
- iPad Mini (768px) — tablet breakpoint unchanged
- Desktop Chrome 1280px — no regressions

---

## 6. What NOT To Touch

- Desktop layout (≥769px): zero changes unless shared HTML structure requires it
- `_module_router.html` — routing logic unchanged
- Any backend `.js` files
- `_state_*.html` — state ownership unchanged
- `openPane()` logic (Phase 3 patch is sufficient)
- Admin JS (`setAdminPanelOpen()`, `toggleAdminPanel()`) — CSS-only transition to sheet

---

## 7. Guardrails

- All mobile CSS lives inside `@media (max-width: 480px)` blocks
- No JS that runs only on mobile (use CSS class toggles already established)
- No DOM reparenting
- No new GAS `include()` calls for mobile-only partials
- Markup additions: **only** where absolutely needed (e.g., Phase 4 nav bar markup)
