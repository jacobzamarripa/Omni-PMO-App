/**
 * FILE: 01_Engine_Archive.js
 * PURPOSE: Master archive deduplication engine, file parsing, QB tab population, daily review generation
 * SPLIT FROM: 01_Engine.js (WS16 modularization)
 */

// --- 🧠 MASTER ARCHIVE DEDUPLICATION ENGINE ---
function getExistingKeys() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  let keys = new Set();
  
  if (!histSheet || histSheet.getLastRow() < 2) return keys;
  
  let data = histSheet.getDataRange().getValues();
  let fdhIdx = HISTORY_HEADERS.indexOf("FDH Engineering ID");
  let dateIdx = HISTORY_HEADERS.indexOf("Date");
  
  if (fdhIdx === -1 || dateIdx === -1) return keys;
  
  for (let i = 1; i < data.length; i++) {
     let d = data[i][dateIdx];
     let f = data[i][fdhIdx] ? _normalizeFdhId(data[i][fdhIdx]) : "";
     if (!f) continue;

     let dStr = normalizeDateString(d);
     if (dStr) keys.add(dStr + "_" + f);
  }
  return keys;
}

/**
 * 📊 LOAD TOTALS: Scans the archive to find the latest/maximum reported totals for each FDH.
 */
function getExistingTotals() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  let totals = {};

  if (!histSheet || histSheet.getLastRow() < 2) return totals;

  let data = histSheet.getDataRange().getValues();
  let fdhIdx = HISTORY_HEADERS.indexOf("FDH Engineering ID");
  let dateIdx = HISTORY_HEADERS.indexOf("Date");
  let totUGIdx = HISTORY_HEADERS.indexOf("Total UG Footage Completed");
  let totAEIdx = HISTORY_HEADERS.indexOf("Total Strand Footage Complete?");
  let totFIBIdx = HISTORY_HEADERS.indexOf("Total Fiber Footage Complete");
  let totNAPIdx = HISTORY_HEADERS.indexOf("Total NAPs Completed");

  for (let i = 1; i < data.length; i++) {
    let fdh = String(data[i][fdhIdx] || "").toUpperCase().trim();
    if (!fdh) continue;

    let dateVal = data[i][dateIdx];
    let dateStr = (dateVal instanceof Date) ? Utilities.formatDate(dateVal, "GMT-5", "yyyy-MM-dd") : normalizeDateString(dateVal);

    if (!totals[fdh]) {
      totals[fdh] = { 
        ug: { val: 0, date: "" }, 
        ae: { val: 0, date: "" }, 
        fib: { val: 0, date: "" }, 
        nap: { val: 0, date: "" } 
      };
    }
    
    let tug = safeParseFootage(data[i][totUGIdx]);
    let tae = safeParseFootage(data[i][totAEIdx]);
    let tfib = safeParseFootage(data[i][totFIBIdx]);
    let tnap = safeParseFootage(data[i][totNAPIdx]);
    
    // We track the maximum seen total and its corresponding date
    if (tug > totals[fdh].ug.val) { totals[fdh].ug.val = tug; totals[fdh].ug.date = dateStr; }
    if (tae > totals[fdh].ae.val) { totals[fdh].ae.val = tae; totals[fdh].ae.date = dateStr; }
    if (tfib > totals[fdh].fib.val) { totals[fdh].fib.val = tfib; totals[fdh].fib.date = dateStr; }
    if (tnap > totals[fdh].nap.val) { totals[fdh].nap.val = tnap; totals[fdh].nap.date = dateStr; }
  }
  return totals;
}

function countMissedReportBusinessDays(reportDate, targetDate) {
  const toLocalMidnight = (value) => {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
    }

    const raw = String(value).trim();
    if (!raw) return null;

    let parts = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 0, 0, 0, 0);

    parts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (parts) {
      const year = parts[3].length === 2 ? Number(`20${parts[3]}`) : Number(parts[3]);
      return new Date(year, Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    }

    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  };

  const from = toLocalMidnight(reportDate);
  const target = toLocalMidnight(targetDate);
  if (!from || !target || isNaN(from.getTime()) || isNaN(target.getTime()) || target <= from) return 0;

  const cursor = new Date(from.getTime());
  cursor.setDate(cursor.getDate() + 1);

  let missed = 0;
  while (cursor <= target) {
    const dow = cursor.getDay();
    const isWeekday = dow !== 0 && dow !== 6;
    const isMondayCarryMonday = cursor.getTime() === target.getTime() && dow === 1;
    if (isWeekday && !isMondayCarryMonday) missed++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return missed;
}

function extractAutoFixedFdhFromComment(comment) {
  let match = String(comment || "").match(/\[Auto-Fixed FDH: (.*?)\]/);
  return match ? String(match[1] || "").trim().toUpperCase() : "";
}

function extractBlockedAutoMatchTarget(comment) {
  let match = String(comment || "").match(/\[Blocked Auto-Match: (.*?)\]/);
  return match ? String(match[1] || "").trim().toUpperCase() : "";
}

function stripAutoFixRepairMarkers(comment) {
  return String(comment || "")
    .replace(/\[Blocked Auto-Match: .*?\]\s*/g, "")
    .replace(/\[Repair Audit: .*?\]\s*/g, "")
    .trim();
}

function buildLegacyAutoFixComment(baseComment, originalId, options) {
  let parts = [];
  let safeOriginalId = String(originalId || "").trim().toUpperCase();
  if (options && options.blockedTarget) {
    parts.push(`[Blocked Auto-Match: ${String(options.blockedTarget || "").trim().toUpperCase()}]`);
  }
  if (safeOriginalId) parts.push(`[Auto-Fixed FDH: ${safeOriginalId}]`);
  if (options && options.auditText) parts.push(`[Repair Audit: ${options.auditText}]`);
  let cleanBase = stripAutoFixRepairMarkers(baseComment).replace(/\[Auto-Fixed FDH: .*?\]\s*/g, "").trim();
  return (parts.join(" ") + (cleanBase ? " " + cleanBase : "")).trim();
}

function repairLegacyAutoFixedFdhs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const archiveSheet = ss.getSheetByName(HISTORY_SHEET);
  if (!archiveSheet || archiveSheet.getLastRow() < 2) {
    return { scanned: 0, repaired: 0, unresolved: 0, unchanged: 0, message: "No archive rows found." };
  }

  const refDict = getReferenceDictionary();
  const officialKeys = Object.keys(refDict || {});
  const data = archiveSheet.getDataRange().getValues();
  const fdhIdx = HISTORY_HEADERS.indexOf("FDH Engineering ID");
  const commentIdx = HISTORY_HEADERS.indexOf("Vendor Comment");
  if (fdhIdx < 0 || commentIdx < 0) {
    throw new Error("Archive columns missing: FDH Engineering ID or Vendor Comment.");
  }

  let scanned = 0;
  let repaired = 0;
  let unresolved = 0;
  let unchanged = 0;
  let touched = false;

  for (let i = 1; i < data.length; i++) {
    let currentComment = String(data[i][commentIdx] || "");
    let originalId = extractAutoFixedFdhFromComment(currentComment);
    if (!originalId) continue;

    scanned++;
    let storedFdh = _normalizeFdhId(data[i][fdhIdx]);
    let rematchedFdh = attemptFuzzyMatch(originalId, officialKeys, null, refDict);

    if (rematchedFdh && rematchedFdh === storedFdh) {
      unchanged++;
      continue;
    }

    touched = true;
    if (rematchedFdh) {
      data[i][fdhIdx] = rematchedFdh;
      data[i][commentIdx] = buildLegacyAutoFixComment(currentComment, originalId, {
        auditText: `${storedFdh || "UNKNOWN"} -> ${rematchedFdh}`
      });
      repaired++;
      continue;
    }

    data[i][fdhIdx] = originalId;
    data[i][commentIdx] = buildLegacyAutoFixComment(currentComment, originalId, {
      blockedTarget: storedFdh || "UNKNOWN"
    });
    unresolved++;
  }

  if (touched) {
    archiveSheet.getRange(2, fdhIdx + 1, data.length - 1, 1).setValues(data.slice(1).map(function(row) { return [row[fdhIdx]]; }));
    archiveSheet.getRange(2, commentIdx + 1, data.length - 1, 1).setValues(data.slice(1).map(function(row) { return [row[commentIdx]]; }));
    SpreadsheetApp.flush();
  }

  let message = `Legacy auto-fix repair scanned ${scanned} row(s): ${repaired} repaired, ${unresolved} unresolved, ${unchanged} unchanged.`;
  logMsg("🛠️ " + message);
  return { scanned: scanned, repaired: repaired, unresolved: unresolved, unchanged: unchanged, message: message };
}

function processIncomingForQuickBase(isSilent = false, isContinuation = false) {
  const startTime = new Date().getTime();
  const props = PropertiesService.getScriptProperties();

  if (!isContinuation) {
    // 🛡️ Lock to prevent overlapping manual runs
    if (props.getProperty("INGESTION_IN_PROGRESS") === "true") {
      const lastStarted = parseInt(props.getProperty("INGESTION_LAST_STARTED_AT") || "0");
      const lockAgeMinutes = (Date.now() - lastStarted) / 60000;
      if (lockAgeMinutes > 10) {
        // GAS hard limit is 6 min — any lock >10 min is from a crashed run, not a live one.
        logMsg(`⚠️ Stale ingestion lock detected (age: ${lockAgeMinutes.toFixed(1)} min). Auto-clearing and proceeding.`);
      } else {
        if (!isSilent) SpreadsheetApp.getUi().alert("Ingestion is already running in the background. Please wait.");
        return;
      }
    }
    props.setProperty("INGESTION_IN_PROGRESS", "true");
    props.setProperties({
      "INGESTION_STATUS": "running",
      "INGESTION_LAST_STARTED_AT": String(Date.now())
    });
    setupSheets();
    logMsg("🚀 STARTING: Folder Ingestion (Auto-Scan)");
  } else {
    props.setProperties({
      "INGESTION_STATUS": "running",
      "INGESTION_LAST_RESUME_STARTED_AT": String(Date.now())
    });
  }

  let keys, totals, refDict;
  try {
    keys    = getExistingKeys();
    totals  = getExistingTotals();
    refDict = getReferenceDictionary();
  } catch (e) {
    props.setProperties({ "INGESTION_IN_PROGRESS": "false", "INGESTION_STATUS": "idle" });
    logMsg(`❌ INGESTION ABORTED: Pre-scan setup failed — ${e.message}`);
    if (!isSilent) SpreadsheetApp.getUi().alert(`Ingestion aborted due to setup error:\n\n${e.message}`);
    return;
  }
  let newRowsAppended = [];
  let allProcessedDates = [];
  let allParsedRowsForQB = [];
  if (!isContinuation) {
    resetQuickBaseUploadTabForIngestion();
  }

  // 🔄 Execute scan across both folders (Top-level only for speed and safety)
  const targetFolders = [REFERENCE_FOLDER_ID, INCOMING_FOLDER_ID];
  let status = { completed: true };

  for (let folderId of targetFolders) {
    try {
      let folder = DriveApp.getFolderById(folderId);
      // Pass 'false' for recursive to lock to top-level only (Surgical Oversight)
      // Force re-process ONLY for REFERENCE_FOLDER_ID (Production Incoming)
      let force = (folderId === REFERENCE_FOLDER_ID);
      let res = processFolderRecursive(folder, keys, refDict, "", false, newRowsAppended, allProcessedDates, force, allParsedRowsForQB, startTime, false, totals);
      if (res && res.completed === false) { status.completed = false; break; }
    } catch (e) {      logMsg(`⚠️ Scan failed for folder ${folderId}: ${e.message}`);
    }
  }
  
  if (status.completed === false) {
    // ⏰ TIMEOUT: Schedule resume
    const deletedResumeTriggers = ScriptApp.getProjectTriggers()
      .filter(function(trigger) { return trigger.getHandlerFunction() === 'processIncomingResume'; })
      .reduce(function(count, trigger) {
        ScriptApp.deleteTrigger(trigger);
        return count + 1;
      }, 0);
    const resumeScheduledAt = Date.now();
    logMsg(`⌛ TIMEOUT REACHED: Processed partial batch (${newRowsAppended.length} rows). Scheduling resume... existingResumeTriggersDeleted=${deletedResumeTriggers}`);
    ScriptApp.newTrigger('processIncomingResume')
      .timeBased()
      .after(60000) // 1 minute delay
      .create();
    props.setProperties({
      "INGESTION_STATUS": "resume_scheduled",
      "INGESTION_LAST_RESUME_SCHEDULED_AT": String(resumeScheduledAt)
    });
    applyQuickBaseUploadTabFinalStyling();
  } else {
    // ✅ COMPLETE
    props.setProperties({
      "INGESTION_IN_PROGRESS": "false",
      "INGESTION_STATUS": "idle",
      "INGESTION_LAST_COMPLETED_AT": String(Date.now())
    });
    applyQuickBaseUploadTabFinalStyling();
    // 🧠 autoArchiveProcessedFiles() is no longer needed here as files move immediately
    logMsg(`✅ INGESTION COMPLETE: Added ${newRowsAppended.length} rows to Archive. Staged ${allParsedRowsForQB.length} rows to QuickBase Upload.`);

    if (newRowsAppended.length > 0) {
      props.setProperty("LATEST_SIGNAL_EVENT_MS", String(Date.now()));
    }

    if (!isSilent && !isContinuation) {
      if (newRowsAppended.length === 0) {
        SpreadsheetApp.getUi().alert(`No new archive rows found.\n\nQuickBase Upload tab refreshed with ${allParsedRowsForQB.length} row(s).\n\nNote: If you are trying to re-process a report manually, please ensure it is dropped into the root of the 'Production Incoming' folder.`);
      } else {
        SpreadsheetApp.getUi().alert(`Done scanning.\n\nFiltered duplicates and appended ${newRowsAppended.length} new rows to the Archive.\nQuickBase Upload tab refreshed with ${allParsedRowsForQB.length} row(s).\n\n📁 All processed files have been moved to the Master Archive.`);
      }
    }
  }
}

/**
 * ⚡ Resumption stub called by the time-based trigger
 */
