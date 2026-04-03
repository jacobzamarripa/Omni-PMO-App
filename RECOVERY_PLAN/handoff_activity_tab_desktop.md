# Handoff: Desktop Review Hub — Activity Tab Remaining Issues
**Date:** 2026-04-03  
**Branch:** `main` (commit `0c2a7bd`)  
**Scope:** `src/_styles_layout.html` only — do NOT touch any other file unless absolutely necessary.  
**Deploy:** `clasp push` after every change, then verify in the deployed GAS web app.

---

## Context

The Omni PMO App is a Google Apps Script web app deployed via `clasp`. All CSS lives in `src/_styles_layout.html`, `src/_styles_panels.html`, and `src/_styles_glassflow_core.html`. There are no build steps — `clasp push` uploads directly.

The **Review Hub** is a slide-in panel (`#outbox-pane`, class `.outbox-pane`) on the right side of the desktop layout. It has three tabs:
- **Admin** — `.review-hub-section-header` / `.review-hub-section-title` / `.admin-list-card`
- **Manager Review (Reviewed)** — `.ob-header` / `.ob-card`  ← **DO NOT TOUCH**
- **Activity** — `.log-row-dense` / `.review-hub-filter-bar`  ← scope of this work

**Desktop overrides** all live inside `@media (min-width: 769px)` in `src/_styles_layout.html` (the block starts at roughly line 25 and closes at line ~340). All rules inside must be scoped to `.outbox-pane` or more specific selectors to avoid bleeding into other surfaces.

---

## Issue 1 — Manager Review Tab Still Affected

### What the user sees
The Manager Review tab (Reviewed tab, `#ob-panel-reviewed`) still looks different from its pre-WS20 state. Cards and/or headers are styled differently than expected.

### Root cause
Three commits added `.ob-header` and `.ob-card` overrides to `_styles_layout.html`, then a fourth commit attempted to remove them. The CSS file is clean now (no `.ob-header`/`.ob-card` rules inside the desktop media query). **However**, the `_styles_glassflow_core.html` file has these rules that apply globally even on desktop:

```css
/* Line 2546 — applies inside #outbox-pane on all screen sizes */
#outbox-pane .ob-card,
#outbox-pane .admin-list-card,
#outbox-pane .log-card {
  overflow: visible !important;
}
```

And `_styles_panels.html` line 73:
```css
/* Global rule — no mobile scope */
.ob-header { padding: 12px 16px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
```

### What to do
1. **First** — open the deployed app, click the FAB to open the Review Hub, switch to the **Manager Review** tab, and visually compare to mobile (which renders correctly via `.v2-shell-glassflow .ob-card` scoped rules in `_styles_glassflow_core.html` lines 1631–1653).
2. If the desktop Manager Review tab looks broken (unstyled cards, no padding, text clipped), the fix is to add scoped desktop overrides for `.ob-card` and `.ob-header` **inside** `#ob-panel-reviewed` to isolate them from any Admin tab contamination:

```css
/* Inside @media (min-width: 769px) in _styles_layout.html */
#ob-panel-reviewed .ob-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-weight: 900;
}
#ob-panel-reviewed .ob-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--card-bg);
  cursor: pointer;
}
#ob-panel-reviewed .ob-card:hover {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
/* Unclamp the inline max-height:30px that JS sets on comment divs */
#ob-panel-reviewed .ob-card div {
  max-height: none !important;
  overflow: visible !important;
}
```

**Why `#ob-panel-reviewed` and not `.outbox-pane .ob-card`?**  
Using `#ob-panel-reviewed` scopes the rules exclusively to the Manager Review tab. `.outbox-pane .ob-card` would also affect `.ob-card` elements rendered in the Admin tab (the JS at `_module_admin.html:383` also uses `ob-card` class).

---

## Issue 2 — Activity Tab Filter Bar Spacing

### What the user sees
The search input and the two dropdown selects are NOT equally spaced in a horizontal row. They appear stacked (column layout) or the spacing/sizing is uneven.

### Current CSS state (`_styles_layout.html` ~line 119)

