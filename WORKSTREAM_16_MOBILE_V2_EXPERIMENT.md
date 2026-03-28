# WORKSTREAM 16 — Mobile V2 Experiment Brief

> **Status:** Proposed
> **Date:** 2026-03-28
> **Philosophy:** "Shared Brain (Logic), Swappable Shell (View)"

---

## Agent Pre-Flight (Read Before Touching Anything)

This section exists to prevent the most common failure modes. Read it completely before Phase A.

### DO NOT TOUCH (Desktop-Locked Files)
These files are out of scope for this workstream. Any edit here breaks the desktop experience.
- `WebApp.html` — primary desktop shell
- `_styles_components.html` — desktop component visuals
- `_styles_layout.html` — desktop panel positioning
- `_module_legacy_core.html` — deprecation target, do not add to it

### ARCHIVE IS READ-ONLY
The `_archive/` folder contains `MobileApp.html`, `JS_Modules_Mobile.html`, and `CSS_Mobile.html`. These are **archaeology, not reference**. Do not extract patterns, copy CSS, or port logic from these files. They contain the exact desktop-era geometry assumptions this experiment is designed to escape.

### SHARED BRAIN — DO NOT FORK
These files are the "brain." They must remain single-source and untouched by mobile shell work:
- `_state_queue.html` — queue, selection, filter state
- `_state_router.html` — routing and view mode state
- `_state_session.html` — session, deck, presentation keys
- All `00_Config.js` through `06_QBSync.js` backend files

### NEW FILES ONLY (The V2 Namespace)
All mobile V2 work lives in new files with the `v2_` prefix:
- `v2_MobileApp.html` — the **master shell** (selector only — does not contain a layout itself; it hot-swaps between variants)
- `v2_shell_[VariantName].html` — each agent's experimental shell layout (e.g., `v2_shell_CardStack.html`, `v2_shell_NativeList.html`)
- Module variants use the `v2-` CSS class prefix in their own files; they do **not** replace existing modules

### MULTI-AGENT FILE NAMING PROTOCOL
This is a concurrent experiment — multiple agents may be building simultaneously. To prevent overwriting:

**Shell Variants:**
Each agent creates their own named shell file: `v2_shell_[VariantName].html`
- Choose a descriptive variant name (e.g., `CardStack`, `NativeList`, `HeroFocus`)
- Never write to another agent's variant file
- Never write to `v2_MobileApp.html` directly — only the owner of the master shell updates that

**Module Variants:**
Each agent creates their own named module variant: `v2_module_[ModuleName]_[VariantName].html`
- Example: `v2_module_QueueItem_Condensed.html`, `v2_module_QueueItem_Hero.html`
- The original `_module_queue_state.html` is never touched

**CSS Classes:**
Each variant's CSS classes must be namespaced to prevent bleed:
- Shell: `.v2-shell-[variantname]` (e.g., `.v2-shell-cardstack`)
- Module: `.v2-mod-[modulename]-[variantname]`

**Claiming a Variant Name:**
Before starting Phase B work, you must do **both** of the following:

1. Uncomment (or add) your entry in the `V2_VARIANTS` routing table in `02_Utilities.js` `doGet()`:
   ```javascript
   'YourVariantName': 'v2_shell_YourVariantName',
   ```
2. Add a row to the table below so other agents can see the slot is taken:

| Variant Name | File | Agent / Session | Status |
|---|---|---|---|
| RailView | `v2_shell_RailView.html` | Claude Code / 2026-03-28 | Ready for Review |
| GlassFlow | `v2_shell_GlassFlow.html` | Gemini CLI / 2026-03-28 | Final |
| FlexStack | `v2_shell_FlexStack.html` | CoPilot / 2026-03-28 | Ready for Review |
| SignalStack | `v2_shell_SignalStack.html` | Codex / 2026-03-28 | Ready for Review |

