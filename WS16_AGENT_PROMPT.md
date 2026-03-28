# WS16 Mobile V2 — Agent Kickoff Prompt

> Copy and paste everything below this line into your agent session.

---

## Your Mission

You are one of several agents working **concurrently** on the Omni PMO App's WS16 Mobile V2 Experiment. Your job is to design and build a single mobile shell variant — your own creative interpretation of what this app should look and feel like on a phone.

The app is a construction PMO tool: a real-time project review queue, Gantt, and deck presentation system built entirely in Google Apps Script (GAS) / HtmlService. It has an excellent, mature desktop experience. Your job is not to replicate that desktop experience on a phone — it is to reimagine the **spatial composition** of the same data for portrait mobile, while keeping it feeling like a blood relative of the desktop.

---

## Read First (In This Order)

1. **`/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/WORKSTREAM_16_MOBILE_V2_EXPERIMENT.md`**
   The full experiment brief. Read every section. The "Agent Pre-Flight," "Phase A Audit Findings," "Desktop Standard," and "Multi-Agent File Naming Protocol" sections are mandatory — they contain pre-completed research, hard constraints, and collision-prevention rules.

2. **`/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_styles_base.html`**
   Design tokens. These are your creative anchor — colors, typography, and transitions are non-negotiable. Read lines 1–80.

3. **`/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/_styles_responsive.html`**
   Existing WS16 Phase 2 mobile work. Already has touch targets, bottom-sheet filter rail, safe-area handling, and `--m-*` tokens. Build ON this — do not duplicate it.

4. **`/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/WebApp.html`**
   The desktop shell. Understand its `<?!= include() ?>` pattern — your shell uses the same technique.

---

## Step 1 — Claim Your Variant Name

Before writing a single file:

1. **Choose a descriptive variant name** (one word, PascalCase). Examples: `CardStack`, `NativeList`, `HeroFocus`, `TightDeck`. This name must be unique — check the Pre-Flight table in the WS16 doc to see what's taken.

2. **Register it in `02_Utilities.js`** by uncommenting or adding your line in the `V2_VARIANTS` routing table inside `doGet()`:
   ```javascript
   'YourVariantName': 'v2_shell_YourVariantName',
   ```

3. **Add a row to the Pre-Flight claim table** in the WS16 doc with your variant name, file, and status = `In Progress`.

---

## Step 2 — Build Your Shell

Create one file: **`src/v2_shell_[YourVariantName].html`**

This is your entire canvas. Use the skeleton below as your starting structure — do not deviate from the include order or the `setV2Variant()` call.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
/* ============================================================
   V2 SHELL: [YourVariantName]
   ROLE: Mobile experiment shell — layout and spatial composition only
   DO NOT: redefine color tokens, font families, or transition speeds
   BUILD ON: _styles_responsive.html (already included below)
   ============================================================ */

/* --- V2 Geometry Contract (required, do not remove) --- */
.v2-shell-[yourvariantname] {
  --v2-shell-inset: 12px;
  --v2-shell-radius: 24px;
  --v2-shell-top-offset: env(safe-area-inset-top, 0px);
  --v2-shell-bottom-clearance: 84px;
  --v2-shell-shadow: 0 4px 24px rgba(0,0,0,0.10);

  /* Override the desktop body lock */
  height: -webkit-fill-available;
  overflow: hidden;
  overscroll-behavior: contain;

  /* Force full-width — do not rely on breakpoint cascade */
  --inbox-panel-width: 100vw;

  /* Readable base scale for data-dense modules */
  font-size: 14px;
}

/* --- Your creative layout work goes here --- */
/* Namespace all classes: .v2-shell-[yourvariantname]-* */

</style>
</head>
<body class="v2-shell-[yourvariantname]">

  <!-- Shared design tokens — do not move or remove -->
  <?!= include('_styles_base') ?>
  <?!= include('_styles_responsive') ?>

  <!-- Your shell layout markup here -->

  <!-- Shared brain — DO NOT MODIFY these files, only include them -->
  <?!= include('_registry') ?>
  <?!= include('_state_queue') ?>
  <?!= include('_state_router') ?>
  <?!= include('_state_session') ?>

  <!-- Shared modules — include as-is, style via shell boundary only -->
  <?!= include('_utils_shared') ?>
  <?!= include('_utils_notifications') ?>
  <?!= include('_module_queue_state') ?>

  <script>
    // Register this variant with the shared router — required
    setV2Variant('[YourVariantName]');

    // Your shell init code here
  </script>

</body>
</html>
```

If you need a module variant (e.g., a custom queue row layout), create a separate file: `v2_module_QueueItem_[YourVariantName].html`. Never modify the originals.

---

## Step 3 — Your Creative Brief

Your layout decisions live in the shell and any module variants you create. The brief asks you to answer these with working code, not just opinions:

- **Spatial Hierarchy**: Within the 12px card shell, what is the relationship between the Hero (project name/status) and the Row (flag/vendor details)? Overlay? Stacked? Collapsed until tap?
- **Action Density**: Can primary actions surface contextually on scroll or long-press rather than occupying permanent dock space?
- **The Inset Dial**: Should data-heavy views (like a dense queue) go full-bleed (0px inset) while detail views use the full 12px card feel? How do you transition between them?
- **End-of-List**: Use `overscroll-behavior: contain` as a design opportunity — what happens when the user reaches the bottom of the queue?
- **Motion**: Push (Queue → Detail), Lift (Admin sheet), Fade (state changes). How do you make these feel physical without being slow? Stay within `150ms–200ms`.

---

## Hard Constraints (Non-Negotiable)

- **DO NOT edit**: `WebApp.html`, `_styles_components.html`, `_styles_layout.html`, `_styles_base.html`, any `_state_*.html`, any backend `.js` file
- **DO NOT read from** `_archive/` — it is archaeology, not reference
- **DO NOT introduce** new color values, new font families, or transitions slower than 200ms
- **DO NOT create** a file without a `v2_` prefix
- **DO NOT write** to another agent's `v2_shell_*.html` file

---

## Done Criteria (Phase C Checklist)

Before marking your variant complete, it must pass all of these:

**Mobile**
- [ ] Loads without console errors in GAS iframe
- [ ] No iframe bounce (`overscroll-behavior: contain` active)
- [ ] Single scroll owner per panel — no nested scroll conflict
- [ ] All tap targets ≥ 44px height
- [ ] Status bar not obscured (safe-area-inset respected)
- [ ] Bottom dock does not overlap OS gesture bar
- [ ] Queue → Detail push transition works
- [ ] Admin sheet lifts from bottom

**Desktop Non-Regression**
- [ ] `WebApp.html` (no `?v=` param) loads and renders identically to before
- [ ] No `v2-` CSS bleeds into desktop styles

When done, update your row in the WS16 Pre-Flight claim table to `Status: Ready for Review`.

---

## Project Path

```
/Users/jacobzamarripa.omni/App-Projects/Omni-PMO-App/src/
```

Your output file: `v2_shell_[YourVariantName].html` in that directory.
Test URL once pushed: `https://script.google.com/macros/s/AKfycbwHYwCe-l_AB3moo31lhoP0q-EcHXLUnAwImq_gPkY/dev`
