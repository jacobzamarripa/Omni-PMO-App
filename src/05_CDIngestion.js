/**
 * FILE: 05_CDIngestion.js
 * PURPOSE: Cloud-native CD (Construction Design) PDF ingestion pipeline.
 *
 * Replaces the local Python bridge as the PRIMARY processor.
 * The Python bridge (CD_Automation_Bridge) runs as FALLBACK only — if this
 * pipeline processes and moves a file, the Python bridge finds it gone and skips it.
 *
 * SETUP (one-time):
 *   Extensions → Apps Script → Project Settings → Script Properties
 *   Add: GEMINI_API_KEY = <your key from https://aistudio.google.com/app/apikey>
 *
 * TRIGGER (one-time setup):
 *   Run installCDTrigger() once from the Apps Script editor to create a
 *   5-minute recurring trigger. Run removeCDTrigger() to disable.
 */

// --- Configuration ---
const CD_MODEL           = 'gemini-2.5-pro-preview-05-06';  // Same model as Python bridge
const CD_API_TIMEOUT_MS  = 300000;                           // 5 min per file (GAS hard limit is 6 min total)
const CD_PROCESSED_TAG   = 'CD_PROCESSED';
const CD_CLAIMED_TAG     = 'CD_CLAIMED';                     // Set before API call to prevent race with Python bridge

const CD_PROMPT = `Act as an OSP Engineering and Permitting Assistant. Scan the attached construction design document to identify ONLY the following "Special Crossings" — flag NOTHING else:
  - State DOT crossings (State Routes, State Highways requiring DOT coordination)
  - Railroad (RR) crossings (BNSF, UP, KCS, UPRR, or any railroad)
  - River or water body crossings (rivers, creeks, wetlands, canals)
  - US Highway or Interstate crossings (US HWY, Interstate, FM roads under TxDOT)
  - Work running PARALLEL to any Highway or Railroad ROW (aerial or underground along the ROW)
  - Any other crossing requiring agency permit or special engineering coordination

SHEET REFERENCE RULE: For every finding in columns 3, 4, and 5, append the sheet/page number where it appears in parentheses. Format each item as: [description] (Sheet X). If a finding spans multiple sheets, list all: (Sheet 2, 4).

STRICT FORMATTING RULES:
1. ONE ROW PER FDH: Output EXACTLY ONE ROW per Project ID/FDH.
2. TABLE ONLY: Output ONLY the Markdown table. No preamble, no summary, no commentary before or after.
3. NO BULLET POINTS OR LINE BREAKS IN CELLS: Single inline string per cell.
4. DELIMITERS: Use semicolon-space (; ) to separate multiple items within a cell.
5. PRECISION: Extract data exactly as written in the document. Use 'None' if a category has no findings.

Extract the following per FDH:
1. Project ID / FDH Name — as labeled on the document.
2. Total Footage (UG / AE) — format EXACTLY as: UG: [footage]' / AE: [footage]'.
3. Parallel HWY/RR Work & Long Bores — aerial or underground construction running PARALLEL to a highway or railroad ROW; also list HDD bores over 100'. Format: [description] at/along [location] (Sheet X); ...
4. Highway / RR / DOT Crossings — at-grade or bored crossings of State routes, US Highways, Interstates, Railroads. Format: [type] at [location] (Sheet X).
5. River / Water Crossings — rivers, creeks, wetlands, or any water body crossing. Format: [description] at [location] (Sheet X).
6. Presumed Permits Needed — agencies implied by findings (e.g., TXDOT, BNSF, USACE, UPRR, FHWA). Use 'None' if no crossings found.
7. AI Summary / Major Flags — 1-2 sentence summary focused ONLY on special crossings and permitting risk. Use 'None' if no crossings found.

Output ONLY this Markdown table:

| Project ID / FDH | Total Footage (UG / AE) | Parallel HWY/RR Work & Long Bores | Highway / RR / DOT Crossings | River / Water Crossings | Presumed Permits Needed | AI Summary / Major Flags |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`;

// --- Folder helpers ---

function getCDFolders_() {
  const parent = DriveApp.getFolderById(CDS_PERMITS_FOLDER_ID);
  const get = (name) => {
    const iter = parent.getFoldersByName(name);
    if (!iter.hasNext()) throw new Error(`CD folder not found: "${name}" under CDs_and_Permits`);
    return iter.next();
  };
  return {
    toAnalyze: get('To_Analyze'),
    analyzed:  get('Analyzed'),
    failed:    get('Failed')
  };
}

// --- Main entry point (called by time-based trigger) ---

