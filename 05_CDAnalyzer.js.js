// ============================================================
// 05_CDAnalyzer.js — CD Special Crossings Analyzer
// Reads PDFs from a Drive folder, sends each to Gemini 1.5 Pro
// for OSP analysis, and writes one row per PDF to the
// "7-CD_Special_Xings" sheet in Daily_Production_Analyzer.
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const CD_CONFIG = {
  // Key stored in Extensions → Script Properties (never in code)
  get GEMINI_API_KEY() { return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"); },
  GEMINI_MODEL:    "gemini-1.5-pro-latest",
  DAILY_API_LIMIT: 50,   // Gemini 1.5 Pro free tier: 50 req/day — raise if on paid plan
  SOURCE_FOLDER_ID: "1BxKhfNAXo32TPEvrTBsGi69lVo9njDU8",
  SPREADSHEET_ID:   "1Wd5nk87iLYiYj1EomGOXCeErRUSoNLFta_bKYZnnovk",
  TARGET_SHEET:     "7-CD_Special_Xings",
  // Column order MUST match your sheet headers left-to-right
  COLUMNS: [
    "Project ID / FDH",
    "Total Footage (UG / AE)",
    "Long Bores (>100') & Locations",
    "Highway / RR / Bridge Crossings",
    "Water Bodies",
    "Presumed Permits Needed",
    "AI Summary / Major Flags"
  ]
};

// ── PROMPT ──────────────────────────────────────────────────
const CD_PROMPT = `Act as an Outside Plant (OSP) Engineering and Permitting Assistant. Please scan the attached construction design document to identify potential "Special Crossings" and complex construction areas.

CONSOLIDATION RULE: You must output EXACTLY ONE ROW for this PDF. Aggregate all findings into a single row.

Extract and summarize the following:
1. Project ID / FDH Name.
2. Total Underground (UG) and Aerial (AE) footage.
3. List all Horizontal Directional Bores (HDD) over 100 feet and their street locations.
4. List all aerial or underground crossings of State Routes, US Highways, Interstates, Railroads, or Bridges.
5. List any intersections with water bodies (creeks, rivers, wetlands).
6. List the presumed permitting authorities based on the findings.
7. Provide a 1-2 sentence AI summary of the biggest construction/permitting hurdles.

IMPORTANT: Respond ONLY with a single JSON object — no markdown, no explanation, no extra text. Use exactly these keys:
{
  "project_id": "",
  "total_footage": "",
  "long_bores": "",
  "highway_crossings": "",
  "water_bodies": "",
  "permits_needed": "",
  "ai_summary": ""
}
If a category has no findings, use the string "None".`;

// ── MAIN FUNCTION ───────────────────────────────────────────
function runCDAnalysis() {
  const ui   = SpreadsheetApp.getUi();

  // Validate API key is configured
  if (!CD_CONFIG.GEMINI_API_KEY) {
    ui.alert("GEMINI_API_KEY not found.\n\nGo to Extensions → Script Properties, add key: GEMINI_API_KEY with your AI Studio key as the value.");
    return;
  }

  const ss   = SpreadsheetApp.openById(CD_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CD_CONFIG.TARGET_SHEET);

  if (!sheet) {
    ui.alert(`Sheet "${CD_CONFIG.TARGET_SHEET}" not found. Check CD_CONFIG.TARGET_SHEET.`);
    return;
  }

  // Collect PDFs from the source folder
  const folder = DriveApp.getFolderById(CD_CONFIG.SOURCE_FOLDER_ID);
  const files  = _getPDFsFromFolder(folder);

  if (files.length === 0) {
    ui.alert("No PDF files found in the specified folder.");
    return;
  }

  // Check daily quota before starting
  const usedToday = _getCallsToday();
  const remaining = CD_CONFIG.DAILY_API_LIMIT - usedToday;
  if (remaining <= 0) {
    ui.alert(`Daily API limit reached (${CD_CONFIG.DAILY_API_LIMIT} calls). Resets at midnight. Used today: ${usedToday}.`);
    return;
  }

  const canProcess = Math.min(files.length, remaining);
  const skipped    = files.length - canProcess;
  const confirmMsg = `Found ${files.length} PDF(s).\n` +
    `API calls today: ${usedToday} / ${CD_CONFIG.DAILY_API_LIMIT} (${remaining} remaining)\n` +
    (skipped > 0 ? `⚠️ Only ${canProcess} can be processed today (${skipped} will be skipped).\n` : "") +
    `\nStart analysis? This may take several minutes.`;

  const confirm = ui.alert(confirmMsg, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  // Ensure header row exists
  _ensureHeaders(sheet);

  let successCount = 0;
  let errorCount   = 0;
  const errors     = [];

  for (let i = 0; i < canProcess; i++) {
    const file = files[i];
    Logger.log(`Processing ${i + 1}/${canProcess}: ${file.getName()}`);

    try {
      const pdfBase64 = Utilities.base64Encode(file.getBlob().getBytes());
      _incrementCallCount();
      const result    = _callGemini(pdfBase64);
      const parsed    = _parseGeminiResponse(result);

      if (parsed) {
        _appendRow(sheet, parsed);
        successCount++;
      } else {
        errors.push(`${file.getName()}: Could not parse Gemini response.`);
        errorCount++;
      }
    } catch (e) {
      Logger.log(`ERROR on ${file.getName()}: ${e.message}`);
      errors.push(`${file.getName()}: ${e.message}`);
      errorCount++;
    }

    // Polite delay to avoid rate-limit errors on free tier (2 RPM)
    if (i < canProcess - 1) {
      Utilities.sleep(31000); // 31 seconds between calls on free tier
      // If you upgrade to a paid API tier, you can lower this to ~2000
    }
  }

  const totalUsed = _getCallsToday();
  const summary = `Analysis complete.\n✅ Success: ${successCount}\n❌ Errors: ${errorCount}\n` +
    `📊 API calls today: ${totalUsed} / ${CD_CONFIG.DAILY_API_LIMIT}` +
    (skipped > 0 ? `\n⚠️ ${skipped} file(s) skipped — daily limit reached.` : "") +
    (errors.length ? `\n\nErrors:\n${errors.join("\n")}` : "");
  ui.alert(summary);
}


// ── HELPER: Get all PDFs from folder (non-recursive) ────────
function _getPDFsFromFolder(folder) {
  const pdfs  = [];
  const iter  = folder.getFilesByType(MimeType.PDF);
  while (iter.hasNext()) {
    pdfs.push(iter.next());
  }
  return pdfs;
}


// ── HELPER: Call Gemini 1.5 Pro with PDF inline ──────────────
function _callGemini(pdfBase64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CD_CONFIG.GEMINI_MODEL}:generateContent?key=${CD_CONFIG.GEMINI_API_KEY}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: "application/pdf",
              data: pdfBase64
            }
          },
          {
            text: CD_PROMPT
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  };

  const options = {
    method:      "post",
    contentType: "application/json",
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code     = response.getResponseCode();
  const text     = response.getContentText();

  if (code !== 200) {
    throw new Error(`Gemini API returned HTTP ${code}: ${text.substring(0, 300)}`);
  }

  const json = JSON.parse(text);

  // Extract the text content from the response
  try {
    return json.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error(`Unexpected Gemini response structure: ${text.substring(0, 300)}`);
  }
}