function processIncomingResume() {
  // Clean up the trigger first
  const triggers = ScriptApp.getProjectTriggers();
  let deletedTriggerCount = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processIncomingResume') {
      ScriptApp.deleteTrigger(triggers[i]);
      deletedTriggerCount++;
    }
  }
  PropertiesService.getScriptProperties().setProperty("INGESTION_LAST_RESUME_STARTED_AT", String(Date.now()));
  logMsg(`🔁 RESUMING INGESTION: deletedResumeTriggers=${deletedTriggerCount}`);
  processIncomingForQuickBase(true, true);
}

function normalizeDateString(value) {
  if (value === "" || value === null || value === undefined) return "";
  
  // 1. Handle native Google Sheets Date objects
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : Utilities.formatDate(value, "GMT-5", "yyyy-MM-dd");
  }

  let strVal = String(value).trim();
  if (strVal === "") return "";
  
  // 2. Exact YYYY-MM-DD string
  if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) return strVal;

  // 3. Handle Excel Serial Numbers (e.g., 45678)
  // Excel's base date is Dec 30, 1899. 40000+ is usually 2010+.
  let numVal = parseFloat(strVal);
  if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
    let d = new Date((numVal - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd");
  }

  // 4. Common M/D/YY or M-D-YYYY formats
  let match = strVal.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    let yr = match[3].length === 2 ? "20" + match[3] : match[3];
    return `${yr}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  // 5. Last resort parsing
  let parsed = new Date(strVal);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "GMT-5", "yyyy-MM-dd");
  }
  
  return "";
}

function deriveFallbackTargetDate(file) {
  let creationDate = new Date(file.getDateCreated());
  if (creationDate.getDay() === 1) creationDate.setDate(creationDate.getDate() - 3);
  else creationDate.setDate(creationDate.getDate() - 1);
  return Utilities.formatDate(creationDate, "GMT-5", "yyyy-MM-dd");
}

function extractDateFromName(name) {
  let str = String(name || "");
  
  // 1. First check for YYYY-MM-DD format to prevent capturing the wrong digits
  let isoMatch = str.match(/(20\d{2})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/);
  if (isoMatch) {
     return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  // 2. Standard check for MM-DD-YY or MM-DD-YYYY folders
  let match = str.match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})/);
  if (!match) return "";
  let yr = match[3].length === 2 ? "20" + match[3] : match[3];
  return `${yr}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function mapHistoryRowsToQuickBaseRows(rows) {
  return rows.map(row => QB_HEADERS.map(h => {
    let lookupH = h === "Construction Comments" ? "Vendor Comment" : h;
    let hIdx = HISTORY_HEADERS.indexOf(lookupH);
    let val = hIdx > -1 ? row[hIdx] : "";
    if (lookupH === "Vendor Comment" && typeof val === "string") return val.replace(/\[Auto-Fixed FDH: .*?\]\s*/, "");
    return typeof val === "boolean" ? (val ? "TRUE" : "FALSE") : val;
  }));
}

function applyQuickBaseTabStyling(qbSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const styleSheet = ss.getSheetByName(STYLE_MASTER);

  if (typeof applyFormatting === "function") {
    try { applyFormatting(qbSheet); } catch (e) {}
  } else {
    qbSheet.getRange(1, 1, 1, QB_HEADERS.length).setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
  }

  if (styleSheet && styleSheet.getLastColumn() > 0) {
    let styleHeaders = styleSheet.getRange(1, 1, 1, styleSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    QB_HEADERS.forEach((h, i) => {
      let lookupH = h === "Construction Comments" ? "Vendor Comment" : h;
      let styleIdx = styleHeaders.indexOf(h);
      if (styleIdx === -1) styleIdx = styleHeaders.indexOf(lookupH);
      if (styleIdx > -1) {
        let width = styleSheet.getColumnWidth(styleIdx + 1);
        if (width) qbSheet.setColumnWidth(i + 1, width);
      }
    });
  }
}

function processFolderRecursive(folder, existingKeys, refDict, folderDate, isArchive, newRowsAppended = null, allProcessedDates = null, forceReprocess = false, allParsedRowsForQB = null, startTime = null, recursive = true, existingTotals = {}) {
  let resolvedFolderDate = extractDateFromName(folder.getName());
  if (resolvedFolderDate) folderDate = resolvedFolderDate;
  if (!isArchive) cleanupStaleTempConvertedFilesInFolder(folder);

  // Only query for valid Microsoft Excel formats natively.
  // (Prevents looping over Google Sheets, PDFs, etc.)
  const query = "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel'";
  const files = folder.searchFiles(query);

  while (files.hasNext()) {
    // ⏰ Time Budget Check: Exit if over 4.5 minutes (270,000ms) to allow for safe cleanup
    if (startTime && (new Date().getTime() - startTime > 270000)) {
      return { completed: false };
    }

    let file = files.next();

    if (file.getDescription() === "PROCESSED" && !forceReprocess) {
      // 🧠 SAFETY: If it's already processed but still in the incoming folder, move it now
      if (!isArchive) {
        let fDate = folderDate || extractDateFromName(file.getName()) || deriveFallbackTargetDate(file);
        let targetFolder = getArchiveFolderForDateSafely(fDate);
        if (moveFileToArchiveFolderSafely(file, targetFolder, fDate)) {
          logMsg(`📦 Cleaned up "PROCESSED" file that was left in incoming: ${file.getName()}`);
        }
      }
      continue;
    }

    logMsg(`📂 Processing file: ${file.getName()}`);

    let fDate = folderDate || extractDateFromName(file.getName()) || deriveFallbackTargetDate(file);
    if (fDate && allProcessedDates !== null) allProcessedDates.push(fDate);

    try {
        let qbStartCount = allParsedRowsForQB ? allParsedRowsForQB.length : 0;
        let result = parseFileToRows(file, existingKeys, refDict, folderDate, newRowsAppended, allProcessedDates, allParsedRowsForQB, existingTotals);
        let rows = result.rows;
        let fileArchiveDate = result.maxDate || fDate;
        let parsedRowsForThisFile = allParsedRowsForQB ? allParsedRowsForQB.slice(qbStartCount) : [];

        if (rows && rows.length > 0) {
            const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET);
            if (!sh) {
              logMsg(`❌ ERROR: Could not find sheet "${HISTORY_SHEET}"!`);
              throw new Error(`Sheet "${HISTORY_SHEET}" not found.`);
            }

            const trueLastRow = getTrueLastDataRow(sh);
            const writeRow = trueLastRow + 1;

            logMsg(`✍️ Writing ${rows.length} rows to "${HISTORY_SHEET}" starting at Row ${writeRow}. (Sample: ${rows[0][HISTORY_HEADERS.indexOf("FDH Engineering ID")]} on ${rows[0][0]})`);

            ensureCapacity(sh, trueLastRow + rows.length, HISTORY_HEADERS.length);
            sh.getRange(writeRow, 1, rows.length, HISTORY_HEADERS.length).setValues(rows);
            SpreadsheetApp.flush(); // 🚀 FORCE SAVE
            logMsg(`✅ Write complete and flushed to "${HISTORY_SHEET}".`);
        } else {
            logMsg(`ℹ️ No new archive rows for ${file.getName()} (Likely duplicates or empty).`);
        }

        appendQuickBaseUploadRowsForIngestion(parsedRowsForThisFile);

        setProcessedDescriptionSafely(file);

        // 🚀 IMMEDIATE MOVE: Prevent re-scanning on timeout/resume
        // Moving this out of the 'rows.length > 0' check so processed but duplicate files still get moved.
        if (!isArchive) {
          logMsg(`📦 Archiving file: ${file.getName()}... Target: ${fileArchiveDate}`);
          let targetFolder = getArchiveFolderForDateSafely(fileArchiveDate);
          if (targetFolder) {
            if (moveFileToArchiveFolderSafely(file, targetFolder, fileArchiveDate)) {
              logMsg(`✅ File archived: ${file.getName()} to folder ${fileArchiveDate}`);
            }
          } else {
            logMsg(`⚠️ Could not find/create archive folder for ${fileArchiveDate}. File left in place.`);
          }
        }
    } catch (e) {
        logMsg(`❌ Failed to process file ${file.getName()}: ${e.message}`);
    }
  }

  if (recursive) {
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      let result = processFolderRecursive(subfolders.next(), existingKeys, refDict, folderDate, isArchive, newRowsAppended, allProcessedDates, forceReprocess, allParsedRowsForQB, startTime, true, existingTotals);
      if (result && result.completed === false) return result;
    }
  }
  return { completed: true };
}
/**
 * Shared helper to find or create a date-stamped folder in the archive.
 */
function getArchiveFolderForDate(dateStr) {
  const archiveFolder = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);
  if (!dateStr) return archiveFolder;

  let existingFolders = archiveFolder.getFolders();
  while (existingFolders.hasNext()) {
    let f = existingFolders.next();
    let fDate = extractDateFromName(f.getName());
    if (fDate === dateStr) return f;
  }

  let parts = dateStr.split("-");
  let m = parseInt(parts[1], 10);
  let d = parseInt(parts[2], 10);
  let yy = parts[0].substring(2);
  let formattedFolderName = `${m}.${d}.${yy}`;
  return archiveFolder.createFolder(formattedFolderName);
}

function getArchiveFolderForDateSafely(dateStr) {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return getArchiveFolderForDate(dateStr);
    } catch (e) {
      lastError = e.message || String(e);
      logMsg(`⚠️ Archive folder lookup attempt ${attempt} failed for ${dateStr || "root"}: ${lastError}`);
      Utilities.sleep(500 * attempt);
    }
  }
  logMsg(`❌ Archive folder unavailable for ${dateStr || "root"} after retries: ${lastError}`);
  return null;
}

function setProcessedDescriptionSafely(file) {
  if (!file) return false;
  const fileName = file.getName();
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      file.setDescription("PROCESSED");
      return true;
    } catch (e) {
      lastError = e.message || String(e);
      logMsg(`⚠️ PROCESSED tag attempt ${attempt} failed for ${fileName}: ${lastError}`);
      Utilities.sleep(300 * attempt);
    }
  }
  logMsg(`⚠️ File parsed/staged but could not be tagged PROCESSED: ${fileName}. Last error: ${lastError}`);
  return false;
}

function moveFileToArchiveFolderSafely(file, targetFolder, targetDateLabel) {
  if (!file || !targetFolder) return false;
  const fileName = file.getName();
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      file.moveTo(targetFolder);
      return true;
    } catch (e) {
      lastError = e.message || String(e);
      logMsg(`⚠️ Drive move attempt ${attempt} failed for ${fileName}: ${lastError}`);
      Utilities.sleep(500 * attempt);
    }
  }

  try {
    const targetFolderId = targetFolder.getId();
    const parentIds = [];
    const parents = file.getParents();
    while (parents.hasNext()) parentIds.push(parents.next().getId());
    Drive.Files.patch({}, file.getId(), {
      addParents: targetFolderId,
      removeParents: parentIds.join(","),
      supportsTeamDrives: true
    });
    logMsg(`✅ File archived via Drive API fallback: ${fileName} to folder ${targetDateLabel || targetFolderId}`);
    return true;
  } catch (fallbackErr) {
    logMsg(`❌ Archive move failed for ${fileName}: ${fallbackErr.message || fallbackErr}. Last moveTo error: ${lastError}`);
    return false;
  }
}

function cleanupTempConvertedFileSafely(tempFile, sourceName) {
  if (!tempFile || !tempFile.id) return;
  const label = sourceName || tempFile.title || tempFile.id;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      Drive.Files.remove(tempFile.id);
      return;
    } catch (e) {
      logMsg(`⚠️ Temp cleanup delete attempt ${attempt} failed for ${label}: ${e.message || e}`);
      Utilities.sleep(300 * attempt);
    }
  }

  try {
    DriveApp.getFileById(tempFile.id).setTrashed(true);
    logMsg(`🧹 Temp file trashed after delete fallback: ${label}`);
  } catch (trashErr) {
    logMsg(`⚠️ Temp cleanup left file in Drive for ${label}: ${trashErr.message || trashErr}`);
  }
}

function cleanupStaleTempConvertedFilesInFolder(folder) {
  try {
    const tempFiles = folder.searchFiles("title contains '[TEMP]_' and mimeType='application/vnd.google-apps.spreadsheet'");
    while (tempFiles.hasNext()) {
      const temp = tempFiles.next();
      try {
        temp.setTrashed(true);
        logMsg(`🧹 Removed stale temp conversion file: ${temp.getName()}`);
      } catch (e) {
        logMsg(`⚠️ Could not remove stale temp conversion file ${temp.getName()}: ${e.message || e}`);
      }
    }
  } catch (scanErr) {
    logMsg(`⚠️ Stale temp cleanup scan failed: ${scanErr.message || scanErr}`);
  }
}

