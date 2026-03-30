# Gemini — Google Apps Script Guidelines
> Extends: ~/.gemini/GEMINI.md
> Read global GEMINI.md first, then this file.
> Read this before editing any .gs file in 
> this project.

## GAS Runtime
- V8 runtime — ES6+ supported
- No Node.js, no npm, no require()
- HTTP requests: UrlFetchApp only
- Database: SpreadsheetApp only
- Caching: CacheService only
- Logging: logMsg() in 00_Config.js only —
  never console.log()
- Secrets: PropertiesService only —
  never hardcode tokens

## Key GAS Gotchas Discovered in This Project
- HtmlService ignores viewport meta in HTML 
  files — use addMetaTag() in doGet() only
- All HtmlService routes must use 
  createTemplateFromFile().evaluate() —
  never createHtmlOutputFromFile()
- Single URL routing uses document.write() 
  pattern — never window.location.replace() 
  which causes iframe inception on mobile
- apple-touch-icon not achievable in GAS —
  iOS only reads top-level document icons
- google.script.run calls must always have 
  withSuccessHandler AND withFailureHandler
- QB_USER_TOKEN lives in Script Properties 
  only — never in code or HTML
- GAS sanitizes massive inline style blocks —
  never put more than 500 lines of CSS in 
  an HTML shell. Move to a partial and 
  use server-side includes.

## Backend File Map
- 00_Config.js — constants, sheet names, 
  logMsg() — read before any backend edit
- 01_Engine.js — daily review engine, 
  source of truth for tracker/flag logic
- 02_Utilities.js — doGet() routing, all 
  web-app-exposed functions
- 06_QBSync.js — QB sync, writeback guard,
  writebackQBDirect() guarded by early return

## Data Layer Rules
- Reference_Data sheet: READ ONLY
- Master_Archive: engine writes only
- writebackQBDirect(): guarded — do not 
  remove the guard
- QB_USER_TOKEN: Script Properties only

## Web App Functions (callable via 
## google.script.run)
- getDashboardData() — full dashboard payload
- webAppTrigger3a(dateStr) — run review, 
  returns fresh payload directly
- syncFromQBWebApp() — QB sync, no params,
  returns { success, error }
- commitBatchReviewsToLog(reviewsArray) — 
  batch commit, array of {fdh,vendor,flags,comment}
- verifySpecialCrossings(fdhId) — returns 
  dateStr or false
- commitToQueueWebApp() — no params, returns 
  { success, count } or { success, error }
- generateAndSaveFDHNarrative() — Gemini draft
- markStatusSyncComplete(fdhId) — QB status sync
- getSurfaceHTML(isMobile) — returns HTML 
  string for document.write() router

## When Gemini Has Solved a GAS Problem
Document the solution in CLAUDE.md under 
Architecture Rules so all future agents 
benefit from the finding.