```css
.outbox-pane .review-hub-filter-bar {
  position: static !important;
  ...
  flex-direction: row !important;   /* ← intended to make it a row */
  align-items: center !important;
  gap: 8px !important;
}
.outbox-pane .review-hub-filter-bar .review-hub-filter-input {
  flex: 1 !important;
  min-width: 0 !important;
}
.outbox-pane .review-hub-filter-bar .review-hub-filter-row {
  flex: 1 !important;
  min-width: 0 !important;
  margin: 0 !important;
}
```

### Root cause
The base `.review-hub-filter-bar` rule in `_styles_glassflow_core.html` line 1858 sets:
```css
.review-hub-filter-bar {
  display: flex;
  flex-direction: column;   /* ← this must be overridden */
  gap: 10px;
  ...
}
```
My desktop override adds `flex-direction: row !important` but **never explicitly sets `display: flex`** in the override block. GAS HtmlService can sometimes re-evaluate rule ordering in ways that cause the base `flex-direction: column` to win. Also, `gap: 8px !important` needs to be in the correct position.

### Fix
In `_styles_layout.html` inside `@media (min-width: 769px)`, update the `.outbox-pane .review-hub-filter-bar` block to explicitly set `display: flex`:

```css
.outbox-pane .review-hub-filter-bar {
  position: static !important;
  transform: none !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  box-sizing: border-box !important;
  display: flex !important;           /* ← ADD THIS explicitly */
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  width: auto !important;
  max-width: none !important;
  left: auto !important;
  right: auto !important;
  margin: 10px 12px !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
  border: 1px solid var(--border) !important;
  background: color-mix(in srgb, var(--card-bg) 98%, #fff) !important;
  backdrop-filter: blur(8px) saturate(160%) !important;
  -webkit-backdrop-filter: blur(8px) saturate(160%) !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.07) !important;
  flex-shrink: 0;
}
```

The child rules (`.review-hub-filter-input`, `.review-hub-filter-row`, hiding toggle) should stay as-is — they are correct.

**Expected result:** The filter bar renders as a single horizontal pill card:
```
[ 🔍 Search PM, FDH, or event...  |  All Time (14d)  |  All Users ]
```
Search input takes `flex:1` (left half), the two selects inside `.review-hub-filter-row` each take `flex:1` within their `flex:1` container (right half). Total: roughly equal thirds.

---

## Key Files

| File | Role | Notes |
|---|---|---|
| `src/_styles_layout.html` | All desktop overrides | Edit here only. Desktop block at `@media (min-width: 769px)` |
| `src/_styles_glassflow_core.html` | Mobile base styles | DO NOT EDIT — read-only reference |
| `src/_styles_panels.html` | Global panel base styles | DO NOT EDIT |
| `src/WebApp.html` | HTML structure | Filter bar HTML at line ~584; Manager Review panel at `#ob-panel-reviewed` |
| `src/_module_admin.html` | JS rendering | `.ob-card` rendered at line 383 |

## HTML Structure Reference

**Filter bar (Activity tab):**
```html
<div class="review-hub-filter-bar" id="activity-filter-bar">
  <input type="text" id="changelog-search" class="review-hub-filter-input" placeholder="Search PM, FDH, or event...">
  <div class="review-hub-filter-row">
    <select id="changelog-time" class="review-hub-filter-select">...</select>
    <select id="changelog-user" class="review-hub-filter-select">...</select>
  </div>
  <label class="review-hub-filter-toggle">...</label>
  <div style="...footer actions..."></div>
</div>
```

**Manager Review tab wrapper:**
```html
<div id="ob-panel-reviewed" class="review-hub-panel" style="display:none; flex-direction:column; flex:1; overflow:hidden;">
  <!-- .ob-header and .ob-card elements rendered by renderOutbox() in _module_admin.html -->
</div>
```

## Commit Discipline
1. Smoke test before committing: open app, verify both tabs look correct
2. One commit per fix — do not bundle
3. Push with `clasp push` after every commit
4. If something breaks, `git reset --hard HEAD~1` + `clasp push`

## Current Stable Commit
`0c2a7bd` — "fix(review-hub): revert Manager Review styles + fix FAB + filter bar layout"