// ── HELPER: Parse Gemini JSON response ──────────────────────
function _parseGeminiResponse(rawText) {
  // Strip any accidental markdown fences
  let clean = rawText.replace(/```json|```/g, "").trim();

  // Sometimes Gemini wraps in extra text — extract first { ... }
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");
  if (start === -1 || end === -1) {
    Logger.log("No JSON object found in response: " + rawText);
    return null;
  }
  clean = clean.substring(start, end + 1);

  try {
    return JSON.parse(clean);
  } catch (e) {
    Logger.log("JSON parse error: " + e.message + "\nRaw: " + clean);
    return null;
  }
}


// ── HELPER: Append a row to the sheet ───────────────────────
function _appendRow(sheet, data) {
  const row = [
    data.project_id        || "—",
    data.total_footage     || "—",
    data.long_bores        || "None",
    data.highway_crossings || "None",
    data.water_bodies      || "None",
    data.permits_needed    || "None",
    data.ai_summary        || "—"
  ];
  sheet.appendRow(row);
}


// ── HELPER: Write headers if row 1 is empty ─────────────────
function _ensureHeaders(sheet) {
  const firstCell = sheet.getRange(1, 1).getValue();
  if (!firstCell || firstCell.toString().trim() === "") {
    sheet.getRange(1, 1, 1, CD_CONFIG.COLUMNS.length)
         .setValues([CD_CONFIG.COLUMNS])
         .setFontWeight("bold")
         .setBackground("#1e3a5f")
         .setFontColor("#ffffff");
  }
}


// ── HELPERS: Daily API call counter (stored in Script Properties) ────
function _getTodayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}
function _getCallsToday() {
  const props = PropertiesService.getScriptProperties();
  const storedDate  = props.getProperty("CD_API_DATE");
  const storedCount = parseInt(props.getProperty("CD_API_COUNT") || "0", 10);
  return storedDate === _getTodayStr() ? storedCount : 0;
}
function _incrementCallCount() {
  const props   = PropertiesService.getScriptProperties();
  const today   = _getTodayStr();
  const stored  = props.getProperty("CD_API_DATE");
  const count   = stored === today ? parseInt(props.getProperty("CD_API_COUNT") || "0", 10) : 0;
  props.setProperties({ "CD_API_DATE": today, "CD_API_COUNT": String(count + 1) });
}

// ── UTILITY: Expose usage to WebApp client ───────────────────
function getGeminiUsage() {
  return { used: _getCallsToday(), limit: CD_CONFIG.DAILY_API_LIMIT };
}

// ── UTILITY: Show today's API usage ─────────────────────────
function checkCDApiUsage() {
  const used = _getCallsToday();
  SpreadsheetApp.getUi().alert(
    `Gemini API Usage Today\n\nUsed: ${used} / ${CD_CONFIG.DAILY_API_LIMIT}\nRemaining: ${CD_CONFIG.DAILY_API_LIMIT - used}\n\nResets at midnight (${Session.getScriptTimeZone()}).`
  );
}

// ── UTILITY: Clear sheet (keep header row) ───────────────────
function clearCDSheet() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Clear all data rows from 7-CD_Special_Xings? (Header row will remain.)",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ss    = SpreadsheetApp.openById(CD_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CD_CONFIG.TARGET_SHEET);
  const last  = sheet.getLastRow();
  if (last > 1) {
    sheet.deleteRows(2, last - 1);
  }
  ui.alert("Sheet cleared.");
}