**Each shell file must call `setV2Variant('[YourVariantName]')` during its init** so the shared state knows which experiment is running.

---

## Why This Exists (The "Platform Stall" Audit)

WS16 delivered meaningful progress, but mobile has stalled because we are still negotiating with overlapping desktop-era layout assumptions. We have tried "Responsive CSS" before, and it failed because:

1.  **Component-Level Breakpoints:** Trying to make individual modules responsive internally led to "Prop-Drilling Hell" and CSS override soup.
2.  **Scroll Inception:** The GAS iframe environment (combined with nested desktop divs) made it impossible for the user to tell which layer owned the scroll.
3.  **Geometry Negotiation:** Components were fighting for pixel space without a clear "Shell Parent" to enforce invariants.

**This experiment is different because we are not "fixing" the desktop layout for phone; we are rendering the shared modules into a new, single-purpose Mobile Shell.**

---

## The Modularization Factor

**Does modularization lend itself to this?** 
- **Yes:** If a module (e.g., `QueueList`, `ActionGroup`) is "Layout-Agnostic," it can flow into any container. Modularization allows us to swap the **Shell** without touching the **Brain** (Data/Logic).
- **The Risk:** If a module has "Hardcoded Geometry" (e.g., assuming it's always 350px wide), this experiment will break it. This is a feature, not a bug—it identifies which modules are not truly modular.

---

## Core Decision

Create a **mobile shell v2 experiment** that reuses the existing data/state layer while rebuilding the mobile viewport architecture around a small number of **Strong Invariants**.

We are not trying to polish the current shell into submission one override at a time.

---

## Experiment Constraints

### Must Keep

- **Shared Brain:** All data/state ownership, `google.script.run` signatures, and business logic.
- **Shared Router:** Selection model remains compatible.
- **Desktop Parity:** No change to desktop behavior unless a shared logic primitive requires it.

### Must Change

- **Mobile Shell Geometry:** Own the inset/radius at the root.
- **Scroll Ownership:** The Shell Panel owns the scroll, not the children.
- **Panel Primitive Contract:** All mobile views must derive from one CSS class.
- **GAS Iframe Guard:** Use `overscroll-behavior: contain` to kill the "Iframe Bounce" bug.

### Must Avoid

- **DOM Cloning:** No mobile-only copies of shared content.
- **100vh Layouts:** Use `-webkit-fill-available` to prevent mobile address bar "jumps."

---

## The V2 Shell Variable System (The "Geometry Dial")

To prevent "Design Straying" while allowing "Millions of Ideas," the shell provides a **Dynamic Inset** variable. Agents can "turn the dial" on density depending on the module's complexity:

```css
:root {
  /* The "Dial" - Defaults to 12px but can be overridden per view */
  --v2-shell-inset: 12px; 
  
  /* Shell Invariants */
  --v2-shell-radius: 24px;
  --v2-shell-bg: #FFFFFF;
  --v2-shell-top-offset: env(safe-area-inset-top, 0px);
  --v2-shell-bottom-clearance: 84px; 
  --v2-shell-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
}

/* Example: Turning the Dial for Data-Heavy Views (e.g. Gantt) */
.v2-view-gantt {
  --v2-shell-inset: 0px; 
  --v2-shell-radius: 0px; 
}
```

---

## Why This Constraint Matters (The "GAS Safe Zone")

The inset isn't just aesthetic; it's a **Technical Guardrail** for the Google Apps Script environment:
1.  **Touch Protection:** Prevents "Edge-Swipe" conflicts between the browser/OS and the app's internal navigation.
2.  **Visual Buffer:** Provides a "Moat" that hides any iframe-related alignment issues or scrollbar "bleed" common in mobile GAS.
3.  **Focus:** By shrinking the canvas slightly, we force a vertical-first layout, breaking desktop-horizontal habits.

---

## The Agentic Creative License (The "Stage vs. Set" Rule)

To succeed, we must balance **Structural Rigor** with **Visual Creativity**. We define the boundary as follows:

1.  **The Stage (The Shell Invariants):** These are **Immutable**. The Shell owns the scroll, the top/bottom clearance, and the overall "Card" metaphor. This prevents the "straying" that killed previous versions.
2.  **The Set (The Module Interior):** This is the **Creative Sandbox**. Within the Shell, agents have license to experiment with:
    *   **The Inset Dial:** Choosing between 0px (Full-Bleed) and 12px (Focused Card) based on data density.
    *   **Spatial Rhythm:** Internal padding, margin-bottom logic, and vertical density.
    *   **Micro-interactions:** Subtle scale shifts on tap and haptic-style transitions.
    *   **Modular Variants:** Proposing entirely new `v2-module-variants` for specific data types.

---

## How Modularization Powers Creativity

Modularization is the **Secret Weapon** because it enables a "Plug-and-Play" architecture. 
- An agent can create a `Experimental_V2_QueueItem` and "plug" it into the `v2-mobile-shell` without affecting the desktop `Standard_QueueItem`. 
- This allows for **non-destructive experimentation**: we can keep the "Brain" (Shared Data) while letting different agents "dress" the modules in a million different ways for the mobile viewport.

---

## The Three V2 Invariants

### 1. One Scroll Owner Per Screen

- **The Panel owns the scroll.** Content inside the panel is static or flows naturally.
- No secondary scroll ownership inside the primary mobile panel unless it is a deliberate "Scroll-X" list (e.g., a Horizontal Action Bar).

### 2. One Panel Primitive (`.v2-mobile-shell`)

Queue, detail, and admin all render into the same base shell rules.

### 3. One Motion Model (The "Spatial Map")

- **Push (Horizontal):** Queue → Detail.
- **Lift (Vertical):** Admin / Search / Filter Sheets.
- **Fade:** Internal module state changes.

---

## Proposed V2 Geometry

### Top Nav (Fixed)
Compact, utility-first. Does not attempt to mirror desktop "Large Title" behavior.

### Queue/Detail Panels (The "Card" Metaphor)
- Floating "Card" panels with `--v2-shell-inset`.
- The Card itself owns the vertical scroll.
- Strong vertical cadence between Hero, Section Headers, and Rows.

### Admin Surface (The "Lifted Sheet")
- Reuse the same shell primitive but with a "Bottom-Up" lift animation.
- Feels transient, signaling "Configuration" rather than "Consumption."

### Compact Dock
- A simplified, integrated action bar anchored to the bottom of the active Panel (not floating independently).
- No more "Floating Islands" look.

---

## The Desktop Standard (Your Creative Anchor)

The mobile V2 should feel like a **blood relative** of the desktop — not a different product. Agents must understand what they are preserving before they experiment.

The desktop experience is defined by:
- **Color palette (`_styles_base.html`)**: `--bg: #f1f5f9`, `--card-bg: #ffffff`, `--text-main: #0f172a`, `--accent: #3b82f6`. Dark mode is `--bg: #09090b`, `--card-bg: #1e1e24`. These are fixed — do not introduce new palette values in the V2 shell.
- **Type scale**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto` system font stack. The desktop uses 8–14px for data-dense rows, 24–32px for hero elements. Mobile may push hero sizes up but must not change the font family.
- **Component visuals (`_styles_components.html`)**: Card chrome, badge styles, pill colors, and button treatments are the visual identity. The mobile shell recomposes these into portrait layouts — it does not restyle them.
- **Motion**: `--transition-fast: 150ms ease`, `--transition-std: 200ms ease`. No bouncy springs (`cubic-bezier(0.34, 1.56, 0.64, 1)` is used only for the calculator widget — do not generalize it). Internal state changes use Fade; navigation uses Push/Lift as defined in the Three V2 Invariants.

**Creative license lives in layout and spatial composition, not in color, type, or brand.**

---

## Questions For Agent Review (The "Idea Lab")

Each reviewing agent is encouraged to think beyond the current desktop layout. Answer:

1.  **Layout Agnosticism:** Which modules can we "free" from their current desktop-era geometry constraints?
2.  **The "Alive" Factor:** How would you use CSS `clamp()`, `calc()`, and modern transitions to make the 12px inset panel feel "physical" and responsive to touch?
3.  **Interior Geometry:** Within the 12px shell, what "Millions of combinations" of HERO vs. ROW layouts could we test for the Detail view? (e.g., Overlay Heros vs. Stacked Heros).
4.  **Action Density:** Can we creatively hide/show actions based on "Scroll Context" to keep the mobile UI clean but powerful?
5.  **The GAS "Bounce":** How can we use the `overscroll-behavior: contain` constraint as a creative opportunity (e.g., custom "End-of-List" visual indicators)?
6.  **Experiment Flag:** *(Answered — see Phase B.)* Hot-swapping is handled by a `useV2Shell` boolean in `_state_router.html`. The shell reads this flag at render time to select the module variant. No separate adapter file.

---

## Execution Strategy

### Phase A — Experiment Design Review

**Audit findings (pre-completed — do not re-audit, build on these):**

#### ✅ Confirmed Safe
- **`doGet()` viewport meta** (`02_Utilities.js` line 179): `width=device-width, initial-scale=1, viewport-fit=cover` is confirmed active. `env(safe-area-inset-top)` will work.
- **`_module_queue_state.html` geometry**: No hardcoded container widths. Layout is flexbox-based. Internal inline styles (font sizes 8–14px, padding 2–8px) are component-scoped and will not conflict with the V2 shell container.
- **`_module_admin.html` geometry**: No container-level width assumptions. Flexbox rows with inline font sizes only — portable.
- **Design token portability** (`_styles_base.html`): Color, border, typography, and transition tokens are all CSS custom properties and fully portable to the V2 shell via inheritance or `@import`.

#### ⚠️ Known Issues to Resolve Before Phase B
1. **`body { height: 100vh; overflow: hidden }` in `_styles_base.html` (line 40)**: This is the primary desktop scroll lock. The V2 shell must override `body` height with `-webkit-fill-available` and set its own scroll context. Do not remove from `_styles_base.html` — override at the `v2_MobileApp.html` shell root level.
2. **`--inbox-panel-width: 380px` in `_styles_base.html` (line 21)**: Hardcoded desktop root token. Already overridden to `100vw` at `≤480px` in `_styles_layout.html` — the V2 shell should explicitly set this to `100vw` unconditionally rather than relying on the breakpoint cascade.
3. **`_module_queue_state.html` font sizes (7–9px)**: Acceptable on desktop but will fail readability on mobile without the V2 shell providing a `font-size` scale base. The shell should set a `font-size: 14px` base on `.v2-mobile-shell` to upscale these relative values.

#### 🔑 Critical Discovery: `_styles_responsive.html` Already Exists
`_styles_responsive.html` contains substantial WS16 Phase 2 mobile work that predates this experiment. It already implements:
- Touch targets (44px min-height for dock buttons and filter controls)
- Bottom-sheet filter rail with `env(safe-area-inset-bottom)`
- Detail pane padding using `--m-gutter` tokens
- Phone-width inbox sidebar reset to `width: 100%`
- Hero hierarchy scaling for portrait view
- Flat native sections (`.qb-module` with no card chrome at `≤480px`)

**The V2 shell must build ON this work, not around it.** Phase B should treat `_styles_responsive.html` as the existing mobile foundation and only add the V2 shell container geometry on top. Do not duplicate its rules.

Finalize the `v2-shell.css` variable contract (the CSS block in the "Geometry Dial" section above is the starting point — lock it before Phase B). Add these tokens to the contract since they exist in `_styles_base.html` and must be honored:
```css
/* These already exist — inherit, don't redefine */
--m-touch: 56px;   /* minimum touch target */
--m-nav-h: 52px;   /* top nav height */
--m-dock-h: 64px;  /* bottom dock height */
--m-gutter: 16px;  /* horizontal gutter */
```

### Phase B — Shell Prototype
- **Claim your variant name** in the Pre-Flight table before writing any files.
- Build `v2_shell_[YourVariantName].html` — your named shell. This file includes the V2 CSS contract inline and bootstraps the shared state files via `<?!= include() ?>` — same pattern as `WebApp.html`. Do not write to `v2_MobileApp.html`.
- Plug existing `_module_queue_state.html` and detail content into your shell's slots. Do not rewrite their logic — only adjust geometry-conflicting CSS at the shell boundary using your namespaced `.v2-shell-[variantname]` class.
- The hot-swap adapter for module variants is a **boolean flag in `_state_router.html`** (e.g., `useV2Shell: '[VariantName]'`). The master shell reads this flag to load your variant. Do not create a separate adapter file.
- Do not touch Gantt (`_module_gantt.html`) or Deck (`_module_deck.html`) in this phase.

### Phase C — Runtime Validation

Validate in this order. Do not proceed to the next item until the current one passes.

**Mobile (Portrait First)**
- [ ] App loads without console errors in GAS iframe
- [ ] Iframe bounce is eliminated (`overscroll-behavior: contain` active)
- [ ] Single scroll owner confirmed — no nested scroll fighting
- [ ] All primary tap targets are ≥ 44px height
- [ ] Top safe-area inset is respected (status bar not obscured)
- [ ] Bottom dock does not overlap content or OS gesture bar
- [ ] Queue → Detail push transition executes cleanly
- [ ] Admin sheet lifts from bottom cleanly

**Desktop Isolation (Non-Regression)**
- [ ] `WebApp.html` loads unchanged
- [ ] Desktop queue, detail, gantt, and deck render identically to pre-WS16 state
- [ ] No new CSS bleeds from `v2_` namespace into desktop styles

---

## Success Criteria

- **Scroll Confidence:** User never fights the iframe for control.
- **Visual Family:** Queue/Detail/Admin feel like one cohesive "Card" system.
- **Maintenance Drop:** The number of phone-only CSS overrides decreases because the Shell handles the heavy lifting.
- **Desktop Isolation:** Desktop users see zero changes.

---

## Evaluation Rubric (Pick a Winner)

Score each variant 0–3 per category. Total is out of 18. Review on a physical phone in portrait only.

| Category | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **Scroll Confidence** | Iframe fights for control | Occasional stutter or bounce | Mostly smooth, minor edge cases | Perfect — user always owns the scroll |
| **Queue Usability** | Can't find projects or rows are too small | Readable but slow to scan | Easy to scan, good row density | Instant — right project in one glance |
| **Detail Readability** | Key data obscured or requires zoom | Readable with effort | Clear hierarchy, easy to skim | Target date + velocity + action visible at a glance, no scroll needed for critical info |
| **One-Handed Action** | Commit/Skip unreachable with one thumb | Reachable but awkward | Accessible, minor stretch | Primary actions land naturally under thumb in portrait |
| **Visual Family** | Feels like a different product | Same data, completely different aesthetic | Recognizable but composition feels foreign | Blood relative — same feel, recomposed for portrait |
| **Transition Quality** | No transitions or jarring jump cuts | Transitions exist but feel slow or wrong | Smooth and directional, correct Push/Lift/Fade | Physical and immediate — feels like the content is really there |

**Scoring guide:**
- 15–18: Ship it
- 10–14: Strong candidate with fixes
- 6–9: Interesting ideas, needs significant rework
- 0–5: Back to drawing board

**Tiebreaker:** If two variants score within 2 points of each other, prefer the one with fewer CSS `!important` overrides — it will be easier to maintain.