function processCDQueue() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    logMsg('CDIngestion ERROR: GEMINI_API_KEY not set in Script Properties. Aborting.');
    return;
  }

  let folders;
  try {
    folders = getCDFolders_();
  } catch (e) {
    logMsg(`CDIngestion ERROR: ${e.message}`);
    return;
  }

  const files = folders.toAnalyze.getFilesByType(MimeType.PDF);
  let processed = 0;

  while (files.hasNext()) {
    const file = files.next();
    const desc = file.getDescription() || '';

    // Skip files already claimed or processed by any pipeline
    if (desc === CD_PROCESSED_TAG || desc === CD_CLAIMED_TAG) continue;

    // Claim the file immediately — prevents Python bridge race condition
    file.setDescription(CD_CLAIMED_TAG);

    const filename = file.getName();
    logMsg(`CDIngestion: Processing "${filename}"`);

    const startMs = Date.now();
    const result = analyzeCD_(file, apiKey);
    const durationSec = Math.round((Date.now() - startMs) / 1000);

    if (result.success) {
      const rows = result.rows.map(r => r.concat([`${CD_MODEL} | ${durationSec}s`, 'GAS']));
      writeCDRowsToSheet_(rows);
      file.setDescription(CD_PROCESSED_TAG);
      file.moveTo(folders.analyzed);
      logMsg(`CDIngestion: ✓ "${filename}" → Analyzed/ (${durationSec}s, ${result.rows.length} row(s))`);
    } else {
      // On failure: log to sheet, un-claim the file, leave in To_Analyze for Python bridge fallback
      const errorRow = [filename, result.error, 'N/A', 'N/A', 'N/A', 'N/A', result.error, `${CD_MODEL} | ${durationSec}s`, 'GAS'];
      writeCDRowsToSheet_([errorRow]);
      file.setDescription('');  // Un-claim — Python bridge will pick it up
      logMsg(`CDIngestion: ✗ "${filename}" — ${result.error} — left in To_Analyze for local fallback`);
    }

    processed++;

    // Guard against GAS 6-min execution limit — stop if we're close
    if ((Date.now() - startMs) > 330000) { // 5.5 minutes elapsed
      logMsg(`CDIngestion: Execution limit approaching after ${processed} file(s). Remaining files will be processed on next trigger.`);
      break;
    }
  }

  if (processed === 0) logMsg('CDIngestion: No new PDFs found in To_Analyze.');
}

// --- Gemini API call ---

function analyzeCD_(file, apiKey) {
  try {
    const blob = file.getBlob();
    const base64Data = Utilities.base64Encode(blob.getBytes());

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CD_MODEL}:generateContent?key=${apiKey}`;

    const payload = JSON.stringify({
      contents: [{
        parts: [
          { text: CD_PROMPT },
          { inline_data: { mime_type: 'application/pdf', data: base64Data } }
        ]
      }],
      generationConfig: { temperature: 0.1 }  // Low temp for consistent structured output
    });

    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    if (status === 429) return { success: false, error: 'RATE LIMITED (429)' };
    if (status !== 200) return { success: false, error: `API ERROR (HTTP ${status})` };

    const json = JSON.parse(response.getContentText());
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text || !text.includes('|')) {
      return { success: false, error: `MODEL REFUSED — no table returned` };
    }

    const rows = parseCDTable_(text);
    if (!rows.length) return { success: false, error: 'PARSE FAILED — could not extract table rows' };

    // Check if all rows contain Gemini error signals
    const errorSignals = ['error reading', 'unable to read', 'unable to analyze', 'unreadable', 'corrupted', 'failed to read'];
    const cleanRows = rows.filter(r => !errorSignals.some(sig => r.join(' ').toLowerCase().includes(sig)));
    if (!cleanRows.length) return { success: false, error: 'GEMINI ERROR — model returned error text as table' };

    return { success: true, rows: cleanRows };

  } catch (e) {
    return { success: false, error: `EXCEPTION: ${e.message.substring(0, 100)}` };
  }
}

// --- Markdown table parser (mirrors Python bridge extract_table_rows logic) ---

function parseCDTable_(text) {
  const rows = [];
  // Strip markdown code fences
  text = text.replace(/```[^\n]*\n/g, '').replace(/```/g, '');

  const lines = text.split('\n');
  let tableStarted = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (!stripped.includes('|')) continue;

    const lower = stripped.toLowerCase();

    // Detect header row
    if (lower.includes('project id') && lower.includes('footage')) {
      tableStarted = true;
      continue;
    }
    // Detect separator row (| :--- | :--- |)
    if (/^[\|\s:\-]+$/.test(stripped)) {
      tableStarted = true;
      continue;
    }

    if (tableStarted) {
      const cells = stripped.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const nonEmpty = cells.filter(c => c);
      if (nonEmpty.length >= 3) {
        while (cells.length < 7) cells.push('');
        rows.push(cells.slice(0, 7));
      }
    }
  }

  return rows;
}

// --- Sheet writer ---

function writeCDRowsToSheet_(rows) {
  if (!rows.length) return;
  const ss = SpreadsheetApp.openById(VENDOR_TRACKER_ID);
  const sheet = ss.getSheetByName(XING_SHEET);
  if (!sheet) {
    logMsg(`CDIngestion ERROR: Sheet "${XING_SHEET}" not found.`);
    return;
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// --- Trigger management ---

function installCDTrigger() {
  // Remove existing to avoid duplicates
  removeCDTrigger();
  ScriptApp.newTrigger('processCDQueue')
    .timeBased()
    .everyMinutes(5)
    .create();
  logMsg('CDIngestion: 5-minute trigger installed.');
}

function removeCDTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processCDQueue')
    .forEach(t => ScriptApp.deleteTrigger(t));
  logMsg('CDIngestion: Trigger removed.');
}
