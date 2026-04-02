# Omni PMO App - AI Coding Guidelines

## Tech Stack
* **Environment:** Google Apps Script (V8 Runtime).
* **Frontend:** Vanilla HTML, CSS, and ES6 JavaScript served via `HtmlService`. No external bundlers.
* **Backend:** Standard `.js` (Apps Script) files.
* **Database:** Google Sheets synced with QuickBase APIs.

## Architecture Rules
1. **No Node.js:** Use `UrlFetchApp`, `SpreadsheetApp`, and `CacheService`.
2. **Single Responsive Surface (WS12):** The app uses `WebApp.html` for ALL devices. CSS breakpoints in `_styles_layout.html` and `_styles_components.html` handle responsiveness.
3. **Logic Modularization:**
    - State: `_state_queue.html`, `_state_router.html`, `_state_session.html`.
    - Modules: `_module_*.html` files (Gantt, Deck, Digest, etc.).
    - Shared Utils: `_utils_shared.html`, `_utils_notifications.html`.
    - Shell: `WebApp.html` (Layout + Bootstrap).
    - Legacy Core: `_module_legacy_core.html` (Deprecation target).
4. **HtmlService Routing:** `doGet()` MUST use `createTemplateFromFile('WebApp').evaluate()`.
5. **Surgical Logic Changes:** Edit the specific `_module_*.html` file, not the main shell. Standardize by including `<script>` tags within the partial itself.
6. **Mobile GAS Viewport:** Set viewport via `addMetaTag()` in `doGet()`. Use `width=device-width, initial-scale=1, viewport-fit=cover`.
7. **No Massive Inline CSS:** Never put more than 500 lines of CSS inline in an HTML shell file. GAS `HtmlService` often sanitizes or completely ignores large inline `<style>` blocks. Move core shell styles to a partial like `_styles_glassflow_core.html` and use `<?!= include() ?>`.

## Autonomous Web Automation (Agent Loop Pattern)
To perform multi-step, loop-until-completion web tasks (especially testing the GAS UI or scraping the deployed app):
1. **Never use sequential MCP Playwright tool calls** for long loops (too slow, token-heavy, and struggles with nested GAS iframes).
2. **Use Code-Driven Scripts:** Use the local Playwright environment.
3. **The Workflow:**
   - Copy `scripts/agent_automation/gas-mobile-loop-template.js` to a new script (e.g., `scripts/agent_automation/task-xyz.js`).
   - Implement your specific logic inside the `while(!isTaskComplete)` block.
   - Run the script locally via `run_shell_command` (`node scripts/agent_automation/task-xyz.js`).
   - Read the output to verify completion.
4. **Mobile Emulation:** The template natively emulates an iPhone 13 and pierces the inner `script.googleusercontent.com` iframe required for GAS Web Apps.

## File Map (Lean Version 2026)
> Last updated: March 26, 2026

### Core Backend
| File | Role |
|---|---|
| `00_Config.js` | Global constants, sheet names, shared backend primitives. |
| `01_Engine.js` | Daily review engine, archive parsing, source of truth for flags. |
| `02_Utilities.js` | GAS entrypoints, `doGet()` routing, web-app bridges. |
| `03_Analytics.js` | Historical benchmark and milestone timeline generation. |
| `05_CDAnalyzer.js` | Gemini/CD analysis workflows. |
| `06_QBSync.js` | QuickBase sync, crossings queue staging. |

### Frontend Shell & State
| File | Role |
|---|---|
| `WebApp.html` | Primary responsive shell and bootstrap layout. |
| `_registry.html` | Data-layer boundaries and shared frontend state names. |
| `_state_queue.html` | Authoritative queue, selection, and filter state. |
| `_state_router.html` | Authoritative workspace routing and view mode state. |
| `_state_session.html` | Authoritative session, deck staging, and presentation keys. |

### Frontend Modules (Logic)
| File | Role |
|---|---|
| `_module_router.html` | Workspace switching and global UI event listeners. |
| `_module_queue_state.html` | Queue rendering, grouping, and filter UI helpers. |
| `_module_gantt.html` | Gantt render engine and focus helpers. |
| `_module_deck.html` | Deck/slide workspace and presentation runtime. |
| `_module_digest.html` | Digest workspace and analytics summaries. |
| `_module_admin.html` | Admin pane and reviewed tray persistence. |
| `_module_tabs.html` | Review Hub tab UI and badge handlers. |
| `_module_webapp_core.html` | Extracted WebApp script bundle. |
| `_module_legacy_core.html` | ⚠️ **DEPRECATION TARGET.** Remaining legacy monolith logic. |

### Frontend Partials (Styles & Utils)
| File | Role |
|---|---|
| `_styles_base.html` | Design tokens, resets, typography. |
| `_styles_layout.html` | Responsive page framing and panel positioning. |
| `_styles_components.html` | Component visuals, overlays, and widget styles. |
| `_styles_gantt.html` | Gantt timeline and orientation placeholders. |
| `_styles_deck.html` | Deck presentation and card styles. |
| `_styles_glassflow_core.html` | Core mobile shell styles (extracted from v2_shell_GlassFlow). |
| `_utils_shared.html` | Pure helpers (escaping, dates) + DOM shorthand (`getEl`, `setHtml`). |
| `_utils_notifications.html` | Shared toasts and status wrapper helpers. |

### Archived
- `_archive/`: Contains `MobileApp.html`, `JS_Modules_Mobile.html`, `_styles_mobile.html`, `Sidebar.html`, `DatePicker.html`, `CSS_Styles.html`, `CSS_Mobile.html`.
