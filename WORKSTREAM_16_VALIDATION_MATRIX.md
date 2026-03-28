# WORKSTREAM 16 — Validation Matrix

> **Date:** 2026-03-28
> **Scope:** Phase 11 cross-device validation for the native mobile redesign
> **Status:** Source validation automated; manual runtime pending

---

## Validation Summary

This matrix records what has been verified from source and what still needs hands-on device confirmation. The current repo state confirms the WS16 mobile architecture is wired for:

- Queue/detail push-pop via `body.mobile-detail-open`
- One polymorphic mobile dock via `#mobile-dock`
- Unified search/filter sheet via `#mobile-sf-sheet`
- Phone-only mobile overrides constrained to `@media (max-width: 480px)`
- Tablet/desktop isolation by keeping those overrides out of `>480px` layouts

This repo now includes a lightweight source validation harness at `scripts/validate-ws16-mobile.js` and runs it via `npm test`. It verifies that the key WS16 shell contract still exists in source:

- `#mobile-dock` remains the only phone navigation surface
- `#mobile-sf-sheet` remains the shared search/filter sheet
- Queue item selection still toggles `body.mobile-detail-open`
- Back navigation, dock context sync, and mobile queue navigation still route through shared modules
- Phone-only CSS for queue/detail push-pop and filter-sheet presentation remains scoped to `@media (max-width: 480px)`

This is not a browser/runtime test harness, so final signoff still requires manual runtime checks on real devices or responsive browser simulation.

---

## Device Matrix

| Device / Width | Queue | Detail | Back | Search / Filter Sheet | Review Hub | Deck / Gantt | Regression Risk | Status |
|---|---|---|---|---|---|---|---|---|
| iPhone SE / 375px | Source pass | Source pass | Source pass | Source pass | Source pass | Source pass | Medium | Manual runtime pending |
| iPhone 14 / 390px | Source pass | Source pass | Source pass | Source pass | Source pass | Source pass | Medium | Manual runtime pending |
| iPhone 14 Pro Max / 430px | Source pass | Source pass | Source pass | Source pass | Source pass | Source pass | Medium | Manual runtime pending |
| iPad Mini / 768px | Source pass | Source pass | N/A | Source pass | Source pass | Source pass | Low | Manual runtime pending |
| Desktop Chrome / 1280px | Source pass | Source pass | N/A | Source pass | Source pass | Source pass | Low | Manual runtime pending |

---

## Source-Backed Checks

### Phone widths (`<=480px`)

- Queue-to-detail transition uses CSS transforms in [`src/_styles_layout.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_styles_layout.html) and class toggling in [`src/_module_queue_state.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_module_queue_state.html).
- Back navigation clears `mobile-detail-open` in [`src/_module_webapp_core.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_module_webapp_core.html).
- The only mobile navigation surface is `#mobile-dock` in [`src/WebApp.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/WebApp.html).
- Search and filter converge on `#mobile-sf-sheet` and shared filter state in [`src/WebApp.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/WebApp.html) and [`src/_module_webapp_core.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_module_webapp_core.html).
- Review Hub remains shared-shell driven; phone presentation is CSS-only via `.outbox-pane` / `.reading-pane` rules in [`src/_styles_layout.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_styles_layout.html).

### Tablet (`768px`)

- WS16 mobile-only overrides are scoped to `@media (max-width: 480px)`, which keeps the tablet breakpoint on the pre-existing shared responsive shell.
- Resize listeners in [`src/_module_webapp_core.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_module_webapp_core.html) preserve desktop/tablet admin behavior and mobile dock context synchronization.

### Desktop (`1280px`)

- `#mobile-dock`, `#mobile-sf-overlay`, and `#mobile-sf-sheet` default to `display: none` outside phone media rules in [`src/_styles_layout.html`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_styles_layout.html).
- Queue/detail/admin flows continue to route through shared modules rather than mobile-specific runtime branches.

---

## Automated Source Check

- Command: `npm test`
- Script: [`scripts/validate-ws16-mobile.js`](/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/scripts/validate-ws16-mobile.js)
- Coverage: source-level assertions for markup, routing helpers, dock/sheet orchestration, and phone-scoped CSS selectors
- Limits: does not verify layout feel, gesture smoothness, safe-area rendering, or runtime interactions in a real browser

---

## Manual Runtime Checklist

- [ ] iPhone SE (375px): open queue item, verify push transition, dock switches to detail context, Back returns to queue
- [ ] iPhone SE (375px): open Search sheet, open Filter sheet, change sort/group/filter, verify queue updates
- [ ] iPhone SE (375px): open Review Hub, confirm sheet clears dock and closes cleanly
- [ ] iPhone 14 (390px): confirm queue rows, hero spacing, and PM note area feel correctly proportioned
- [ ] iPhone 14 Pro Max (430px): confirm dock width, safe-area spacing, and sheet max-height feel balanced
- [ ] iPad Mini (768px): confirm tablet shell is unchanged and no phone dock/sheet appears
- [ ] Desktop Chrome (1280px): confirm no mobile surfaces leak into desktop queue/detail/deck/admin flows
- [ ] Landscape phone: confirm Gantt behavior still auto-promotes correctly and exits cleanly on portrait return

---

## Exit Criteria

Phase 11 can be marked complete after the manual checklist above is run against the deployed app or a local browser session with responsive simulation, and any defects found are closed.