function parseFileToRows(file, existingKeys, refDict, folderDate, newRowsAppended, allProcessedDates, allParsedRowsForQB = null, existingTotals = {}) {
  let tempFile = createTempConvertedSpreadsheetSafely(file);
  if (!tempFile) return { rows: [], maxDate: "" };
  
  // 🧠 Resilience: Sometimes converted files aren't immediately "openable"
  let tempSS = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      tempSS = SpreadsheetApp.openById(tempFile.id);
      if (tempSS) break;
    } catch (e) {
      Utilities.sleep(1000);
    }
  }
  if (!tempSS) {
    cleanupTempConvertedFileSafely(tempFile, file.getName());
    return { rows: [], maxDate: "" };
  }

  let reportTab = tempSS.getSheetByName("Daily Report") || tempSS.getSheets()[0];
  const fullData = reportTab.getDataRange().getValues();
  
  if (fullData.length < 2) {
    cleanupTempConvertedFileSafely(tempFile, file.getName());
    return { rows: [], maxDate: "" };
  }
  
  let headerRowIndex = 0, fileHeaders = [], fdhIdx = -1;
  for (let i = 0; i < Math.min(10, fullData.length); i++) {
    let tempHeaders = fullData[i].map(h => h.toString().trim().toLowerCase());
    let foundIdx = tempHeaders.findIndex(h => h.includes("fdh") || h.includes("engineering id"));
    if (foundIdx !== -1) { headerRowIndex = i; fileHeaders = tempHeaders; fdhIdx = foundIdx; break; }
  }
  if (fdhIdx === -1) {
    cleanupTempConvertedFileSafely(tempFile, file.getName());
    return { rows: [], maxDate: "" };
  }

  const idxCache = {};
  const adapter = createSchemaAdapter(fileHeaders);
  const getIdx = (name) => {
    let n = name.toLowerCase().trim();
    if (idxCache[n] !== undefined) return idxCache[n];

    let opts = {};
    if (n.includes("footage") || n.includes("completed")) opts.isFootage = true;

    // Specific overrides for Archive logic
    if (n === "contractor") n = "CONTRACTOR";
    if (n.includes("ug complete")) opts.aliases = [["ug", "complete"]];
    else if (n.includes("strand complete")) opts.aliases = [["strand", "complete"]];
    else if (n.includes("fiber complete")) opts.aliases = [["fiber", "complete"]];
    else if (n === "vendor comment") n = "COMMENT";

    let found = adapter.getIdx(n, opts);
    if (found !== -1) { idxCache[n] = found; return found; }

    // 🧠 Value-Based Fallback: If header fails, check columns for date-like values
    if (n === "date" || n === "DATE") {
      for (let col = 0; col < fileHeaders.length; col++) {
        let sample = fullData.slice(headerRowIndex + 1, headerRowIndex + 11).map(r => r[col]);
        if (sample.some(v => v instanceof Date)) { idxCache[n] = col; return col; }
        if (sample.some(v => typeof v === 'string' && normalizeDateString(v) !== "")) { idxCache[n] = col; return col; }
      }
    }

    idxCache[n] = -1;
    return -1;
  };

  try {
    const rows = fullData.slice(headerRowIndex + 1);
    
    // 🔍 PRE-SCAN: Ensure we've identified the date column before processing
    let dateIdx = getIdx("Date");
    
    let filenameDate = normalizeDateString(extractDateFromName(file.getName()));
    let folderDateNorm = normalizeDateString(folderDate);
    let fallbackDate = deriveFallbackTargetDate(file);

    let dataToAppend = [];
    let skippedCount = 0;
    let maxDateFound = "";

    rows.forEach(row => {
      let fdhId = row[fdhIdx] ? _normalizeFdhId(row[fdhIdx]) : "";
      if (!fdhId || fdhId === "NAN" || fdhId === "0" || fdhId.includes("ID")) return;
      
      let originalFdh = fdhId;
      let refData = refDict[fdhId];
      let unmatchedComment = "";

      if (refDict && Object.keys(refDict).length > 0 && !refData) {
          let matched = attemptFuzzyMatch(fdhId, Object.keys(refDict));
          if (matched) { 
            logMsg(`🪄 AUTO-CORRECT (Ingestion): ${fdhId} -> ${matched}`); 
            fdhId = matched; 
            refData = refDict[fdhId];
          } else {
            unmatchedComment = `[No close match found in reference data for FDH: ${originalFdh}] `;
          }
      }
      let wasCorrected = (originalFdh !== fdhId);

      let vendorDateRaw = dateIdx === -1 ? "" : row[dateIdx];
      let normalizedVendorDate = normalizeDateString(vendorDateRaw);
      
      // 🧠 DATE PRECEDENCE: Typed in Row -> File Name -> Folder Name -> Fallback
      // Row date wins when present — running reports have per-row dates that must be respected.
      let rowTargetDate = normalizedVendorDate || filenameDate || folderDateNorm || fallbackDate;

      // Track the latest date found in the file for smarter archiving
      if (rowTargetDate && rowTargetDate > maxDateFound) {
        maxDateFound = rowTargetDate;
      }
      
      let calculatedNotes = [];
      let calculatedOverrides = {};
      let rowTotals = existingTotals[fdhId] || { 
        ug: { val: 0, date: "" }, 
        ae: { val: 0, date: "" }, 
        fib: { val: 0, date: "" }, 
        nap: { val: 0, date: "" } 
      };

      const calculateDiscrepancy = (dailyH, totalH, type) => {
          let dIdx = getIdx(dailyH);
          let tIdx = getIdx(totalH);
          if (dIdx === -1 || tIdx === -1) return;

          let dailyVal = safeParseFootage(row[dIdx]);
          let totalVal = safeParseFootage(row[tIdx]);
          let prevEntry = rowTotals[type] || { val: 0, date: "" };
          let prevVal = prevEntry.val || 0;
          let prevDate = prevEntry.date || "";

          if (prevVal === 0 && dailyVal > 0 && totalVal > dailyVal) {
              let priorWork = totalVal - dailyVal;
              calculatedNotes.push(`Opening Balance: Total (${totalVal}') implies ${priorWork}' of prior unreported work before first submission — QB running total will be understated by this amount`);
          }

          if (dailyVal === 0 && totalVal > prevVal && prevVal > 0) {
              let diff = totalVal - prevVal;
              let gapDays = 0;
              if (prevDate && rowTargetDate) {
                  gapDays = Math.round((new Date(rowTargetDate).getTime() - new Date(prevDate).getTime()) / 86400000);
              }
              calculatedOverrides[dailyH] = diff;
              let gapNote = gapDays > 1 ? ` ⚠ ${gapDays}-day gap` : "";
              calculatedNotes.push(`Daily ${type.toUpperCase()} (+${diff}') from Total Jump (${prevVal} [on ${prevDate}] -> ${totalVal})${gapNote}`);
          }

          if (dailyVal > 0 && totalVal > prevVal && prevVal > 0) {
              let impliedDaily = totalVal - prevVal;
              let tolerance = impliedDaily * 0.10;
              if (Math.abs(impliedDaily - dailyVal) > tolerance) {
                  calculatedNotes.push(`DAILY/TOTAL MISMATCH: ${type.toUpperCase()} (reported daily: ${dailyVal}, total implies: ${impliedDaily})`);
              }
          }

          if (totalVal > 0 && prevVal > 0 && totalVal < prevVal) {
              calculatedNotes.push(`TOTAL REGRESSION: ${type.toUpperCase()} (prev max: ${prevVal} on ${prevDate}, now: ${totalVal})`);
          }

          // Update running total for this run
          if (totalVal > rowTotals[type].val) {
            rowTotals[type].val = totalVal;
            rowTotals[type].date = rowTargetDate;
          }
      };

      calculateDiscrepancy("Daily UG Footage", "Total UG Footage Completed", "ug");
      calculateDiscrepancy("Daily Strand Footage", "Total Strand Footage Complete?", "ae");
      calculateDiscrepancy("Daily Fiber Footage", "Total Fiber Footage Complete", "fib");
      calculateDiscrepancy("Daily NAPs/Encl. Completed", "Total NAPs Completed", "nap");
      
      // 🕵️ SHADOW AUDIT (Workstream 28: Production Auditor)
      try {
        const auditorVerdict = ProductionAuditor.audit({
          reportDate: rowTargetDate,
          currentReport: {
            dailyUG:  safeParseFootage(row[getIdx("Daily UG Footage")]),
            totalUG:  safeParseFootage(row[getIdx("Total UG Footage Completed")]),
            dailyAE:  safeParseFootage(row[getIdx("Daily Strand Footage")]),
            totalAE:  safeParseFootage(row[getIdx("Total Strand Footage Complete?")]),
            dailyFIB: safeParseFootage(row[getIdx("Daily Fiber Footage")]),
            totalFIB: safeParseFootage(row[getIdx("Total Fiber Footage Complete")]),
            dailyNAP: safeParseFootage(row[getIdx("Daily NAPs/Encl. Completed")]),
            totalNAP: safeParseFootage(row[getIdx("Total NAPs Completed")])
          },
          historicalTotals: existingTotals[fdhId] || { 
            ug: { val: 0, date: "" }, ae: { val: 0, date: "" }, 
            fib: { val: 0, date: "" }, nap: { val: 0, date: "" } 
          }
        });
        _acShadowAuditCompare(fdhId, calculatedNotes, calculatedOverrides, auditorVerdict);
      } catch (e) {
        logMsg(`❌ SHADOW AUDIT CRASHED [${fdhId}]: ${e.message}`);
      }

      // Save the updated totals back
      existingTotals[fdhId] = rowTotals;


      const buildMappedRow = (overrides = null) => {
        return HISTORY_HEADERS.map(h => {
          if (h === "FDH Engineering ID") return fdhId; 
          let idx = getIdx(h);
          let val = (idx === -1) ? "" : row[idx];
          
          // Apply calculation overrides if present (QB path only)
          if (overrides && overrides[h] !== undefined) val = overrides[h];

          if (h === "Contractor") {
            let derivedVendor = refData ? refData.vendor : "";
            if (!val || String(val).trim() === "") {
              if (overrides !== null && derivedVendor) {
                calculatedNotes.push(`[Contractor: derived from ref — ${derivedVendor}]`);
              }
              return derivedVendor;
            }
            return val;
          }

          if (h === "Vendor Comment") { 
              let prefix = "";
              if (wasCorrected) prefix += `[Auto-Fixed FDH: ${originalFdh}] `;
              if (unmatchedComment) prefix += unmatchedComment;
              if (overrides && calculatedNotes.length > 0) prefix += `[${calculatedNotes.join(" | ")}] `;
              return prefix + (val || ""); 
          }
          
          if (h === "Date") return rowTargetDate;
          if (isBooleanColumn(h) && typeof val === "string") { 
              let cleanStr = val.trim().toLowerCase(); 
              if (cleanStr === "true" || cleanStr === "yes") return true; 
              if (cleanStr === "false" || cleanStr === "no") return false; 
          }

          // 🧠 NEW: Reference Data Enrichment (Ensure mirror data points are recorded in the archive)
          if (refData) {
            if (h === "BSLs") return (refData.bsls && refData.bsls !== "-") ? refData.bsls : val;
            if (h === "Budget OFS") return (refData.canonicalOfsDate || refData.forecastedOFS || val);
            if (h === "CX Start") return (refData.cxStart || val);
            if (h === "CX Complete") return (refData.cxComplete || val);
          }

          return val;
        });
      };

      let rowMappedArchive = buildMappedRow(); // RAW
      let rowMappedQB = buildMappedRow(calculatedOverrides); // CALCULATED (Audited)

      // 🧠 ARCHIVE WRITE GUARD: Only append to Master Archive if it's a new unique entry
      let key = rowTargetDate + "_" + fdhId;
      if (!existingKeys.has(key)) { 
          dataToAppend.push(rowMappedArchive); 
          existingKeys.add(key); 
          if (newRowsAppended !== null) newRowsAppended.push(rowMappedArchive); 
      } else {
          skippedCount++;
      }

      // 🧠 QB TAB WRITE GUARD: Always push to QuickBase upload, even if it's a duplicate in the archive
      // (Allows the user to re-process files to see updated calculations/notes)
      if (allParsedRowsForQB !== null) allParsedRowsForQB.push(rowMappedQB);
      if (allProcessedDates !== null && rowMappedArchive[0]) allProcessedDates.push(rowMappedArchive[0]);
    });

    if (dataToAppend.length > 0 || skippedCount > 0) {
      let sampleDates = dataToAppend.map(r => r[0]).concat(rows.slice(0, 10).map(r => normalizeDateString(r[dateIdx])));
      let uniqueDates = Array.from(new Set(sampleDates)).filter(d => d);
      logMsg(`📊 File Report: "${file.getName()}" | Added: ${dataToAppend.length} | Skipped: ${skippedCount} | Sample Dates: ${uniqueDates.slice(0, 5).join(', ')}`);
    }

    return { rows: dataToAppend, maxDate: maxDateFound || folderDate };
  } catch (e) {
    logMsg(`❌ parseFileToRows error: ${e.message}`);
    return { rows: [], maxDate: "" };
  } finally {
    cleanupTempConvertedFileSafely(tempFile, file.getName());
  }
}

function createTempConvertedSpreadsheetSafely(file) {
  if (!file) return null;
  const fileName = file.getName();
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const parents = file.getParents();
      const parentId = parents.hasNext() ? parents.next().getId() : null;
      const metadata = { title: "[TEMP]_" + fileName };
      if (parentId) metadata.parents = [{ id: parentId }];
      return Drive.Files.insert(metadata, file.getBlob(), { convert: true });
    } catch (e) {
      lastError = e.message || String(e);
      logMsg(`⚠️ Temp conversion attempt ${attempt} failed for ${fileName}: ${lastError}`);
      Utilities.sleep(700 * attempt);
    }
  }

  logMsg(`❌ Could not convert file for ingestion after retries: ${fileName}. Last error: ${lastError}`);
  return null;
}

function populateQuickBaseTabDirectly(parsedRows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  const safeRows = Array.isArray(parsedRows) ? parsedRows : [];

  qbSheet.clear();
  qbSheet.getRange(1, 1, 1, QB_HEADERS.length).setValues([QB_HEADERS]);

  if (safeRows.length > 0) {
    const qbData = mapHistoryRowsToQuickBaseRows(safeRows);
    ensureCapacity(qbSheet, qbData.length + 1, QB_HEADERS.length);
    qbSheet.getRange(2, 1, qbData.length, QB_HEADERS.length).setValues(qbData);
  }

  applyQuickBaseTabStyling(qbSheet);
}

function resetQuickBaseUploadTabForIngestion() {
  populateQuickBaseTabDirectly([]);
}

function appendQuickBaseUploadRowsForIngestion(parsedRows) {
  const safeRows = Array.isArray(parsedRows) ? parsedRows : [];
  if (safeRows.length === 0) return 0;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  const qbData = mapHistoryRowsToQuickBaseRows(safeRows);
  const trueLastRow = Math.max(1, getTrueLastDataRow(qbSheet));
  ensureCapacity(qbSheet, trueLastRow + qbData.length, QB_HEADERS.length);
  qbSheet.getRange(trueLastRow + 1, 1, qbData.length, QB_HEADERS.length).setValues(qbData);
  SpreadsheetApp.flush();
  logMsg(`📤 QuickBase Upload staged ${qbData.length} row(s).`);
  return qbData.length;
}

function applyQuickBaseUploadTabFinalStyling() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  applyQuickBaseTabStyling(qbSheet);
}

function _buildPrevTotalsLookup(histSheet, dateArr) {
  const allData = histSheet.getDataRange().getValues();
  if (allData.length < 2) return {};

  const fdhIdx   = HISTORY_HEADERS.indexOf("FDH Engineering ID");
  const dateIdx  = HISTORY_HEADERS.indexOf("Date");
  const ugIdx    = HISTORY_HEADERS.indexOf("Total UG Footage Completed");
  const aeIdx    = HISTORY_HEADERS.indexOf("Total Strand Footage Complete?");
  const fibIdx   = HISTORY_HEADERS.indexOf("Total Fiber Footage Complete");
  const napIdx   = HISTORY_HEADERS.indexOf("Total NAPs Completed");

  const lookup = {};
  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    const fdh = String(row[fdhIdx] || '').trim();
    if (!fdh) continue;

    const rawDate = row[dateIdx];
    const dateStr = (rawDate instanceof Date)
      ? Utilities.formatDate(rawDate, "GMT-5", "yyyy-MM-dd")
      : String(rawDate).split("T")[0].trim();
    if (!dateStr || dateArr.includes(dateStr)) continue;

    if (!lookup[fdh]) lookup[fdh] = {
      ug:  { val: 0, date: "" },
      ae:  { val: 0, date: "" },
      fib: { val: 0, date: "" },
      nap: { val: 0, date: "" }
    };

    const ugVal  = safeParseFootage(row[ugIdx]);
    const aeVal  = safeParseFootage(row[aeIdx]);
    const fibVal = safeParseFootage(row[fibIdx]);
    const napVal = safeParseFootage(row[napIdx]);

    if (ugVal  > lookup[fdh].ug.val)  lookup[fdh].ug  = { val: ugVal,  date: dateStr };
    if (aeVal  > lookup[fdh].ae.val)  lookup[fdh].ae  = { val: aeVal,  date: dateStr };
    if (fibVal > lookup[fdh].fib.val) lookup[fdh].fib = { val: fibVal, date: dateStr };
    if (napVal > lookup[fdh].nap.val) lookup[fdh].nap = { val: napVal, date: dateStr };
  }
  return lookup;
}

function _mapHistoryRowsWithCorrections(filteredRows, prevTotals) {
  const hIdx = (h) => HISTORY_HEADERS.indexOf(h);

  return filteredRows.map(row => {
    const fdh     = String(row[hIdx("FDH Engineering ID")] || '').trim();
    const rawDate = row[hIdx("Date")];
    const rowDate = (rawDate instanceof Date)
      ? Utilities.formatDate(rawDate, "GMT-5", "yyyy-MM-dd")
      : String(rawDate).split("T")[0].trim();

    const existingTotals = prevTotals[fdh] || {
      ug:  { val: 0, date: "" },
      ae:  { val: 0, date: "" },
      fib: { val: 0, date: "" },
      nap: { val: 0, date: "" }
    };

    const calculatedOverrides = {};
    const calculatedNotes = [];

    const applyCorrection = (dailyH, totalH, type) => {
      const dailyVal = safeParseFootage(row[hIdx(dailyH)]);
      const totalVal = safeParseFootage(row[hIdx(totalH)]);
      const prev = existingTotals[type] || { val: 0, date: "" };
      const prevVal  = prev.val  || 0;
      const prevDate = prev.date || "";

      if (dailyVal === 0 && totalVal > prevVal && prevVal > 0) {
        const diff = totalVal - prevVal;
        let gapDays = 0;
        if (prevDate && rowDate) {
          gapDays = Math.round((new Date(rowDate) - new Date(prevDate)) / 86400000);
        }
        calculatedOverrides[dailyH] = diff;
        const gapNote = gapDays > 1 ? ` ⚠ ${gapDays}-day gap` : "";
        calculatedNotes.push(`Daily ${type.toUpperCase()} (+${diff}') from Total Jump (${prevVal} [on ${prevDate}] -> ${totalVal})${gapNote}`);
      }

      if (dailyVal > 0 && totalVal > prevVal && prevVal > 0) {
        const impliedDaily = totalVal - prevVal;
        if (Math.abs(impliedDaily - dailyVal) > impliedDaily * 0.10) {
          calculatedNotes.push(`DAILY/TOTAL MISMATCH: ${type.toUpperCase()} (reported daily: ${dailyVal}, total implies: ${impliedDaily})`);
        }
      }

      if (totalVal > 0 && prevVal > 0 && totalVal < prevVal) {
        calculatedNotes.push(`TOTAL REGRESSION: ${type.toUpperCase()} (prev max: ${prevVal} on ${prevDate}, now: ${totalVal})`);
      }
    };

    applyCorrection("Daily UG Footage",           "Total UG Footage Completed",    "ug");
    applyCorrection("Daily Strand Footage",        "Total Strand Footage Complete?", "ae");
    applyCorrection("Daily Fiber Footage",         "Total Fiber Footage Complete",   "fib");
    applyCorrection("Daily NAPs/Encl. Completed",  "Total NAPs Completed",           "nap");

    // 🕵️ SHADOW AUDIT (Workstream 28: Production Auditor)
    try {
      const auditorVerdict = ProductionAuditor.audit({
        reportDate: rowDate,
        currentReport: {
          dailyUG:  safeParseFootage(row[hIdx("Daily UG Footage")]),
          totalUG:  safeParseFootage(row[hIdx("Total UG Footage Completed")]),
          dailyAE:  safeParseFootage(row[hIdx("Daily Strand Footage")]),
          totalAE:  safeParseFootage(row[hIdx("Total Strand Footage Complete?")]),
          dailyFIB: safeParseFootage(row[hIdx("Daily Fiber Footage")]),
          totalFIB: safeParseFootage(row[hIdx("Total Fiber Footage Complete")]),
          dailyNAP: safeParseFootage(row[hIdx("Daily NAPs/Encl. Completed")]),
          totalNAP: safeParseFootage(row[hIdx("Total NAPs Completed")])
        },
        historicalTotals: existingTotals
      });
      _acShadowAuditCompare(fdh, calculatedNotes, calculatedOverrides, auditorVerdict);
    } catch (e) {
      logMsg(`❌ SHADOW AUDIT CRASHED [${fdh}]: ${e.message}`);
    }

    return QB_HEADERS.map(h => {

      const lookupH = h === "Construction Comments" ? "Vendor Comment" : h;
      const idx = HISTORY_HEADERS.indexOf(lookupH);
      let val = idx > -1 ? row[idx] : "";

      if (calculatedOverrides[h] !== undefined) val = calculatedOverrides[h];

      if (h === "Construction Comments") {
        let comment = (typeof val === "string") ? val.replace(/\[Auto-Fixed FDH: .*?\]\s*/, "") : String(val || "");
        if (calculatedNotes.length > 0) comment = `[${calculatedNotes.join(" | ")}] ` + comment;
        return comment;
      }

      if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
      return val;
    });
  });
}

// 🧠 UPGRADED TO HANDLE BATCH ARRAYS & STYLE MASTER FORMATTING
function populateQuickBaseTabCore(targetDates, vendorFilter = "ALL") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  
  let dateArr = Array.isArray(targetDates) ? targetDates : [targetDates];
  dateArr = dateArr.map(d => d.toString().trim());

  const filteredRows = histSheet.getDataRange().getValues().filter((row, idx) => {
    if (idx === 0) return false; 

    // Check Vendor Filter
    if (vendorFilter && vendorFilter !== "ALL") {
        let rowVendor = String(row[HISTORY_HEADERS.indexOf("Contractor")] || "").trim();
        if (rowVendor.toUpperCase() !== vendorFilter.toUpperCase()) return false;
    }

    let rowDate = (row[0] instanceof Date) ? Utilities.formatDate(row[0], "GMT-5", "yyyy-MM-dd") : String(row[0]).split("T")[0].trim();
    
    let altDate = "";
    try { 
        let dObj = new Date(rowDate);
        if(!isNaN(dObj.getTime())) altDate = Utilities.formatDate(dObj, "GMT-5", "M/d/yyyy"); 
    } catch(e) {}
    
    return dateArr.includes(rowDate) || (altDate !== "" && dateArr.includes(altDate));
  });

  qbSheet.clear();
  qbSheet.getRange(1, 1, 1, QB_HEADERS.length).setValues([QB_HEADERS]);
  
  if (filteredRows.length > 0) {
    const prevTotals = _buildPrevTotalsLookup(histSheet, dateArr);
    const qbData = _mapHistoryRowsWithCorrections(filteredRows, prevTotals);
    const _archAliasMap = (typeof _getDailyUploadVendorAliasMap === 'function') ? _getDailyUploadVendorAliasMap() : {};
    const _archContractorIdx = QB_HEADERS.indexOf('Contractor');
    if (_archContractorIdx > -1 && Object.keys(_archAliasMap).length > 0) {
      qbData.forEach(row => {
        const raw = String(row[_archContractorIdx] || '').trim();
        const canonical = _archAliasMap[raw.toLowerCase()];
        if (canonical) row[_archContractorIdx] = canonical;
      });
    }
    ensureCapacity(qbSheet, qbData.length + 1, QB_HEADERS.length);
    qbSheet.getRange(2, 1, qbData.length, QB_HEADERS.length).setValues(qbData);
  } else {
    logMsg(`⚠️ populateQuickBaseTab: No data found for dates: ${dateArr.join(", ")}${vendorFilter !== "ALL" ? " (Vendor: " + vendorFilter + ")" : ""}`);
  }

  applyQuickBaseTabStyling(qbSheet);
}

function exportQuickBaseCSVCore(isSilent = false, contextType = "ROUTINE") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (getTrueLastDataRow(qbSheet) < 2) return null;
  const data = qbSheet.getRange(1, 1, getTrueLastDataRow(qbSheet), QB_HEADERS.length).getValues();
  let csvContent = "";
  data.forEach(row => {
    let csvRow = row.map(cell => {
      let cellStr = (cell instanceof Date) ? Utilities.formatDate(cell, "GMT-5", "MM/dd/yy") : cell.toString();
      if (typeof cellStr === 'string') cellStr = cellStr.replace(/\[Auto-Fixed FDH: .*?\]\s*/, "");
      return (cellStr.includes(",") || cellStr.includes("\"") || cellStr.includes("\n")) ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
    });
    csvContent += csvRow.join(",") + "\n";
  });
  // 🧠 Range-aware Filename (MM.DD.YY-MM.DD.YY (Vendor/s))
  const rows = data.slice(1);
  const normalizedDates = rows.map(r => normalizeDateString(r[0])).filter(d => d !== "").sort();
  const vendorSet = new Set(rows.map(r => String(r[1] || "").trim()).filter(v => v !== ""));
  const vendors = Array.from(vendorSet).sort();

  let datePart = "";
  if (normalizedDates.length > 0) {
    const minD = new Date(normalizedDates[0].replace(/-/g, '/') + " 00:00:00");
    const maxD = new Date(normalizedDates[normalizedDates.length - 1].replace(/-/g, '/') + " 00:00:00");
    const minFmt = Utilities.formatDate(minD, "GMT-5", "MM.dd.yy");
    const maxFmt = Utilities.formatDate(maxD, "GMT-5", "MM.dd.yy");
    datePart = (minFmt === maxFmt) ? minFmt : `${minFmt}-${maxFmt}`;
  } else {
    let fallbackRaw = data[1][0];
    datePart = (fallbackRaw instanceof Date) ? Utilities.formatDate(fallbackRaw, "GMT-5", "MM.dd.yy") : String(fallbackRaw).split("T")[0].replace(/-/g, ".");
  }

  // Single vendor: name embedded inline (no parens). Multiple vendors: suffix with parens.
  const _safeVendorName = v => v.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const vendorInline = vendors.length === 1 ? '_' + _safeVendorName(vendors[0]) : '';
  const vendorSuffix = vendors.length > 1   ? `_(${vendors.join(', ')})` : '';
  let fileName = "";

  // 🔍 INTELLIGENT TAGGING: Check for existing reports to determine LATE vs CORRECTION
  // Use datePart as the anchor for identifying report runs for this specific slice
  const existingFiles = [];
  const existingQuery = `title contains 'Daily_Production_Report_' and title contains '${datePart}' and mimeType = 'text/csv' and trashed = false`;
  const filesIter = DriveApp.getFolderById(COMPILED_FOLDER_ID).searchFiles(existingQuery);

  while (filesIter.hasNext()) {
    const f = filesIter.next();
    existingFiles.push({
      name: f.getName(),
      created: f.getDateCreated().getTime(),
      file: f
    });
  }

  // Sort descending by creation date
  existingFiles.sort((a, b) => b.created - a.created);
  const reportExists = existingFiles.length > 0;

  let tag = "";
  if (reportExists) {
    let isLate = false;
    let isCorrection = false;

    // Build per-vendor row sets from existing baseline CSVs (up to 3 most recent)
    const scanLimit = Math.min(3, existingFiles.length);
    const baselineVendorRows = {};
    for (let i = 0; i < scanLimit; i++) {
      try {
        existingFiles[i].file.getBlob().getDataAsString()
          .split('\n').slice(1)
          .forEach(line => {
            if (!line.trim()) return;
            const cols = line.split(',');
            const lineVendor = (cols[1] || '').replace(/^"|"$/g, '').trim();
            if (lineVendor) {
              if (!baselineVendorRows[lineVendor]) baselineVendorRows[lineVendor] = [];
              baselineVendorRows[lineVendor].push(line.trim());
            }
          });
      } catch (e) {
        logMsg("⚠️ Error reading existing file for scan: " + existingFiles[i].name);
      }
    }

    vendors.forEach(v => {
      if (baselineVendorRows[v]) {
        isCorrection = true; // Vendor already reported this period — any re-submission is a correction
      } else {
        isLate = true; // New vendor submitting after the first report for this date
      }
    });

    if (isCorrection && isLate) tag = "(LATE & CORRECTION)";
    else if (isCorrection) tag = "(CORRECTION)";
    else if (isLate) tag = "(LATE)";
  }

  // 🏷️ COMPUTE BASE FILENAME
  // Format: Daily_Production_Report_{datePart}[_{tag}][_{vendor}|_{(Vendor1, Vendor2)}].csv
  if (contextType === "EMERGENCY") {
    tag = tag || "(CORRECTION)"; // Default tag for emergency if not already tagged
    fileName = `Daily_Production_Report_${datePart}_${tag}${vendorInline}${vendorSuffix}.csv`;
  } else if (contextType === "SPECIFIC") {
    fileName = `Daily_Production_Report_${datePart}${vendorInline}${vendorSuffix}.csv`;
  } else {
    // ROUTINE or MANUAL
    if (tag) {
      fileName = `Daily_Production_Report_${datePart}_${tag}${vendorInline}${vendorSuffix}.csv`;
    } else {
      fileName = `Daily_Production_Report_${datePart}${vendorInline}${vendorSuffix}.csv`;
    }
  }

  // 🔄 COLLISION PREVENTION (Versioning)
  fileName = fileName.replace(/[\\/:*?"<>|]/g, "_");
  const baseNameNoExt = fileName.replace(".csv", "");
  let finalFileName = fileName;
  let version = 1;
  const existingNames = new Set(existingFiles.map(f => f.name));
  
  while (existingNames.has(finalFileName)) {
    version++;
    finalFileName = `${baseNameNoExt}_v${version}.csv`;
  }
  fileName = finalFileName;
  const file = DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(fileName, csvContent, MimeType.CSV);
  if (!isSilent) SpreadsheetApp.getUi().alert(`CSV Exported: ${fileName}`);
  return {
    fileId: file.getId(),
    fileName: fileName,
    fileUrl: file.getUrl(),
    folderId: COMPILED_FOLDER_ID,
    createdAt: Utilities.formatDate(file.getDateCreated(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    rowCount: Math.max(0, data.length - 1)
  };
}

function buildInferenceHistoryContext(histData, histHeaders) {
  const fdhIdx = histHeaders.indexOf("FDH Engineering ID");
  const dateIdx = histHeaders.indexOf("Date");
  const contractorIdx = histHeaders.indexOf("Contractor");
  const commentIdx = histHeaders.indexOf("Vendor Comment");
  const dailyUGIdx = histHeaders.indexOf("Daily UG Footage");
  const dailyAEIdx = histHeaders.indexOf("Daily Strand Footage");
  const dailyFIBIdx = histHeaders.indexOf("Daily Fiber Footage");
  const dailyNAPIdx = histHeaders.indexOf("Daily NAPs/Encl. Completed");
  let context = {};

  if (fdhIdx < 0 || dateIdx < 0) return context;

  for (let i = 1; i < histData.length; i++) {
    let row = histData[i];
    let fdh = row[fdhIdx] ? _normalizeFdhId(row[fdhIdx]) : "";
    if (!fdh) continue;

    let rawDate = row[dateIdx];
    let entryDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(entryDate.getTime())) continue;
    let dateKey = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());

    if (!context[fdh]) context[fdh] = [];
    context[fdh].push({
      date: dateKey,
      ts: dateKey.getTime(),
      vendor: row[contractorIdx] ? _normalizeVendor(row[contractorIdx].toString().trim()) : "",
      comment: commentIdx > -1 ? String(row[commentIdx] || "").trim().toLowerCase() : "",
      dailyUG: dailyUGIdx > -1 ? (Number(row[dailyUGIdx]) || 0) : 0,
      dailyAE: dailyAEIdx > -1 ? (Number(row[dailyAEIdx]) || 0) : 0,
      dailyFIB: dailyFIBIdx > -1 ? (Number(row[dailyFIBIdx]) || 0) : 0,
      dailyNAP: dailyNAPIdx > -1 ? (Number(row[dailyNAPIdx]) || 0) : 0
    });
  }

  Object.keys(context).forEach(function(fdh) {
    context[fdh].sort(function(a, b) { return a.ts - b.ts; });
  });

  return context;
}


function runBennyDiagnostics(row, refDict, vendorDict, inferenceHistoryContext, lkvDict, adapter) {
  if (!adapter) adapter = createSchemaAdapter(HISTORY_HEADERS);
  let flags = [], drafts = [], summary = [], qbGaps = [], hCols = { warn: [], mismatch: [], ug: [], ae: [], fib: [], nap: [] }, flagColors = [], healedId = null;
  let inferredStage = "", inferredStatus = "";
  let fdhId = row[adapter.getIdx("FDH")] ? _normalizeFdhId(row[adapter.getIdx("FDH")]) : "";
  let vendorComment = row[adapter.getIdx("COMMENT")] ? row[adapter.getIdx("COMMENT")].toString().trim() : "";
  
  // 🧠 HEURISTIC: ID Correction & Reference Data Hydration
  healedId = null;
  let blockedTarget = extractBlockedAutoMatchTarget(vendorComment);
  const origMatch = vendorComment.match(/\[Auto-Fixed FDH: (.*?)\]/);
  if (blockedTarget && origMatch) {
      flags.push(`BLOCKED AUTO-MATCH`);
      flagColors.push(TEXT_COLORS.WARN);
      drafts.push(`Vendor submitted ${origMatch[1]}. Legacy auto-match to ${blockedTarget} was blocked by the market hard stop. Manual review required.`);
      vendorComment = vendorComment.replace(/\[Blocked Auto-Match: .*?\]\s*/g, "").replace(/\[Auto-Fixed FDH: .*?\]\s*/, "");
  } else if (origMatch && origMatch[1]) {
      flags.push(`ID AUTO-CORRECTED`);
      flagColors.push(TEXT_COLORS.MAGIC);
      drafts.push(`Vendor submitted ${origMatch[1]}, auto-corrected to ${fdhId}.`);
      vendorComment = vendorComment.replace(/\[Auto-Fixed FDH: .*?\]\s*/, "");
  }
  if (!refDict[fdhId]) {
      let softHeal = attemptFuzzyMatch(fdhId, Object.keys(refDict));
      if (softHeal) { fdhId = softHeal; healedId = softHeal; flags.push(`SOFT MATCH`); flagColors.push(TEXT_COLORS.MAGIC); drafts.push(`Archive has typo. Matched to ${softHeal}.`); }
  }
  let rowState = "ACTIVE", adaePaletteIdx = "CLEAN";
  let refData = refDict[fdhId];
  let vTracker = vendorDict[fdhId];

  if (refData) {
    let status = refData.status.toLowerCase();
    if (status.includes("complete")) rowState = "COMPLETE"; else if (status.includes("on hold")) rowState = "ON_HOLD"; else if (refData.stage.toLowerCase().includes("ofs")) rowState = "OFS"; else if (refData.stage.toLowerCase().includes("permitting")) rowState = "PERMITTING";

    if (rowState !== "COMPLETE" && rowState !== "OFS") {
        qbGaps.push((refData.hasSOW ? "SOW" : "SOW"));
        qbGaps.push((refData.hasCD ? "CD" : "CD"));
        const dUG = Number(row[adapter.getIdx("DAILY_UG")]) || 0;
        const dAE = Number(row[adapter.getIdx("DAILY_AE")]) || 0;
        const dFIB = Number(row[adapter.getIdx("DAILY_FIB")]) || 0;
        const dNAP = Number(row[adapter.getIdx("DAILY_NAP")]) || 0;
        let bomMissingData = (dUG > 0 && (refData.ugBOM || 0) === 0) || (dAE > 0 && (refData.aeBOM || 0) === 0) || (dFIB > 0 && (refData.fibBOM || 0) === 0) || (dNAP > 0 && (refData.napBOM || 0) === 0);
        qbGaps.push("BOM");
    }
    if (refData.isSpecialX) qbGaps.push("X-ING");

    // CROSSING CHECK
    const xingVal = (refData.rawSpecialX || "").toString().trim().toLowerCase();
    const hasBeenChecked = refData.adminDate && refData.adminDate !== "";
    if (xingVal === "" && !hasBeenChecked && !rowState.includes("OFS") && !rowState.includes("COMPLETE")) {
        flags.push("ADMIN: CHECK CROSSINGS");
        flagColors.push("#991b1b");
    }
  }

  // 🧠 PRODUCTION SUMMARY & METRICS
  const prod = ProductionSummarizer.generateSummary(row, adapter, refData, vTracker);
  summary = prod.visualLines;
  const m = prod.metrics;

  // 🚀 UNIFIED RECONCILIATION ENGINE
  const recon = ReconciliationEngine.reconcile(row, adapter, refData, m, {
      fdhId: fdhId,
      refDict: refDict,
      lkvDict: lkvDict,
      vTracker: vTracker,
      rowState: rowState,
      inferenceHistoryContext: inferenceHistoryContext
  });

  flags = flags.concat(recon.flags);
  drafts = drafts.concat(recon.drafts);
  flagColors = flagColors.concat(recon.flagColors);
  inferredStage = recon.inferredStage;
  inferredStatus = recon.inferredStatus;
  
  // Merge column highlighting
  Object.keys(recon.hCols).forEach(k => {
    if (recon.hCols[k].length > 0) hCols[k] = hCols[k].concat(recon.hCols[k]);
  });

  // Additional formatting for row state
  if (rowState !== "ACTIVE") { 
    flags.push(`${ROW_THEMES[rowState].label}`); 
    flagColors.push(ROW_THEMES[rowState].text); 
    drafts.push(`QB shows this FDH as ${refData ? refData.status : "Unknown"}.`); 
  }

  // Supporting metrics for diagnostics
  const drills = Number(row[adapter.getIdx("Drills")]) || 0;
  const crewsAE = Number(row[adapter.getIdx("AE Crews")]) || 0;
  const crewsFIB = Number(row[adapter.getIdx("Fiber Pulling Crews")]) || 0;
  const crewsNAP = Number(row[adapter.getIdx("Splicing Crews")]) || 0;

  if (fdhId !== "" && !/^[A-Z]{3}\d{2,3}[a-z]?-F\d{2,4}$/i.test(fdhId)) {
      flags.push(`FORMAT ERROR`);
      flagColors.push(TEXT_COLORS.WARN);
      hCols.warn.push("FDH Engineering ID");
  } else if (fdhId !== "" && !refData) {
      hCols.warn.push("FDH Engineering ID");
  }
  
  if (m.dailyUG > 0 && drills === 0) { flags.push("GHOST UG"); flagColors.push(TEXT_COLORS.UG); hCols.ug.push("Daily UG Footage", "Drills"); adaePaletteIdx = "UG"; }
  if (drills > 0 && (m.dailyUG / drills) > 800) { flags.push(`UG PACE ANOMALY`); flagColors.push(TEXT_COLORS.UG); drafts.push(`UG Pace is ${Math.round(m.dailyUG/drills)}ft/drill.`); hCols.ug.push("Daily UG Footage", "Drills"); adaePaletteIdx = "UG"; }
  if (m.dailyAE > 0 && crewsAE === 0) { flags.push("GHOST AE"); flagColors.push(TEXT_COLORS.AE); hCols.ae.push("Daily Strand Footage", "AE Crews"); adaePaletteIdx = "AE"; }
  if (crewsAE > 0 && (m.dailyAE / crewsAE) > 5000) { flags.push(`AE PACE ANOMALY`); flagColors.push(TEXT_COLORS.AE); drafts.push(`AE Pace is ${Math.round(m.dailyAE/crewsAE)}ft/crew.`); hCols.ae.push("Daily Strand Footage", "AE Crews"); adaePaletteIdx = "AE"; }
  if (m.dailyFIB > 0 && crewsFIB === 0) { flags.push("GHOST FIBER"); flagColors.push(TEXT_COLORS.FIB); hCols.fib.push("Daily Fiber Footage", "Fiber Pulling Crews"); adaePaletteIdx = "FIB"; }
  if (crewsFIB > 0 && (m.dailyFIB / crewsFIB) > 10000) { flags.push(`FIBER PACE ANOMALY`); flagColors.push(TEXT_COLORS.FIB); drafts.push(`Fiber Pace is ${Math.round(m.dailyFIB/crewsFIB)}ft/crew.`); hCols.fib.push("Daily Fiber Footage", "Fiber Pulling Crews"); adaePaletteIdx = "FIB"; }
  if (m.dailyNAP > 0 && crewsNAP === 0) { flags.push("GHOST SPLICING"); flagColors.push(TEXT_COLORS.NAP); hCols.nap.push("Daily NAPs/Encl. Completed", "Splicing Crews"); adaePaletteIdx = "NAP"; }
  if (crewsNAP > 0 && (m.dailyNAP / crewsNAP) > 6) { flags.push(`SPLICE PACE ANOMALY`); flagColors.push(TEXT_COLORS.NAP); drafts.push(`Splicing Pace is ${Math.round(m.dailyNAP/crewsNAP)} NAPs/crew.`); hCols.nap.push("Daily NAPs/Encl. Completed", "Splicing Crews"); adaePaletteIdx = "NAP"; }

  const _ingestComment = (row[adapter.getIdx("COMMENT")] || "").toString();
  if (_ingestComment.includes("from Total Jump")) {
      flags.push("DAILY INFERRED");
      flagColors.push(TEXT_COLORS.MAGIC);
      drafts.push("One or more daily values were inferred from a total column jump. Review Construction Comments for detail.");
  }
  if (_ingestComment.includes("TOTAL REGRESSION")) {
      flags.push("TOTAL REGRESSION");
      flagColors.push(TEXT_COLORS.WARN);
      drafts.push("A cumulative total decreased vs. its prior max. Vendor may have submitted a correction. Verify source data.");
  }
  if (_ingestComment.includes("DAILY/TOTAL MISMATCH")) {
      flags.push("DAILY/TOTAL MISMATCH");
      flagColors.push(TEXT_COLORS.MISMATCH);
      drafts.push("Reported daily footage does not reconcile with the total column jump. One of these values is likely wrong.");
  }
  
  if (vTracker && vTracker.notes && vTracker.notes !== "") {
      let spacing = vendorComment === "" ? "" : "\n\n";
      vendorComment += spacing + `[Tracker Note]: "${vTracker.notes}"`;
  }
  
  if (summary.length === 0) {
      let linkedStatus = vTracker ? "\n[📡 Tracker Linked]" : "";
      summary.push("No new production reported in the current report." + linkedStatus);
  } else if (vTracker) {
      summary.push("\n[📡 Tracker Linked]");
  }

  if (hCols.warn.length > 0) adaePaletteIdx = "RED"; else if (hCols.mismatch.length > 0) adaePaletteIdx = "YELLOW";
  
  let overrides = {};
  if (refData) {
      const map = [{h: "UG BOM Quantity", dbVal: refData.ugBOM}, {h: "Strand BOM Quantity", dbVal: refData.aeBOM}, {h: "Fiber BOM Quantity", dbVal: refData.fibBOM}, {h: "NAP/Encl. BOM Qty.", dbVal: refData.napBOM}];
      map.forEach(item => {
          let vendorVal = Number(row[HISTORY_HEADERS.indexOf(item.h)]) || 0;
          if (vendorVal > 0 && vendorVal !== item.dbVal) {
              overrides[item.h] = `${vendorVal}\n(BOM: ${item.dbVal})`;
          }
      });
  }

  return { 
      rowState: rowState, adaePaletteIdx: adaePaletteIdx, flags: flags.join("\n"), 
      flagColors: flagColors, draft: drafts.join("\n"), summary: summary.join("\n").trim(), 
      gaps: qbGaps.join("  "), colors: hCols, cleanComment: vendorComment, 
      healedId: healedId, overrides: overrides, inferredStage: inferredStage, inferredStatus: inferredStatus
  };
}


// --- HELPERS (Now in ReconciliationEngine) ---

function generateDailyReviewCore(targetDateStr, optionalRefDict = null, isSilent = false) {
  _mergeDynamicAliases();
  const engineStartMs = Date.now();
  const rebuildTimings = {};
  const markTiming = function(label, startMs) {
    rebuildTimings[label] = Date.now() - startMs;
  };
  CacheService.getScriptCache().remove('dashboard_data_cache');
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  const styleSheet = ss.getSheetByName(STYLE_MASTER);
  let targetDates = Array.isArray(targetDateStr) ? targetDateStr : [targetDateStr];
  const historyAdapter = createSchemaAdapter(HISTORY_HEADERS);

  /**
   * 🧠 AGGRESSIVE NORMALIZER: Always returns YYYY-MM-DD
   */
  const normalizeDate = (d) => {
    if (!d || d === "" || d === "-") return "";
    let obj = (d instanceof Date) ? d : null;
    
    if (!obj) {
        let s = String(d).trim();
        if (s === "") return "";
        
        // Handle ISO: 2026-04-18
        let mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (mIso) return `${mIso[1]}-${mIso[2].padStart(2,'0')}-${mIso[3].padStart(2,'0')}`;
        
        // Handle US: 04/18/26 or 4/18/2026
        let mUs = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
        if (mUs) {
            let yr = mUs[3].length === 2 ? "20" + mUs[3] : mUs[3];
            return `${yr}-${mUs[1].padStart(2,'0')}-${mUs[2].padStart(2,'0')}`;
        }

        // Handle Excel Serial Numbers (e.g., 45678)
        let numVal = parseFloat(s);
        if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
            obj = new Date((numVal - 25569) * 86400 * 1000);
        } else {
            obj = new Date(s);
        }
    }
    
    if (!obj || isNaN(obj.getTime())) return String(d).split('T')[0].trim();
    
    let yr = obj.getFullYear();
    let mo = String(obj.getMonth() + 1).padStart(2, '0');
    let da = String(obj.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  /**
   * 🧠 MIDNIGHT PARSER: Ensures local date comparison is time-blind
   */
  const parseDateToMidnight = (val) => {
      const norm = normalizeDate(val);
      if (!norm || norm.length < 10 || isNaN(new Date(norm).getTime())) {
          // If truly invalid, return a date in the past to ensure it doesn't win "latest"
          return new Date(1990, 0, 1); 
      }
      const parts = norm.split('-');
      return new Date(parts[0], parts[1]-1, parts[2], 0, 0, 0);
  };

  const normalizedTargets = targetDates.map(normalizeDate).filter(Boolean);
  
  let timerStartMs = Date.now();
  let refDict = optionalRefDict || getReferenceDictionary();
  markTiming("referenceDictionaryMs", timerStartMs);
  timerStartMs = Date.now();
  let vendorDict = getVendorLiveDictionary(refDict);
  markTiming("vendorLiveDictionaryMs", timerStartMs);
  timerStartMs = Date.now();
  let xingsDict = getSpecialXingsDictionary(); // 🧠 FETCH CD DATA
  markTiming("specialXingsDictionaryMs", timerStartMs);

  timerStartMs = Date.now();
  const histData = histSheet.getDataRange().getValues();
  markTiming("archiveReadMs", timerStartMs);

  timerStartMs = Date.now();
  let benchmarkDict = buildBenchmarkDictionary(histData, HISTORY_HEADERS, refDict);
  markTiming("benchmarkDictionaryMs", timerStartMs);
  timerStartMs = Date.now();
  let lkvDict = buildCxLkvDictionary(mirrorSheet);
  markTiming("cxLkvDictionaryMs", timerStartMs);
  timerStartMs = Date.now();
  let inferenceHistoryContext = buildInferenceHistoryContext(histData, HISTORY_HEADERS);
  markTiming("inferenceHistoryContextMs", timerStartMs);

  timerStartMs = Date.now();
  let currentMirrorHeaders = mirrorSheet.getLastColumn() > 0 ? mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0] : [];
  markTiming("mirrorHeaderReadMs", timerStartMs);
  let defaultHeaders = [...HISTORY_HEADERS, ...REVIEW_EXTRA_HEADERS, ...ANALYTICS_QUADRANT, "Archive_Row"];
  let finalMirrorHeaders = defaultHeaders;
  
  if (currentMirrorHeaders.includes("FDH Engineering ID")) {
    let missingHeaders = defaultHeaders.filter(h => !currentMirrorHeaders.includes(h));
    finalMirrorHeaders = [...currentMirrorHeaders, ...missingHeaders]; 
    
    // 🧠 SYNC HEADERS: If we have new columns (like AllVendors), write them to the sheet immediately
    if (missingHeaders.length > 0) {
        mirrorSheet.getRange(1, 1, 1, finalMirrorHeaders.length).setValues([finalMirrorHeaders]);
        logMsg("BENNY ENGINE: Synchronized Mirror headers. Added: " + missingHeaders.join(", "));
    }
  }
  
  let reviewMap = new Map();
  let submittedFdhs = new Set();
  let latestReportMap = new Map(); // 🧠 LATEST STATE TRACKER: FDH -> {row, idx, dateObj}

  // 🧠 DYNAMIC COLUMN DISCOVERY: Ensure we use the actual indices of the Archive sheet
  const histHeadersRow = histData[0] || [];
  const fdhIdIdx = histHeadersRow.indexOf("FDH Engineering ID");
  const contractorIdx = histHeadersRow.indexOf("Contractor");
  const commentIdx = histHeadersRow.indexOf("Vendor Comment");

  if (fdhIdIdx === -1 || contractorIdx === -1) {
      logMsg("ERROR", "BENNY ENGINE", "Required columns missing in Master Archive. Multi-vendor discovery aborted.");
  }

  // 🧠 MULTI-VENDOR DISCOVERY: Map every vendor that ever touched a project.
  let projectVendorMap = new Map(); // FDH -> Set of Normalized Vendor Names
  
  // 1. Initialize with currently assigned vendor from Quickbase (Reference Data)
  Object.keys(refDict).forEach(rawId => {
      let ref = refDict[rawId];
      let fdhId = _normalizeFdhId(rawId);
      if (ref && ref.vendor) {
          if (!projectVendorMap.has(fdhId)) projectVendorMap.set(fdhId, new Set());
          projectVendorMap.get(fdhId).add(_normalizeVendor(ref.vendor));
      }
  });

  // 2. Supplement with historical contractors from the Master Archive
  if (fdhIdIdx > -1) {
      histData.forEach((row, idx) => {
        if (idx === 0) return;
        let fdhId = row[fdhIdIdx] ? _normalizeFdhId(row[fdhIdIdx]) : "";
        let vendor = row[contractorIdx] ? _normalizeVendor(row[contractorIdx].toString().trim()) : "";
        if (fdhId && vendor) {
          if (!projectVendorMap.has(fdhId)) projectVendorMap.set(fdhId, new Set());
          projectVendorMap.get(fdhId).add(vendor);
        }
      });
  }

  // 🧠 CHRONOLOGICAL HANDOFF DETECTION: Scan sorted history contexts for vendor transitions
  Object.keys(inferenceHistoryContext).forEach(rawId => {
      let fdhId = _normalizeFdhId(rawId);
      let history = inferenceHistoryContext[rawId];
      if (!history || history.length < 2) return;
      
      let lastV = null;
      history.forEach(entry => {
          let currentV = entry.vendor ? _normalizeVendor(entry.vendor) : null;
          if (lastV && currentV && lastV !== currentV) {
              let dateStr = Utilities.formatDate(entry.date, "GMT-5", "MM/dd/yy");
              let handoffLabel = `HANDOFF: ${lastV} -> ${currentV}`;
              if (!benchmarkDict[fdhId]) benchmarkDict[fdhId] = `${dateStr}: ${handoffLabel}`;
              else if (!benchmarkDict[fdhId].includes(handoffLabel)) benchmarkDict[fdhId] += `\n${dateStr}: ${handoffLabel}`;
          }
          if (currentV) lastV = currentV;
      });
  });

  logMsg("BENNY ENGINE: Processing " + histData.length + " archive rows for " + normalizedTargets.length + " target dates.");

  timerStartMs = Date.now();
  
  // 🧠 DAILY MERGE STAGING: Key = DateStr + "_" + FDH
  let dailyMergeMap = new Map(); 

  histData.forEach((row, idx) => {
    if (idx === 0) return; 
    
    let fdhId = row[fdhIdIdx] ? _normalizeFdhId(row[fdhIdIdx]) : "";
    if (!fdhId) return;

    let rowDateObj = parseDateToMidnight(row[0]);
    let existing = latestReportMap.get(fdhId);
    if (!existing || rowDateObj > existing.dateObj) {
      latestReportMap.set(fdhId, { row: row, idx: idx, dateObj: rowDateObj });
    }

    let rowDate = normalizeDate(row[0]);
    
    if (normalizedTargets.includes(rowDate)) {
      submittedFdhs.add(fdhId);
      
      let mergeKey = rowDate + "_" + fdhId;
      if (!dailyMergeMap.has(mergeKey)) {
          // Initialize with a clone of the row to avoid mutating source histData
          dailyMergeMap.set(mergeKey, { 
              row: [...row], 
              archiveIdx: idx,
              vendors: new Set([_normalizeVendor(row[contractorIdx] || "")])
          });
      } else {
          // 🧠 MERGE LOGIC: Sum production columns and join comments
          let existingData = dailyMergeMap.get(mergeKey);
          let baseRow = existingData.row;
          let currentVendor = _normalizeVendor(row[contractorIdx] || "");
          
          if (currentVendor && !existingData.vendors.has(currentVendor)) {
              existingData.vendors.add(currentVendor);
              // Prepend vendor name to comment if not already merged
              let baseComment = String(baseRow[commentIdx] || "").trim();
              let newComment = String(row[commentIdx] || "").trim();
              
              let baseContr = String(baseRow[contractorIdx] || "").trim();
              let mergedComment = `[${baseContr}]: ${baseComment} | [${currentVendor}]: ${newComment}`;
              baseRow[commentIdx] = mergedComment;
              
              // Update contractor field to show both (temporarily for diag)
              baseRow[contractorIdx] = Array.from(existingData.vendors).join(" / ");
          }

          // Sum production values
          const sumCols = ["Daily UG Footage", "Daily Strand Footage", "Daily Fiber Footage", "Daily NAPs/Encl. Completed", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews"];
          sumCols.forEach(col => {
              let cIdx = histHeadersRow.indexOf(col);
              if (cIdx > -1) {
                  baseRow[cIdx] = (Number(baseRow[cIdx]) || 0) + (Number(row[cIdx]) || 0);
              }
          });
      }
    }
  });

  // 🧠 PROCESS MERGED REPORTS
  dailyMergeMap.forEach((mergeData, mergeKey) => {
    let row = mergeData.row;
    let idx = mergeData.archiveIdx;
    let fdhId = _normalizeFdhId(row[fdhIdIdx]);
    let diag = runBennyDiagnostics(row, refDict, vendorDict, inferenceHistoryContext, lkvDict, historyAdapter);
    
    if (mergeData.vendors.size > 1 || (benchmarkDict[fdhId] && benchmarkDict[fdhId].includes("HANDOFF"))) {
        let handoffMatch = benchmarkDict[fdhId] ? benchmarkDict[fdhId].match(/(\d{2}\/\d{2}\/\d{2}): HANDOFF: (.*)/) : null;
        let fullDate = handoffMatch ? handoffMatch[1] : Utilities.formatDate(new Date(row[0]), "GMT-5", "MM/dd/yy");
        let dateParts = fullDate.split('/');
        let mmDd = dateParts[0] + '/' + dateParts[1];
        let handoffDetail = handoffMatch ? handoffMatch[2] : Array.from(mergeData.vendors).join(" & ");
        let handoffFlag = `HANDOFF (${mmDd})`;

        // Deduplicate: replace generic HANDOFF if it exists, otherwise append
        if (diag.flags.includes("HANDOFF")) {
            diag.flags = diag.flags.split("\n").map(function(f) { return f.trim() === "HANDOFF" ? handoffFlag : f; }).join("\n");
        } else if (diag.flags !== "No Anomalies" && diag.flags !== "") {
            diag.flags += "\n" + handoffFlag;
        } else {
            diag.flags = handoffFlag;
        }
        
        if (!diag.flagColors.includes("#64748b")) diag.flagColors.push("#64748b"); // Slate Gray
        
        const handoffNote = `Project handoff detected on ${mmDd} (${handoffDetail}).`;
        if (!diag.draft.includes("handoff detected")) {
            diag.draft = (diag.draft ? diag.draft + " " : "") + handoffNote;
        }

        if (mergeData.vendors.size > 1) {
            // Add handoff milestone if multi-vendor on same day
            let handoffLabel = `HANDOFF: ${Array.from(mergeData.vendors).join(" & ")}`;
            let datePrefix = Utilities.formatDate(new Date(row[0]), "GMT-5", "MM/dd/yy");
            if (!benchmarkDict[fdhId]) benchmarkDict[fdhId] = `${datePrefix}: ${handoffLabel}`;
            else if (!benchmarkDict[fdhId].includes(handoffLabel)) benchmarkDict[fdhId] += `\n${datePrefix}: ${handoffLabel}`;
        }
    }

    if (diag.flags.includes("POSSIBLE REROUTE (NAP)")) {
        diag.flags = diag.flags.replace(/POSSIBLE REROUTE \(NAP\)/g, "SCOPE DEVIATION (NAP)");
        diag.draft = diag.draft.replace(/QB shows 0 BOM for NAP, but vendor reported activity\. Verify if a reroute occurred\./g, "Vendor reported Splicing activity, but BOM shows 0 NAPs. Verify if scope was expanded.");
    }
    
    if (benchmarkDict[fdhId] && benchmarkDict[fdhId].includes("Possible Reroute")) {
        benchmarkDict[fdhId] = benchmarkDict[fdhId].replace(/NAP: Pending \[Possible Reroute\]/g, "NAP: Pending [Scope Deviation]");
    }

    let cdIntelText = "";
    if (xingsDict[fdhId]) {
        let cdData = xingsDict[fdhId];
        if (cdData.summary !== "") {
            cdIntelText = cdData.summary;
        }
        if (cdData.hasFindings) {
            if (diag.flags !== "No Anomalies" && diag.flags !== "") diag.flags += "\nCD: MAJOR CROSSING RISK";
            else diag.flags = "CD: MAJOR CROSSING RISK";
            diag.flagColors.push("#b45309");
        }
    }
    let refData = null;

    if (diag.healedId) { fdhId = diag.healedId; refData = refDict[fdhId]; }
    else refData = refDict[fdhId];
    
    let rowObj = {};
    const BOM_HEADERS = ["UG BOM Quantity", "Strand BOM Quantity", "Fiber BOM Quantity", "NAP/Encl. BOM Qty."];
    const BOM_MAP = {
        "UG BOM Quantity": "ugBOM",
        "Strand BOM Quantity": "aeBOM",
        "Fiber BOM Quantity": "fibBOM",
        "NAP/Encl. BOM Qty.": "napBOM"
    };

    HISTORY_HEADERS.forEach((h, i) => {
      if (h === "Vendor Comment") rowObj[h] = diag.cleanComment;
      else if (h === "FDH Engineering ID") rowObj[h] = fdhId;
      else if (diag.overrides && diag.overrides[h]) rowObj[h] = diag.overrides[h];
      else if (refData && BOM_HEADERS.includes(h)) {
          // Prioritize live reference data (QB) for BOM columns to ensure progress bars have targets
          let qbVal = refData[BOM_MAP[h]];
          rowObj[h] = (qbVal !== undefined && qbVal !== 0) ? qbVal : (row[i] || 0);
      }
      else rowObj[h] = row[i];
    });
    
    // 🧠 MULTI-VENDOR OVERRIDE: Prioritize live reference data, but append all discovered vendors
    let discoveredVendors = Array.from(projectVendorMap.get(fdhId) || []);
    rowObj["Contractor"] = refData ? refData.vendor : rowObj["Contractor"];
    rowObj["AllVendors"] = discoveredVendors.join(", ");
    
    rowObj["City"] = refData ? refData.city : "-"; 
    rowObj["Stage"] = refData ? refData.stage : (diag.inferredStage || "-"); 
    rowObj["Status"] = refData ? refData.status : (diag.inferredStatus || "-"); 
    
    // 🧠 MIRROR BACKUP PROTOCOL: Prioritize Live Reference Data, fallback to Archive values if missing
    rowObj["BSLs"] = (refData && refData.bsls && refData.bsls !== "-") ? refData.bsls : (rowObj["BSLs"] || "-");
    rowObj["Budget OFS"] = (refData && (refData.canonicalOfsDate || refData.forecastedOFS) && (refData.canonicalOfsDate || refData.forecastedOFS) !== "-") 
      ? (refData.canonicalOfsDate || refData.forecastedOFS) 
      : (rowObj["Budget OFS"] || "-");

    let cxResolved = resolveCxDates(fdhId, refData, lkvDict, histData, HISTORY_HEADERS);
    rowObj["CX Start"]    = cxResolved.cxStart;
    rowObj["CX Complete"] = cxResolved.cxComplete;
    rowObj["CX Inferred"] = cxResolved.inferredLabel;
    rowObj["CD Intelligence"] = cdIntelText; 
    rowObj["Gemini Insight"] = refData ? refData.geminiInsight : "";
    rowObj["Gemini Insight Date"] = refData ? refData.geminiDate : "";

    let adminGapsStr = diag.gaps; 
    if (refData) {
        const xingVal = (refData.rawSpecialX || "").toString().trim().toLowerCase();
        let xingString = "X-ING UNCHECKED"; 
        if (xingVal === "yes" || xingVal === "true") xingString = "X-ING YES";
        else if (xingVal === "no" || xingVal === "false") xingString = "X-ING CLEAR";
        
        let hasBeenChecked = refData.adminDate && refData.adminDate !== "";
        let adminDateStr = hasBeenChecked ? `[Chk: ${refData.adminDate}]` : `[Chk: NEVER]`;
        adminGapsStr = `${adminDateStr}  |  ${refData.hasSOW ? "SOW" : "SOW"}  ${refData.hasCD ? "CD" : "CD"}  ${refData.hasBOM ? "BOM" : "BOM"}  |  ${xingString}`;

        // 🧠 DEPENDENCY CHECK: Flag if any hard predecessor (from QB) is not yet complete/active.
        if (refData.qbRef && refData.qbRef.predecessors && refData.qbRef.predecessors.length > 0) {
            let blockers = refData.qbRef.predecessors.filter(function(bId) {
                let bRef = refDict[bId.toUpperCase().trim()];
                if (!bRef) return false; 
                let bStage = (bRef.stage || "").toUpperCase();
                let bStatus = (bRef.status || "").toUpperCase();
                let isBComplete = bStage.includes("OFS") || bStatus.includes("COMPLETE") || bStatus.includes("ACTIVE");
                return !isBComplete;
            });

            if (blockers.length > 0) {
                if (diag.flags !== "No Anomalies" && diag.flags !== "") diag.flags += "\nBLOCKED BY PREDECESSOR";
                else diag.flags = "BLOCKED BY PREDECESSOR";
                diag.flagColors.push("#991b1b"); 
                let bList = blockers.join(", ");
                diag.draft = (diag.draft ? diag.draft + " " : "") + `Blocked by predecessor(s): ${bList}.`;
            }
        }
    }
    
    rowObj["Health Flags"] = diag.flags; 
    rowObj["Action Required"] = diag.draft;
    rowObj["CD Intelligence"] = cdIntelText; 
    rowObj["Field Production"] = diag.summary; 
    rowObj["QB Context & Gaps"] = adminGapsStr; 
    rowObj["Historical Milestones"] = benchmarkDict[fdhId] || "No history logged.";
    rowObj["Archive_Row"] = idx + 1;
    
    let mappedRow = finalMirrorHeaders.map(h => rowObj[h] !== undefined ? rowObj[h] : "");
    
    // DEDUPLICATION: Only keep the latest report for this FDH within the range
    // Archive is usually processed oldest to newest, so later reports overwrite earlier ones.
    reviewMap.set(fdhId, {
      mappedRow: mappedRow,
      highlights: { rowState: diag.rowState, adaePaletteIdx: diag.adaePaletteIdx, colors: diag.colors, summary: diag.summary, gaps: adminGapsStr, flags: diag.flags, flagColors: diag.flagColors, cleanComment: diag.cleanComment, draft: diag.draft, benchmark: benchmarkDict[fdhId] || ""}
    });
  });
  markTiming("reviewAssemblyMs", timerStartMs);

  let reviewData = [], highlightsData = [];
  reviewMap.forEach(val => {
    reviewData.push(val.mappedRow);
    highlightsData.push(val.highlights);
  });

  logMsg("BENNY ENGINE: Review built with " + reviewData.length + " unique project reports.");

  // GHOST ROW INJECTION — portfolio-visible projects with no submission today
  
  // 🧠 TARGET CAP: Ensure we don't calculate staleness against the future
  let rawTargetDate = parseDateToMidnight(normalizedTargets[0] || new Date());
  const todayAtMidnight = parseDateToMidnight(new Date());
  const targetDateObj = (rawTargetDate > todayAtMidnight) ? todayAtMidnight : rawTargetDate;
  
  // 🔍 AUDIT: Verify date matching
  if (histData.length > 1) {
      const lastRowDate = normalizeDate(histData[histData.length - 1][0]);
      logMsg(`BENNY ENGINE [Date Match Audit]: target=${normalizedTargets[0] || 'NONE'}, lastArchiveDate=${lastRowDate}`);
  }

  timerStartMs = Date.now();
  Object.keys(refDict).forEach(ghostFdhId => {
    if (submittedFdhs.has(ghostFdhId)) return;
    const ref = refDict[ghostFdhId];
    if (!ref.vendor) return;

    const hasHistory = latestReportMap.get(ghostFdhId);
    const hasHandoff = benchmarkDict[ghostFdhId] && benchmarkDict[ghostFdhId].includes("HANDOFF");

    let cxDates = resolveCxDates(ghostFdhId, ref, lkvDict, histData, HISTORY_HEADERS);
    const portfolioMeta = _getPortfolioVisibilityMeta({
      stage: ref.stage,
      status: ref.status,
      primaryOfsDate: ref.canonicalOfsDate || ref.forecastedOFS || "",
      fallbackOfsDate: ref.canonicalOfsDate || ref.forecastedOFS || "",
      cxStart: cxDates.cxStart,
      targetDate: ref.canonicalOfsDate || ref.forecastedOFS || "",
      reportDate: normalizedTargets[0] || new Date(),
      referenceDate: targetDateObj,
      hasHistory: !!hasHistory
    });

    // 🧠 VISIBILITY OVERRIDE: If a handoff is detected, force the project into the portfolio 
    // regardless of stage, so the historical vendor sections remain populated.
    if (!portfolioMeta.includeInPortfolio && !hasHandoff) return;

    // A report is not missing if the start date has not passed yet.
    let startDate = cxDates.cxStart ? new Date(cxDates.cxStart) : null;
    let isUpcomingWindowOnly = portfolioMeta.reason === 'approved-upcoming-60d' || portfolioMeta.reason === 'active-upcoming-start';
    let isStartGraceOnly = portfolioMeta.reason === 'active-start-grace' || portfolioMeta.reason === 'reported-start-grace';
    if (startDate && !isNaN(startDate.getTime())) {
        let todayAtMid = new Date();
        todayAtMid.setHours(0,0,0,0);
        if (startDate > todayAtMid) isUpcomingWindowOnly = true;
    }

    const latest = latestReportMap.get(ghostFdhId);
    let ghostRowObj = {};
    
    if (hasHistory && latest) {
      // 🧠 UPGRADE: Use latest known report data instead of zeroes
      const lRow = latest.row;
      
      // 🧠 GHOST DIAGNOSTICS: Run full diagnostics on the latest row, but zero out daily production
      let ghostDiagnosticRow = [...lRow];
      const dailyCols = ["Daily UG Footage", "Daily Strand Footage", "Daily Fiber Footage", "Daily NAPs/Encl. Completed", "Locates Called In", "Drills", "AE Crews", "Fiber Pulling Crews", "Splicing Crews"];
      dailyCols.forEach(col => {
          let idx = HISTORY_HEADERS.indexOf(col);
          if (idx > -1) ghostDiagnosticRow[idx] = (col === "Locates Called In") ? false : 0;
          });

          let diag = runBennyDiagnostics(ghostDiagnosticRow, refDict, vendorDict, inferenceHistoryContext, lkvDict, historyAdapter);

          HISTORY_HEADERS.forEach((h, i) => {        ghostRowObj[h] = lRow[i];
      });
      
      let reportDate = parseDateToMidnight(lRow[0]);

      // Count only completed business days since the last report. Monday carries Friday
      // so a Thursday latest report does not become stale until Tuesday.
      let daysAgo = countMissedReportBusinessDays(reportDate, targetDateObj);
      const isMondayCarry = targetDateObj.getDay() === 1 && daysAgo <= 1;

      // 🧠 SUPPRESSION OVERRIDE: Always show active ghost projects to keep the dashboard count consistent.
      // We no longer return early here if daysAgo === 0; we want all legitimate projects visible.

      let staleFlag = "STALE REPORT";
      let staleColor = TEXT_COLORS.GHOST;
      let staleDraft = `Action: Contact Vendor. Active project with reporting history is missing a submission for this date. Last report was ${daysAgo} business day(s) ago.`;

      if (isMondayCarry) {
        staleFlag = "WEEKEND CARRY";
        staleColor = TEXT_COLORS.GHOST;
        staleDraft = `Weekend carry applied. Last report was ${Utilities.formatDate(reportDate, "GMT-5", "MM/dd/yy")}.`;
      } else if (daysAgo >= 2) {
        staleFlag = `STALE REPORT (${daysAgo} Business Days)`;
        staleColor = TEXT_COLORS.WARN;
      } else if (daysAgo === 1) {
        // Normal 1-day reporting lag - show project but don't mark as "STALE"
        staleFlag = "REPORT PENDING";
        staleColor = TEXT_COLORS.GHOST;
        staleDraft = `Latest report is from the previous business day. Expected update later today.`;
      } else {
        // daysAgo is 0 (Up to date)
        staleFlag = "CURRENT";
        staleColor = TEXT_COLORS.DONE;
        staleDraft = `Project is up to date based on the latest business day.`;
      }
      // Merge stale flag with existing diagnostics
      if (staleFlag !== "CURRENT") {
          if (diag.flags !== "No Anomalies" && diag.flags !== "") {
              diag.flags = staleFlag + "\n" + diag.flags;
              diag.flagColors.unshift(staleColor);
          } else {
              diag.flags = staleFlag;
              diag.flagColors = [staleColor];
          }
      }

      if (isUpcomingWindowOnly) {
        ghostRowObj["Health Flags"] = "UPCOMING START WINDOW";
        ghostRowObj["Action Required"] = "Action: Monitor schedule. Approved project is inside the rolling 60-day horizon and not expected to report yet.";
        ghostRowObj["Vendor Comment"] = "Approved upcoming project inside the 60-day planning window.";
      } else if (isStartGraceOnly) {
        ghostRowObj["Health Flags"] = "REPORT PENDING";
        ghostRowObj["Action Required"] = "Action: Monitor start. First daily report is expected on the next business day after CX Start.";
        ghostRowObj["Vendor Comment"] = "First daily report is due on the next business day after CX Start.";
      } else {
        ghostRowObj["Health Flags"]    = diag.flags;
        ghostRowObj["Action Required"] = (diag.draft ? diag.draft + "\n" : "") + staleDraft;
        ghostRowObj["Vendor Comment"]  = lRow[HISTORY_HEADERS.indexOf("Vendor Comment")] || "No update provided.";
      }

      // 🧠 HANDOFF PERSISTENCE: Ensure handoff flags/notes survive grace window and missing report overrides
      if (hasHandoff) {
          let handoffMatch = benchmarkDict[ghostFdhId].match(/(\d{2}\/\d{2}\/\d{2}): HANDOFF: (.*)/);
          let fullDate = handoffMatch ? handoffMatch[1] : Utilities.formatDate(targetDateObj, "GMT-5", "MM/dd/yy");
          let dateParts = fullDate.split('/');
          let mmDd = (dateParts.length >= 2) ? (dateParts[0] + '/' + dateParts[1]) : fullDate;
          let handoffDetail = handoffMatch ? handoffMatch[2] : "Multi-vendor detected";
          let handoffFlag = `HANDOFF (${mmDd})`;

          let currentFlags = ghostRowObj["Health Flags"] || "";
          if (currentFlags.includes("HANDOFF")) {
              currentFlags = currentFlags.split("\n").map(function(f) { return f.trim() === "HANDOFF" ? handoffFlag : f; }).join("\n");
          } else if (currentFlags !== "" && currentFlags !== "No Anomalies") {
              currentFlags += "\n" + handoffFlag;
          } else {
              currentFlags = handoffFlag;
          }
          ghostRowObj["Health Flags"] = currentFlags;
          
          const handoffNote = `Project handoff detected on ${mmDd} (${handoffDetail}).`;
          let currentDraft = ghostRowObj["Action Required"] || "";
          if (!currentDraft.includes("handoff detected")) {
              ghostRowObj["Action Required"] = (currentDraft ? currentDraft + "\n" : "") + handoffNote;
          }
      }
      ghostRowObj["Archive_Row"]     = latest.idx + 1;

      // Ensure other fields are synced with Ref Data
      ghostRowObj["Contractor"]         = ref.vendor;
      ghostRowObj["City"]               = ref.city || "-";
      ghostRowObj["Stage"]              = ref.stage || "-";
      ghostRowObj["Status"]             = ref.status || "-";
      ghostRowObj["BSLs"]               = ref.bsls || "-";
      ghostRowObj["Budget OFS"]         = ref.canonicalOfsDate || ref.forecastedOFS || "-";
      
      // 🧠 MULTI-VENDOR DISCOVERY: Include all discovered vendors for Ghost rows
      let discoveredVendors = Array.from(projectVendorMap.get(ghostFdhId) || []);
      ghostRowObj["AllVendors"] = discoveredVendors.join(", ");

      ghostRowObj["CX Start"]           = cxDates.cxStart;
      ghostRowObj["CX Complete"]        = cxDates.cxComplete;
      ghostRowObj["CX Inferred"]        = cxDates.inferredLabel;
      ghostRowObj["Historical Milestones"] = benchmarkDict[ghostFdhId] || "No history logged.";
      
      let xingString = "X-ING UNCHECKED";
      const xingVal = (ref.rawSpecialX || "").toString().trim().toLowerCase();
      if (xingVal === "yes" || xingVal === "true") xingString = "X-ING YES";
      else if (xingVal === "no" || xingVal === "false") xingString = "X-ING CLEAR";
      let hasBeenChecked = ref.adminDate && ref.adminDate !== "";
      let adminDateStr = hasBeenChecked ? `[Chk: ${ref.adminDate}]` : `[Chk: NEVER]`;
      let adminGapsStr = `${adminDateStr}  |  ${ref.hasSOW ? "SOW" : "SOW"}  ${ref.hasCD ? "CD" : "CD"}  ${ref.hasBOM ? "BOM" : "BOM"}  |  ${xingString}`;
      ghostRowObj["QB Context & Gaps"] = adminGapsStr;

      // 🧠 CD INJECTION: Ensure CD Intelligence survives in Ghost rows
      let cdIntelText = "";
      if (xingsDict[ghostFdhId]) {
          let cdData = xingsDict[ghostFdhId];
          if (cdData.summary !== "") cdIntelText = cdData.summary;
          if (cdData.hasFindings) {
              if (ghostRowObj["Health Flags"] !== "No Anomalies" && ghostRowObj["Health Flags"] !== "") {
                  ghostRowObj["Health Flags"] += "\nCD: MAJOR CROSSING RISK";
              } else {
                  ghostRowObj["Health Flags"] = "CD: MAJOR CROSSING RISK";
              }
              if (!diag.flagColors.includes("#b45309")) diag.flagColors.push("#b45309");
          }
      }
      ghostRowObj["CD Intelligence"] = cdIntelText;

      reviewData.push(finalMirrorHeaders.map(h => ghostRowObj[h] !== undefined ? ghostRowObj[h] : ""));
      highlightsData.push({
        rowState:       "ACTIVE",
        adaePaletteIdx: "GHOST",
        colors:         diag.colors,
        summary:        isUpcomingWindowOnly
          ? "Upcoming approved project inside 60-day planning window."
          : (isStartGraceOnly ? "Start-day grace window active. First report due next business day." : `Last Report: ${Utilities.formatDate(reportDate, "GMT-5", "MM/dd/yy")}`),
        gaps:           adminGapsStr,
        flags:          ghostRowObj["Health Flags"],
        flagColors:     (isUpcomingWindowOnly || isStartGraceOnly) ? [TEXT_COLORS.GHOST] : diag.flagColors,
        cleanComment:   ghostRowObj["Vendor Comment"],
        draft:          ghostRowObj["Action Required"],
        benchmark:      benchmarkDict[ghostFdhId] || ""
      });

    } else {
      // TRULY MISSING: No history at all
      finalMirrorHeaders.forEach(h => { ghostRowObj[h] = ""; });
      ghostRowObj["FDH Engineering ID"] = ghostFdhId;
      ghostRowObj["City"]               = ref.city || "-";
      ghostRowObj["Stage"]              = ref.stage || "-";
      ghostRowObj["Status"]             = ref.status || "-";
      ghostRowObj["BSLs"]               = ref.bsls || "-";
      ghostRowObj["Budget OFS"]         = ref.canonicalOfsDate || ref.forecastedOFS || "-";
      ghostRowObj["CX Start"]    = cxDates.cxStart;
      ghostRowObj["CX Complete"] = cxDates.cxComplete;
      ghostRowObj["CX Inferred"] = cxDates.inferredLabel;
      ghostRowObj["Contractor"]         = ref.vendor;
      if (isUpcomingWindowOnly) {
        ghostRowObj["Health Flags"]       = "UPCOMING START WINDOW";
        ghostRowObj["Action Required"]    = "Action: Monitor schedule. Approved project is inside the rolling 60-day horizon and has not started reporting yet.";
        ghostRowObj["Field Production"]   = "No reporting history yet. Upcoming within the 60-day planning window.";
        ghostRowObj["Vendor Comment"]     = "Approved upcoming project inside the 60-day planning window.";
      } else if (isStartGraceOnly) {
        ghostRowObj["Health Flags"]       = "REPORT PENDING";
        ghostRowObj["Action Required"]    = "Action: Monitor start. First daily report is expected on the next business day after CX Start.";
        ghostRowObj["Field Production"]   = "Start-day grace window active. First daily report is not due until the next business day.";
        ghostRowObj["Vendor Comment"]     = "First daily report is due on the next business day after CX Start.";
      } else {
        ghostRowObj["Health Flags"]       = "MISSING DAILY REPORT";
        ghostRowObj["Action Required"]    = `Action: Contact Vendor. Active project with no submission history. Verify if Field CX has started.`;
        ghostRowObj["Field Production"]   = "No daily report history found.";
        ghostRowObj["Vendor Comment"]     = "Missing daily report.";
      }
      ghostRowObj["Historical Milestones"] = benchmarkDict[ghostFdhId] || "No history logged.";
      ghostRowObj["Archive_Row"]        = "";

      // 🧠 CD INJECTION: Ensure CD Intelligence survives in "No History" Ghost rows
      let cdIntelText = "";
      let hasMajorXing = false;
      if (xingsDict[ghostFdhId]) {
          let cdData = xingsDict[ghostFdhId];
          if (cdData.summary !== "") cdIntelText = cdData.summary;
          if (cdData.hasFindings) {
              hasMajorXing = true;
              if (ghostRowObj["Health Flags"] !== "No Anomalies" && ghostRowObj["Health Flags"] !== "") {
                  ghostRowObj["Health Flags"] += "\nCD: MAJOR CROSSING RISK";
              } else {
                  ghostRowObj["Health Flags"] = "CD: MAJOR CROSSING RISK";
              }
          }
      }
      ghostRowObj["CD Intelligence"] = cdIntelText;

      reviewData.push(finalMirrorHeaders.map(h => ghostRowObj[h] !== undefined ? ghostRowObj[h] : ""));
      highlightsData.push({
        rowState:       "ACTIVE",
        adaePaletteIdx: "GHOST",
        colors:         { warn: [], mismatch: [], ug: [], ae: [], fib: [], nap: [] },
        summary:        isUpcomingWindowOnly ? "Upcoming approved project inside 60-day planning window." : "No daily report history found.",
        gaps:           "",
        flags:          ghostRowObj["Health Flags"],
        flagColors:     isUpcomingWindowOnly ? [TEXT_COLORS.GHOST] : (hasMajorXing ? [TEXT_COLORS.WARN, "#b45309"] : [isUpcomingWindowOnly ? TEXT_COLORS.GHOST : TEXT_COLORS.WARN]),
        cleanComment:   ghostRowObj["Vendor Comment"],
        draft:          ghostRowObj["Action Required"],
        benchmark:      benchmarkDict[ghostFdhId] || ""
      });
    }
  });
  markTiming("ghostRowInjectionMs", timerStartMs);

  const totalReviewRows = reviewData.length;
  const ghostOnlyReview = reviewMap.size === 0 && totalReviewRows > 0;
  if (ghostOnlyReview) {
    logMsg("BENNY ENGINE: Submitted review slice was empty; continuing with " + totalReviewRows + " ghost rows only.");
  }

  timerStartMs = Date.now();
  if (mirrorSheet.getLastRow() > 1) mirrorSheet.getRange(2,1,mirrorSheet.getLastRow()-1, mirrorSheet.getMaxColumns()).clearContent().clearDataValidations().setBackground(null).setFontColor(null).setFontWeight(null).setFontStyle("normal");
  markTiming("mirrorClearMs", timerStartMs);
  
  if (totalReviewRows === 0) {
    timerStartMs = Date.now();
    ensureCapacity(mirrorSheet, 2, finalMirrorHeaders.length);
    mirrorSheet.getRange(1, 1, 1, finalMirrorHeaders.length).setValues([finalMirrorHeaders]);
    const archiveRowIdx = finalMirrorHeaders.indexOf("Archive_Row");
    if (archiveRowIdx > -1) {
      try { mirrorSheet.hideColumns(archiveRowIdx + 1); } catch (e) {}
    }
    markTiming("mirrorWriteAndFormatMs", timerStartMs);
    timerStartMs = Date.now();
    buildAndSaveDashboardPayloadV2([], finalMirrorHeaders, [], refDict);
    markTiming("payloadBuildMs", timerStartMs);
    rebuildTimings.totalMs = Date.now() - engineStartMs;
    logMsg("BENNY ENGINE rebuild timings: " + JSON.stringify(rebuildTimings));
    logMsg("BENNY ENGINE: Empty review fast path completed for " + normalizedTargets.length + " target dates.");
  } else if (totalReviewRows > 0) {
    timerStartMs = Date.now();
    ensureCapacity(mirrorSheet, reviewData.length + 1, finalMirrorHeaders.length); 
    mirrorSheet.getRange(1, 1, 1, finalMirrorHeaders.length).setValues([finalMirrorHeaders]);
    mirrorSheet.getRange(2, 1, reviewData.length, finalMirrorHeaders.length).setValues(reviewData);
    markTiming("mirrorWriteMs", timerStartMs);
    rebuildTimings.applyFormattingMs = 0;
    rebuildTimings.styleWidthPassMs = 0;
    rebuildTimings.richTextAndHighlightPassMs = 0;
    timerStartMs = Date.now();
    const archiveRowIdx = finalMirrorHeaders.indexOf("Archive_Row");
    if (archiveRowIdx > -1) {
      try { mirrorSheet.hideColumns(archiveRowIdx + 1); } catch (e) {}
    }
    markTiming("finalSheetPolishMs", timerStartMs);
    logMsg("BENNY ENGINE: Mirror sheet write complete for " + totalReviewRows + " rows. timings=" + JSON.stringify({
      mirrorWriteMs: rebuildTimings.mirrorWriteMs || 0,
      applyFormattingMs: rebuildTimings.applyFormattingMs || 0,
      richTextAndHighlightPassMs: rebuildTimings.richTextAndHighlightPassMs || 0,
      finalSheetPolishMs: rebuildTimings.finalSheetPolishMs || 0
    }));
    
    // 🚀 NEW: Build and Save V2 Decoupled Payload for the Web App
    timerStartMs = Date.now();
    buildAndSaveDashboardPayloadV2(reviewData, finalMirrorHeaders, highlightsData, refDict);
    markTiming("payloadBuildMs", timerStartMs);
    rebuildTimings.totalMs = Date.now() - engineStartMs;
    logMsg("BENNY ENGINE rebuild timings: " + JSON.stringify(rebuildTimings));
    
  } else if (!isSilent) {
    SpreadsheetApp.getUi().alert(`No data found in Master Archive for Date(s): ${targetDates.join(", ")}`);
  }
}

/**
 * 🕵️ SHADOW AUDIT HELPER: Compares legacy results with new ProductionAuditor results.
 * Used during Workstream 28 validation.
 */
function _acShadowAuditCompare(fdhId, legacyNotes, legacyOverrides, auditorVerdict) {
  const legacyFlags = (legacyNotes || []).join(" | ").trim();
  const auditorFlags = (auditorVerdict.flags || []).join(" | ").trim();
  
  // Normalize strings for comparison (spacing/casing)
  const norm = (s) => s.toUpperCase().replace(/\s+/g, " ").trim();

  if (norm(legacyFlags) !== norm(auditorFlags)) {
    logMsg(`⚠️ SHADOW AUDIT DIVERGENCE [${fdhId}]:\n  Legacy: [${legacyFlags}]\n  Auditor: [${auditorFlags}]`);
  }
  
  const legacyKeys = Object.keys(legacyOverrides || {}).sort();
  const auditorKeys = Object.keys(auditorVerdict.adjustments || {}).sort();
  
  if (JSON.stringify(legacyKeys) !== JSON.stringify(auditorKeys)) {
     logMsg(`⚠️ SHADOW ADJUSTMENT DIVERGENCE [${fdhId}]: Adjustment keys mismatch.`);
  } else {
    legacyKeys.forEach(k => {
      if (legacyOverrides[k] !== auditorVerdict.adjustments[k]) {
        logMsg(`⚠️ SHADOW ADJUSTMENT DIVERGENCE [${fdhId}]: Value mismatch for ${k} (${legacyOverrides[k]} vs ${auditorVerdict.adjustments[k]})`);
      }
    });
  }
}

