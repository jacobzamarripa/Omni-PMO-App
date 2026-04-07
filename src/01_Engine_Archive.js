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
     let f = data[i][fdhIdx] ? data[i][fdhIdx].toString().trim().toUpperCase() : "";
     if (!f) continue;
     
     let dStr = "";
     if (d instanceof Date) {
         dStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd");
     } else {
         let tempD = new Date(d);
         if (!isNaN(tempD.getTime())) dStr = Utilities.formatDate(tempD, "GMT-5", "yyyy-MM-dd");
         else dStr = String(d).trim();
     }
     keys.add(dStr + "_" + f);
  }
  return keys;
}

function processIncomingForQuickBase(isSilent = false, isContinuation = false) {
  const startTime = new Date().getTime();
  const props = PropertiesService.getScriptProperties();

  if (!isContinuation) {
    // 🛡️ Lock to prevent overlapping manual runs
    if (props.getProperty("INGESTION_IN_PROGRESS") === "true") {
      if (!isSilent) SpreadsheetApp.getUi().alert("⚠️ Ingestion is already running in the background. Please wait.");
      return;
    }
    props.setProperty("INGESTION_IN_PROGRESS", "true");
    setupSheets();
    logMsg("🚀 STARTING: Folder Ingestion (Auto-Scan)");
  }

  const keys = getExistingKeys(); 
  const refDict = getReferenceDictionary(); 
  let newRowsAppended = []; 
  let allProcessedDates = [];
  let allParsedRowsForQB = [];
  
  // 🔄 Execute scan across both folders (Top-level only for speed and isolation)
  const targetFolders = [REFERENCE_FOLDER_ID, INCOMING_FOLDER_ID];
  let status = { completed: true };
  
  for (let folderId of targetFolders) {
    try {
      let folder = DriveApp.getFolderById(folderId);
      // Pass 'false' for recursive to lock to top-level only
      let res = processFolderRecursive(folder, keys, refDict, "", false, newRowsAppended, allProcessedDates, false, allParsedRowsForQB, startTime, false);
      if (res && res.completed === false) { status.completed = false; break; }
    } catch (e) {
      logMsg(`⚠️ Scan failed for folder ${folderId}: ${e.message}`);
    }
  }
  
  if (status.completed === false) {
    // ⏰ TIMEOUT: Schedule resume
    logMsg(`⌛ TIMEOUT REACHED: Processed partial batch (${newRowsAppended.length} rows). Scheduling resume...`);
    ScriptApp.newTrigger('processIncomingResume')
      .timeBased()
      .after(60000) // 1 minute delay
      .create();
  } else {
    // ✅ COMPLETE
    props.setProperty("INGESTION_IN_PROGRESS", "false");
    populateQuickBaseTabDirectly(allParsedRowsForQB);
    // 🧠 autoArchiveProcessedFiles() is no longer needed here as files move immediately
    logMsg(`✅ INGESTION COMPLETE: Added ${newRowsAppended.length} rows to Archive.`);

    if (!isSilent && !isContinuation) {
      SpreadsheetApp.getUi().alert(`Done scanning.\n\nFiltered duplicates and appended ${newRowsAppended.length} new rows to the Archive.\nQuickBase Upload tab refreshed with ${allParsedRowsForQB.length} row(s).\n\n📁 All processed files have been moved to the Master Archive.`);
    }
  }
}

/**
 * ⚡ Resumption stub called by the time-based trigger
 */
function processIncomingResume() {
  // Clean up the trigger first
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processIncomingResume') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  processIncomingForQuickBase(true, true);
}

function normalizeDateString(value) {
  if (value === "" || value === null || value === undefined) return "";
  
  let strVal = String(value).trim();
  
  // 1. If it's already an exact YYYY-MM-DD string, return it immediately
  // to prevent JavaScript from applying a UTC timezone shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) return strVal;

  // 2. Safely handle native Google Sheets Date objects
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : Utilities.formatDate(value, "GMT-5", "yyyy-MM-dd");
  }

  // 3. Fallback regex for M/D/YY or M-D-YYYY strings
  let match = strVal.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    let yr = match[3].length === 2 ? "20" + match[3] : match[3];
    return `${yr}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  // 4. Last resort Date parsing
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

function processFolderRecursive(folder, existingKeys, refDict, folderDate, isArchive, newRowsAppended = null, allProcessedDates = null, forceReprocess = false, allParsedRowsForQB = null, startTime = null, recursive = true) {
  let resolvedFolderDate = extractDateFromName(folder.getName());
  if (resolvedFolderDate) folderDate = resolvedFolderDate;

  const files = folder.getFiles();
  while (files.hasNext()) {
    // ⏰ Time Budget Check: Exit if over 4.5 minutes (270,000ms) to allow for safe cleanup
    if (startTime && (new Date().getTime() - startTime > 270000)) {
      return { completed: false };
    }

    let file = files.next();
    const mime = file.getMimeType();
    const isExcel = (mime === MimeType.MICROSOFT_EXCEL || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    if (!file.getName().toLowerCase().endsWith(".xlsx") && !isExcel) {
      logMsg(`⏭️ Skipping non-spreadsheet file: ${file.getName()} (MIME: ${mime})`);
      continue;
    }
    if (file.getDescription() === "PROCESSED" && !forceReprocess) {
      // 🧠 SAFETY: If it's already processed but still in the incoming folder, move it now
      if (!isArchive) {
        let fDate = folderDate || extractDateFromName(file.getName()) || deriveFallbackTargetDate(file);
        let targetFolder = getArchiveFolderForDate(fDate);
        file.moveTo(targetFolder);
        logMsg(`📦 Cleaned up "PROCESSED" file that was left in incoming: ${file.getName()}`);
      }
      continue;
    }

    logMsg(`📂 Processing file: ${file.getName()}`);

    let fDate = folderDate || extractDateFromName(file.getName()) || deriveFallbackTargetDate(file);
    if (fDate && allProcessedDates !== null) allProcessedDates.push(fDate);

    try {
        let rows = parseFileToRows(file, existingKeys, refDict, folderDate, newRowsAppended, allProcessedDates, allParsedRowsForQB);
        if (rows && rows.length > 0) {
            const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET);
            const trueLastRow = getTrueLastDataRow(sh);
            ensureCapacity(sh, trueLastRow + rows.length, HISTORY_HEADERS.length);
            sh.getRange(trueLastRow + 1, 1, rows.length, HISTORY_HEADERS.length).setValues(rows);
            SpreadsheetApp.flush(); 
        }

        file.setDescription("PROCESSED");

        // 🚀 IMMEDIATE MOVE: Prevent re-scanning on timeout/resume
        if (!isArchive) {
          let targetFolder = getArchiveFolderForDate(fDate);
          file.moveTo(targetFolder);
          logMsg(`✅ File archived: ${file.getName()}`);
        }
    } catch (e) {
        logMsg(`❌ Failed to process file ${file.getName()}: ${e.message}`);
    }
  }

  if (recursive) {
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      let result = processFolderRecursive(subfolders.next(), existingKeys, refDict, folderDate, isArchive, newRowsAppended, allProcessedDates, forceReprocess, allParsedRowsForQB, startTime, true);
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
function parseFileToRows(file, existingKeys, refDict, folderDate, newRowsAppended, allProcessedDates, allParsedRowsForQB = null) {
  let tempFile = Drive.Files.insert({ title: "[TEMP]_" + file.getName(), parents: [{id: file.getParents().next().getId()}] }, file.getBlob(), {convert: true});
  let tempSS = SpreadsheetApp.openById(tempFile.id);
  let reportTab = tempSS.getSheetByName("Daily Report") || tempSS.getSheets()[0];
  const fullData = reportTab.getDataRange().getValues();
  
  if (fullData.length < 2) { Drive.Files.remove(tempFile.id); return; }
  
  let headerRowIndex = 0, fileHeaders = [], fdhIdx = -1;
  for (let i = 0; i < Math.min(5, fullData.length); i++) {
    let tempHeaders = fullData[i].map(h => h.toString().trim().toLowerCase());
    let foundIdx = tempHeaders.findIndex(h => h.includes("fdh") || h.includes("engineering id"));
    if (foundIdx !== -1) { headerRowIndex = i; fileHeaders = tempHeaders; fdhIdx = foundIdx; break; }
  }
  if (fdhIdx === -1) { Drive.Files.remove(tempFile.id); return; }

  const getIdx = (name) => {
    let n = name.toLowerCase().trim();
    let exact = fileHeaders.indexOf(n);
    if (exact !== -1) return exact;
    if (n === "date") return fileHeaders.findIndex(h => h === "date" || h === "report date" || h === "daily date");
    if (n.includes("ug complete")) return fileHeaders.findIndex(fh => fh.includes("ug") && fh.includes("complete"));
    if (n.includes("strand complete")) return fileHeaders.findIndex(fh => fh.includes("strand") && fh.includes("complete"));
    if (n.includes("fiber complete")) return fileHeaders.findIndex(fh => fh.includes("fiber") && fh.includes("complete"));
    if (n === "vendor comment") return fileHeaders.findIndex(fh => fh.includes("comment") || fh.includes("note"));
    return -1;
  };

  const rows = fullData.slice(headerRowIndex + 1);
  let dataToAppend = [];
  let filenameDate = extractDateFromName(file.getName());
  let targetDate = normalizeDateString(folderDate) || normalizeDateString(filenameDate) || deriveFallbackTargetDate(file);

  rows.forEach(row => {
    let fdhId = row[fdhIdx] ? row[fdhIdx].toString().trim().toUpperCase() : ""; 
    if (!fdhId || fdhId === "NAN" || fdhId === "0" || fdhId.includes("ID")) return;
    
    let originalFdh = fdhId;
    if (refDict && Object.keys(refDict).length > 0 && !refDict[fdhId]) {
        let matched = attemptFuzzyMatch(fdhId, Object.keys(refDict));
        if (matched) { logMsg(`🪄 AUTO-CORRECT (Ingestion): ${fdhId} -> ${matched}`); fdhId = matched; }
    }
    let wasCorrected = (originalFdh !== fdhId);
    let vendorDateIdx = getIdx("Date");
    let vendorDateRaw = vendorDateIdx === -1 ? "" : row[vendorDateIdx];
    let normalizedVendorDate = normalizeDateString(vendorDateRaw);
    if (normalizedVendorDate && normalizedVendorDate !== targetDate) return;
    
    let rowMapped = HISTORY_HEADERS.map(h => {
      if (h === "FDH Engineering ID") return fdhId; 
      let idx = getIdx(h);
      let val = (idx === -1) ? "" : row[idx];
      
      if (h === "Vendor Comment") { if (wasCorrected) val = `[Auto-Fixed FDH: ${originalFdh}] ` + (val || ""); return val; }
      
      if (h === "Date") return targetDate;
      if (isBooleanColumn(h) && typeof val === "string") { let cleanStr = val.trim().toLowerCase(); if (cleanStr === "true" || cleanStr === "yes") return true; if (cleanStr === "false" || cleanStr === "no") return false; }
      return val;
    });
    
    if (allProcessedDates !== null && rowMapped[0]) allProcessedDates.push(rowMapped[0]);
    if (allParsedRowsForQB !== null) allParsedRowsForQB.push(rowMapped);
    
    let key = targetDate + "_" + fdhId;
    if (!existingKeys.has(key)) { 
        dataToAppend.push(rowMapped); 
        existingKeys.add(key); 
        if (newRowsAppended !== null) newRowsAppended.push(rowMapped); 
    }
  });

  Drive.Files.remove(tempFile.id);
  return dataToAppend;
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

// 🧠 UPGRADED TO HANDLE BATCH ARRAYS & STYLE MASTER FORMATTING
function populateQuickBaseTabCore(targetDates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  
  let dateArr = Array.isArray(targetDates) ? targetDates : [targetDates];
  dateArr = dateArr.map(d => d.toString().trim());

  const filteredRows = histSheet.getDataRange().getValues().filter((row, idx) => {
    if (idx === 0) return false; 
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
    const qbData = mapHistoryRowsToQuickBaseRows(filteredRows);
    ensureCapacity(qbSheet, qbData.length + 1, QB_HEADERS.length);
    qbSheet.getRange(2, 1, qbData.length, QB_HEADERS.length).setValues(qbData);
  } else {
    logMsg(`⚠️ populateQuickBaseTab: No data found for dates: ${dateArr.join(", ")}`);
  }

  applyQuickBaseTabStyling(qbSheet);
}

function exportQuickBaseCSVCore(isSilent = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (getTrueLastDataRow(qbSheet) < 2) return;
  const data = qbSheet.getRange(1, 1, getTrueLastDataRow(qbSheet), QB_HEADERS.length).getValues();
  let csvContent = "";
  data.forEach(row => {
    let csvRow = row.map(cell => {
      let cellStr = (cell instanceof Date) ? Utilities.formatDate(cell, "GMT-5", "MM/dd/yyyy") : cell.toString();
      if (typeof cellStr === 'string') cellStr = cellStr.replace(/\[Auto-Fixed FDH: .*?\]\s*/, "");
      return (cellStr.includes(",") || cellStr.includes("\"") || cellStr.includes("\n")) ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
    });
    csvContent += csvRow.join(",") + "\n";
  });
  let rawDate = data[1][0];
  let fileDate = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "GMT-5", "M.d.yy") : String(rawDate).split("T")[0].replace(/-/g, ".");
  let fileName = `Daily_Production_Report_${fileDate}.csv`;
  DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(fileName, csvContent, MimeType.CSV);
  if (!isSilent) SpreadsheetApp.getUi().alert(`✅ CSV Exported: ${fileName}`);
}

function runBennyDiagnostics(row, refDict, vendorDict) {
  let flags = [], drafts = [], summary = [], qbGaps = [], hCols = { warn: [], mismatch: [], ug: [], ae: [], fib: [], nap: [] }, flagColors = [], healedId = null;
  let fdhId = row[HISTORY_HEADERS.indexOf("FDH Engineering ID")] ? row[HISTORY_HEADERS.indexOf("FDH Engineering ID")].toString().toUpperCase().trim() : "";
  let vendorComment = row[HISTORY_HEADERS.indexOf("Vendor Comment")] ? row[HISTORY_HEADERS.indexOf("Vendor Comment")].toString().trim() : "";
  
  let dailyUG = Number(row[HISTORY_HEADERS.indexOf("Daily UG Footage")]) || 0;
  let totalUG = Number(row[HISTORY_HEADERS.indexOf("Total UG Footage Completed")]) || 0;
  let vendorBOMUG = Number(row[HISTORY_HEADERS.indexOf("UG BOM Quantity")]) || 0;
  let drills = Number(row[HISTORY_HEADERS.indexOf("Drills")]) || 0;
  
  let dailyAE = Number(row[HISTORY_HEADERS.indexOf("Daily Strand Footage")]) || 0;
  let totalAE = Number(row[HISTORY_HEADERS.indexOf("Total Strand Footage Complete?")]) || 0;
  let vendorBOMAE = Number(row[HISTORY_HEADERS.indexOf("Strand BOM Quantity")]) || 0;
  let crewsAE = Number(row[HISTORY_HEADERS.indexOf("AE Crews")]) || 0;
  
  let dailyFIB = Number(row[HISTORY_HEADERS.indexOf("Daily Fiber Footage")]) || 0;
  let totalFIB = Number(row[HISTORY_HEADERS.indexOf("Total Fiber Footage Complete")]) || 0;
  let vendorBOMFIB = Number(row[HISTORY_HEADERS.indexOf("Fiber BOM Quantity")]) || 0;
  let crewsFIB = Number(row[HISTORY_HEADERS.indexOf("Fiber Pulling Crews")]) || 0;
  
  let dailyNAP = Number(row[HISTORY_HEADERS.indexOf("Daily NAPs/Encl. Completed")]) || 0;
  let totalNAP = Number(row[HISTORY_HEADERS.indexOf("Total NAPs Completed")]) || 0;
  let vendorBOMNAP = Number(row[HISTORY_HEADERS.indexOf("NAP/Encl. BOM Qty.")]) || 0;
  let crewsNAP = Number(row[HISTORY_HEADERS.indexOf("Splicing Crews")]) || 0;
  
  let lightToCab = row[HISTORY_HEADERS.indexOf("Light to Cabinets")] === true;
  let targetDateRaw = row[HISTORY_HEADERS.indexOf("Target Completion Date")];
  let targetDate = (targetDateRaw instanceof Date) ? targetDateRaw : new Date(targetDateRaw);
  const parseFdhList = (value) => String(value || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const isTruthyTransport = (value) => {
      let normalized = String(value || "").trim().toLowerCase();
      return normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "y";
  };
  const refIsLit = (entry) => {
      if (!entry) return false;
      let refStatus = String(entry.status || "").toLowerCase();
      let refStage = String(entry.stage || "").toLowerCase();
      return refStatus.includes("complete") || refStage.includes("ofs");
  };
  
  let origMatch = vendorComment.match(/\[Auto-Fixed FDH: (.*?)\]/);
  if (origMatch) { flags.push(`🪄 ID AUTO-CORRECTED`); flagColors.push(TEXT_COLORS.MAGIC); drafts.push(`Vendor submitted ${origMatch[1]}, auto-corrected to ${fdhId}.`); vendorComment = vendorComment.replace(/\[Auto-Fixed FDH: .*?\]\s*/, ""); }
  if (!refDict[fdhId]) {
      let softHeal = attemptFuzzyMatch(fdhId, Object.keys(refDict));
      if (softHeal) { fdhId = softHeal; healedId = softHeal; flags.push(`🪄 SOFT MATCH`); flagColors.push(TEXT_COLORS.MAGIC); drafts.push(`Archive has typo. Matched to ${softHeal}.`); }
  }
  let rowState = "ACTIVE", adaePaletteIdx = "CLEAN";
  let refData = refDict[fdhId]; 
  
  if (refData) {
    let status = refData.status.toLowerCase();
    if (status.includes("complete")) rowState = "COMPLETE"; else if (status.includes("on hold")) rowState = "ON_HOLD"; else if (refData.stage.toLowerCase().includes("ofs")) rowState = "OFS"; else if (refData.stage.toLowerCase().includes("permitting")) rowState = "PERMITTING";
    if (rowState !== "COMPLETE" && rowState !== "OFS") { qbGaps.push((refData.hasSOW ? "✅📄 SOW" : "❌📄 SOW")); qbGaps.push((refData.hasCD ? "✅💿 CD" : "❌💿 CD")); qbGaps.push((refData.hasBOM ? "✅📦 BOM" : "❌📦 BOM")); }
    if (refData.isSpecialX) qbGaps.push("⚠️ X-ING");
  }
  
  let vTracker = vendorDict[fdhId];

  const addPhaseSummary = (phaseName, daily, total, bom, trkPct) => {
      let hasDaily = daily > 0;
      let hasTracker = trkPct && trkPct > 0;
      if (hasDaily) {
          let pct = bom > 0 ? (total/bom) : 0;
          let star = pct >= 1 ? " ★" : "";
          summary.push(`${phaseName}: ${daily}' ${drawProgressBar(Math.min(1, pct))} ${Math.round(pct*100)}%${star}`);
      }
      if (hasTracker) {
          let star = trkPct >= 1 ? " ★" : "";
          summary.push(`[Tracker] ${phaseName}: ${drawProgressBar(Math.min(1, trkPct))} ${Math.round(trkPct*100)}%${star}`);
      }
  };
  
  const addNapSummary = (phaseName, daily, total, bom, trkPct) => {
      let hasDaily = daily > 0;
      let hasTracker = trkPct && trkPct > 0;
      if (hasDaily) {
          let pct = bom > 0 ? (total/bom) : 0;
          let star = pct >= 1 ? " ★" : "";
          summary.push(`${phaseName}: ${daily} ${drawProgressBar(Math.min(1, pct))} ${Math.round(pct*100)}%${star}`);
      }
      if (hasTracker) {
          let star = trkPct >= 1 ? " ★" : "";
          summary.push(`[Tracker] ${phaseName}: ${drawProgressBar(Math.min(1, trkPct))} ${Math.round(trkPct*100)}%${star}`);
      }
  };

  if (vTracker) {
     addPhaseSummary("UG", dailyUG, totalUG, vendorBOMUG, vTracker.ugPct);
     addPhaseSummary("AE", dailyAE, totalAE, vendorBOMAE, vTracker.aePct);
     addPhaseSummary("FIB", dailyFIB, totalFIB, vendorBOMFIB, vTracker.fibPct);
     addNapSummary("NAP", dailyNAP, totalNAP, vendorBOMNAP, vTracker.napPct);
  } else {
     addPhaseSummary("UG", dailyUG, totalUG, vendorBOMUG, 0);
     addPhaseSummary("AE", dailyAE, totalAE, vendorBOMAE, 0);
     addPhaseSummary("FIB", dailyFIB, totalFIB, vendorBOMFIB, 0);
     addNapSummary("NAP", dailyNAP, totalNAP, vendorBOMNAP, 0);
  }
  
  let isFormatValid = /^[A-Z]{3}\d{2,3}-F\d{2,4}$/i.test(fdhId);
  if (fdhId !== "" && !isFormatValid) { flags.push(`🖍️ FORMAT ERROR`); flagColors.push(TEXT_COLORS.WARN); hCols.warn.push("FDH Engineering ID"); } else if (fdhId !== "" && !refData) { flags.push(`🛑 NOT IN QB`); flagColors.push(TEXT_COLORS.WARN); hCols.warn.push("FDH Engineering ID"); }
  
  if (targetDate && !isNaN(targetDate.getTime()) && !lightToCab && rowState !== "COMPLETE") { let daysToTarget = Math.ceil((targetDate - new Date()) / (1000 * 60 * 60 * 24)); if (daysToTarget <= 14) { flags.push(`🚨 LIGHTING RISK`); flagColors.push(TEXT_COLORS.WARN); hCols.warn.push("Target Completion Date", "Light to Cabinets"); } }
  if (refData) {
      let howFed = parseFdhList((refData.qbRef && refData.qbRef.howFed) || refData.howFed);
      let whatFeeds = parseFdhList((refData.qbRef && refData.qbRef.whatFeeds) || refData.whatFeeds);
      let isTransportReady = isTruthyTransport((refData.qbRef && refData.qbRef.transport) || refData.transport);
      let isLit = lightToCab || rowState === "COMPLETE" || rowState === "OFS";

      if (howFed.length > 0 && !isTransportReady) {
          let blockingUpstream = howFed.find(upstreamId => !refIsLit(refDict[upstreamId]));
          if (blockingUpstream) {
              flags.push("🚧 BLOCKED BY UPSTREAM");
              flagColors.push(TEXT_COLORS.WARN);
              drafts.push(`Waiting on light from upstream (${blockingUpstream}). Transport is not in place to override.`);
          }
      }

      if (whatFeeds.length > 0 && !isLit) {
          let delayedDownstream = whatFeeds.find(downstreamId => {
              let downstreamRef = refDict[downstreamId];
              let downstreamTransport = isTruthyTransport((downstreamRef && downstreamRef.qbRef && downstreamRef.qbRef.transport) || (downstreamRef && downstreamRef.transport));
              return !downstreamTransport;
          });
          if (delayedDownstream) {
              flags.push("🚨 DELAYING DOWNSTREAM");
              flagColors.push(TEXT_COLORS.WARN);
              drafts.push(`This FDH feeds ${delayedDownstream}, which does not have transport. Prioritize lighting.`);
          }
      }

      if (howFed.length > 0 && isTransportReady && !isLit) {
          flags.push("💡 TRANSPORT OVERRIDE");
          flagColors.push(TEXT_COLORS.MAGIC);
          drafts.push(`Transport is available. This FDH can be lit independently of ${howFed[0]}.`);
      }
  }
  
  if (dailyUG > 0 && drills === 0) { flags.push("🚩 GHOST UG"); flagColors.push(TEXT_COLORS.UG); hCols.ug.push("Daily UG Footage", "Drills"); adaePaletteIdx = "UG"; }
  if (drills > 0 && (dailyUG / drills) > 800) { flags.push(`⚠️ UG PACE ANOMALY`); flagColors.push(TEXT_COLORS.UG); drafts.push(`UG Pace is ${Math.round(dailyUG/drills)}ft/drill.`); hCols.ug.push("Daily UG Footage", "Drills"); adaePaletteIdx = "UG"; }
  if (dailyAE > 0 && crewsAE === 0) { flags.push("🚩 GHOST AE"); flagColors.push(TEXT_COLORS.AE); hCols.ae.push("Daily Strand Footage", "AE Crews"); adaePaletteIdx = "AE"; }
  if (crewsAE > 0 && (dailyAE / crewsAE) > 5000) { flags.push(`⚠️ AE PACE ANOMALY`); flagColors.push(TEXT_COLORS.AE); drafts.push(`AE Pace is ${Math.round(dailyAE/crewsAE)}ft/crew.`); hCols.ae.push("Daily Strand Footage", "AE Crews"); adaePaletteIdx = "AE"; }
  if (dailyFIB > 0 && crewsFIB === 0) { flags.push("🚩 GHOST FIBER"); flagColors.push(TEXT_COLORS.FIB); hCols.fib.push("Daily Fiber Footage", "Fiber Pulling Crews"); adaePaletteIdx = "FIB"; }
  if (crewsFIB > 0 && (dailyFIB / crewsFIB) > 10000) { flags.push(`⚠️ FIBER PACE`); flagColors.push(TEXT_COLORS.FIB); drafts.push(`Fiber Pace is ${Math.round(dailyFIB/crewsFIB)}ft/crew.`); hCols.fib.push("Daily Fiber Footage", "Fiber Pulling Crews"); adaePaletteIdx = "FIB"; }
  if (dailyNAP > 0 && crewsNAP === 0) { flags.push("🚩 GHOST SPLICING"); flagColors.push(TEXT_COLORS.NAP); hCols.nap.push("Daily NAPs/Encl. Completed", "Splicing Crews"); adaePaletteIdx = "NAP"; }
  if (crewsNAP > 0 && (dailyNAP / crewsNAP) > 6) { flags.push(`⚠️ SPLICE PACE`); flagColors.push(TEXT_COLORS.NAP); drafts.push(`Splicing Pace is ${Math.round(dailyNAP/crewsNAP)} NAPs/crew.`); hCols.nap.push("Daily NAPs/Encl. Completed", "Splicing Crews"); adaePaletteIdx = "NAP"; }
  
  if (refData && rowState !== "COMPLETE") {
     const checkPhase = (name, vBom, rBom, vDaily, vTot, bomColName, totColName) => {
         if (rBom === 0 && (vBom > 0 || vDaily > 0 || vTot > 0)) {
             flags.push(`🚧 POSSIBLE REROUTE (${name})`);
             flagColors.push(TEXT_COLORS.MISMATCH);
             drafts.push(`QB shows 0 BOM for ${name}, but vendor reported activity. Verify if a reroute occurred.`);
             hCols.mismatch.push(totColName);
         } else if (rBom > 0 && vBom > 0 && vBom !== rBom) {
             flags.push(`🖍️ BOM DISCREPANCY (${name})`);
             flagColors.push(TEXT_COLORS.MISMATCH);
             hCols.mismatch.push(bomColName);
         }
         
         if (vTot > 0 && rBom > 0 && (vTot / rBom) > OVERAGE_THRESHOLD) {
             flags.push(`🛑 OVERRUN (${name})`);
             flagColors.push(TEXT_COLORS.WARN);
             hCols.warn.push(totColName, bomColName);
         }
     };
     
     // 3-tier BOM check: distinguish missing data entry from actual reroutes
     const _ugBom  = refData.ugBOM  || 0;
     const _aeBom  = refData.aeBOM  || 0;
     const _fibBom = refData.fibBOM || 0;
     const _napBom = refData.napBOM || 0;
     const allBomZero  = _ugBom === 0 && _aeBom === 0 && _fibBom === 0 && _napBom === 0;
     const mainBomZero = _ugBom === 0 && _aeBom === 0;

     if (allBomZero) {
         flags.push("⚠️ PLEASE INPUT BOM");
         flagColors.push(TEXT_COLORS.WARN);
         drafts.push("No BOM quantities found in QB for any phase. Please verify BOM data has been entered for this project.");
     } else if (mainBomZero) {
         flags.push("⚠️ CHECK BOM (UG/AE)");
         flagColors.push(TEXT_COLORS.WARN);
         drafts.push("UG and AE BOM quantities are both 0 in QB. Verify main phase BOM setup before reviewing vendor activity.");
         checkPhase("Fiber", vendorBOMFIB, refData.fibBOM, dailyFIB, totalFIB, "Fiber BOM Quantity", "Total Fiber Footage Complete");
         checkPhase("NAP",   vendorBOMNAP, refData.napBOM, dailyNAP, totalNAP, "NAP/Encl. BOM Qty.", "Total NAPs Completed");
     } else {
         checkPhase("UG",    vendorBOMUG,  refData.ugBOM,  dailyUG,  totalUG,  "UG BOM Quantity",     "Total UG Footage Completed");
         checkPhase("AE",    vendorBOMAE,  refData.aeBOM,  dailyAE,  totalAE,  "Strand BOM Quantity", "Total Strand Footage Complete?");
         checkPhase("Fiber", vendorBOMFIB, refData.fibBOM, dailyFIB, totalFIB, "Fiber BOM Quantity",  "Total Fiber Footage Complete");
         checkPhase("NAP",   vendorBOMNAP, refData.napBOM, dailyNAP, totalNAP, "NAP/Encl. BOM Qty.", "Total NAPs Completed");
     }
  }
  
  if (vTracker && rowState !== "COMPLETE") {
     const evalTrackerPhase = (phaseName, totalColName, bomVal, repTotal, trkPct) => {
        if (!trkPct || trkPct <= 0 || !bomVal || bomVal <= 0) return;
        let repPct = repTotal / bomVal;
        let diff = trkPct - repPct;

        if (diff > 0.05) { 
            flags.push(`💡 TRACKER UPDATE (${phaseName})`);
            flagColors.push(TEXT_COLORS.MAGIC); 
            drafts.push(`Tracker shows ${phaseName} higher at ${Math.round(trkPct*100)}%. Suggested: Update to match their tracker.`);
        } else if (diff < -0.15) { 
            flags.push(`🔍 TRACKER VARIANCE (${phaseName})`);
            flagColors.push(TEXT_COLORS.MISMATCH); 
            drafts.push(`Daily reports ${Math.round(repPct*100)}% ${phaseName}, but Tracker shows ${Math.round(trkPct*100)}%. Check if tracker is lagging.`);
            hCols.mismatch.push(totalColName);
        }
     };

     if (refData) {
         evalTrackerPhase("UG", "Total UG Footage Completed", refData.ugBOM, totalUG, vTracker.ugPct);
         evalTrackerPhase("AE", "Total Strand Footage Complete?", refData.aeBOM, totalAE, vTracker.aePct);
         evalTrackerPhase("FIB", "Total Fiber Footage Complete", refData.fibBOM, totalFIB, vTracker.fibPct);
         evalTrackerPhase("NAP", "Total NAPs Completed", refData.napBOM, totalNAP, vTracker.napPct);
     }
     
     if (vTracker.notes && vTracker.notes !== "") {
         let spacing = vendorComment === "" ? "" : "\n\n";
         vendorComment += spacing + `[Tracker Note]: "${vTracker.notes}"`;
     }
  }
  
  if (summary.length === 0) {
      let linkedStatus = vTracker ? "\n[📡 Tracker Linked]" : "";
      summary.push("No new production reported in the current report." + linkedStatus);
  } else if (vTracker) {
      summary.push("\n[📡 Tracker Linked]");
  }

  if (rowState !== "ACTIVE") { flags.push(`${ROW_THEMES[rowState].label}`); flagColors.push(ROW_THEMES[rowState].text); drafts.push(`QB shows this FDH as ${refData ? refData.status : "Unknown"}.`); }

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
      healedId: healedId, overrides: overrides 
  };
}

function generateDailyReviewCore(targetDateStr, optionalRefDict = null, isSilent = false) {
  CacheService.getScriptCache().remove('dashboard_data_cache');
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  const styleSheet = ss.getSheetByName(STYLE_MASTER);
  let targetDates = Array.isArray(targetDateStr) ? targetDateStr : [targetDateStr];
  
  let refDict = optionalRefDict || getReferenceDictionary();
  let vendorDict = getVendorLiveDictionary(refDict);

  const histData = histSheet.getDataRange().getValues();

  let benchmarkDict = buildBenchmarkDictionary(histData, HISTORY_HEADERS, refDict);

  let currentMirrorHeaders = mirrorSheet.getLastColumn() > 0 ? mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0] : [];
  let defaultHeaders = [...HISTORY_HEADERS, ...REVIEW_EXTRA_HEADERS, ...ANALYTICS_QUADRANT, "Archive_Row"];
  let finalMirrorHeaders = defaultHeaders;
  
  if (currentMirrorHeaders.includes("FDH Engineering ID")) {
    let missingHeaders = defaultHeaders.filter(h => !currentMirrorHeaders.includes(h));
    finalMirrorHeaders = [...currentMirrorHeaders, ...missingHeaders]; 
  }
  
  let reviewData = [], highlightsData = [];
  let submittedFdhs = new Set();

  histData.forEach((row, idx) => {
    if (idx === 0) return; 
    
    // ⚡ PERFORMANCE FIX: Fast native JS date string matching
    let rowDateStr = "";
    let altDateStr = "";
    if (row[0] instanceof Date) {
        let d = row[0];
        let yr = d.getFullYear();
        let mo = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        rowDateStr = `${yr}-${mo}-${day}`;
        altDateStr = `${d.getMonth() + 1}/${d.getDate()}/${yr}`;
    } else {
        rowDateStr = String(row[0]).split("T")[0].trim();
        let parts = rowDateStr.split('-');
        if (parts.length === 3) altDateStr = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
    }
    
    if (targetDates.includes(rowDateStr) || targetDates.includes(altDateStr)) {
      let fdhId = row[HISTORY_HEADERS.indexOf("FDH Engineering ID")].toString().toUpperCase().trim();
      submittedFdhs.add(fdhId);
      let diag = runBennyDiagnostics(row, refDict, vendorDict); 
      
      if (diag.flags.includes("POSSIBLE REROUTE (NAP)")) {
          diag.flags = diag.flags.replace(/POSSIBLE REROUTE \(NAP\)/g, "SCOPE DEVIATION (NAP)");
          diag.draft = diag.draft.replace(/QB shows 0 BOM for NAP, but vendor reported activity\. Verify if a reroute occurred\./g, "Vendor reported Splicing activity, but BOM shows 0 NAPs. Verify if scope was expanded.");
      }
      
      if (diag.flags.includes("NOT IN QB")) {
          diag.flags = diag.flags.replace(/NOT IN QB/g, "NOT IN QB REFERENCE");
          diag.draft = diag.draft.replace(/Not found in QuickBase/g, "Not found in QuickBase Reference Data");
      }

      if (benchmarkDict[fdhId] && benchmarkDict[fdhId].includes("Possible Reroute")) {
          benchmarkDict[fdhId] = benchmarkDict[fdhId].replace(/NAP: Pending \[Possible Reroute\]/g, "NAP: Pending [Scope Deviation]");
      }

      let cdIntelText = "";

      let refData = null;

      if (diag.healedId) { fdhId = diag.healedId; refData = refDict[fdhId]; }
      else refData = refDict[fdhId];
      
      let rowObj = {};
      HISTORY_HEADERS.forEach((h, i) => {
        if (h === "Vendor Comment") rowObj[h] = diag.cleanComment;
        else if (h === "FDH Engineering ID") rowObj[h] = fdhId;
        else if (diag.overrides && diag.overrides[h]) rowObj[h] = diag.overrides[h];
        else rowObj[h] = row[i];
      });
      
      rowObj["City"] = refData ? refData.city : "-"; 
      rowObj["Stage"] = refData ? refData.stage : "-"; 
      rowObj["Status"] = refData ? refData.status : "-"; 
      rowObj["BSLs"] = refData ? refData.bsls : "-";
      rowObj["Budget OFS"] = refData ? (refData.canonicalOfsDate || refData.forecastedOFS) : "-";
      rowObj["CX Start"] = refData && refData.cxStart ? refData.cxStart : "";
      rowObj["CX Complete"] = refData && refData.cxComplete ? refData.cxComplete : "";
      rowObj["CD Intelligence"] = cdIntelText; 
      rowObj["Gemini Insight"] = refData ? refData.geminiInsight : "";
      rowObj["Gemini Insight Date"] = refData ? refData.geminiDate : "";

      const parseNum = (val) => {
          if (val === null || val === undefined || val === "") return 0;
          if (typeof val === 'number') return val;
          let match = String(val).split('(')[0].replace(/,/g, '').trim().match(/-?\d+(\.\d+)?/);
          return match ? Number(match[0]) : 0;
      };
      
      let locIdx = HISTORY_HEADERS.indexOf("Locates Called In");
      let hasLocates = locIdx > -1 && ["true", "yes", "1"].includes(String(row[locIdx]).toLowerCase().trim());
      let dUG = parseNum(row[HISTORY_HEADERS.indexOf("Daily UG Footage")]);
      let dAE = parseNum(row[HISTORY_HEADERS.indexOf("Daily Strand Footage")]);
      let dFIB = parseNum(row[HISTORY_HEADERS.indexOf("Daily Fiber Footage")]);
      let dNAP = parseNum(row[HISTORY_HEADERS.indexOf("Daily NAPs/Encl. Completed")]);
      let hasActivity = hasLocates || dUG > 0 || dAE > 0 || dFIB > 0 || dNAP > 0;

      let adminGapsStr = diag.gaps; 
      if (refData) {
          let xingVal = (refData.rawSpecialX || "").toString().trim().toLowerCase();
          let xingString = "🚨 X-ING UNCHECKED"; 
          if (xingVal === "yes" || xingVal === "true") xingString = "⚠️ X-ING YES";
          else if (xingVal === "no" || xingVal === "false") xingString = "✅ X-ING CLEAR";
          
          let hasBeenChecked = refData.adminDate && refData.adminDate !== "";
          
          if (xingVal === "" && !hasBeenChecked) {
              if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n🚩 ADMIN: CHECK CROSSINGS";
              else diag.flags = "🚩 ADMIN: CHECK CROSSINGS";
              diag.flagColors.push("#991b1b"); 
          }

          let adminDateStr = hasBeenChecked ? `[Chk: ${refData.adminDate}]` : `[Chk: NEVER]`;
          adminGapsStr = `${adminDateStr}  |  ${refData.hasSOW ? "✅ SOW" : "❌ SOW"}  ${refData.hasCD ? "✅ CD" : "❌ CD"}  ${refData.hasBOM ? "✅ BOM" : "❌ BOM"}  |  ${xingString}`;
          
          let stageStr = (refData.stage || "").toUpperCase().trim();
          let statusStr = (refData.status || "").toUpperCase().trim();
          let isFieldCx = stageStr.includes("FIELD CX");

          if (stageStr === "" || stageStr === "-" || statusStr === "" || statusStr === "-") {
              if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n🚩 MISSING QB STATUS";
              else diag.flags = "🚩 MISSING QB STATUS";
              diag.flagColors.push("#991b1b"); 
              diag.draft = `Project is missing Stage or Status in QB. Please update QuickBase.`;
          } 
          else if (hasActivity && !isFieldCx) {
              let todayStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy");
              let hasSyncedToday = refData.statusSyncDate === todayStr;

              if (hasSyncedToday) {
                  if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n⚠️ ADMIN: REFRESH REF DATA";
                  else diag.flags = "⚠️ ADMIN: REFRESH REF DATA";
                  diag.flagColors.push("#b45309"); 
                  diag.draft = `QB marked as updated on ${todayStr}. Import new Reference Data to clear this flag.`;
              } else {
                  if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n🚩 STATUS MISMATCH";
                  else diag.flags = "🚩 STATUS MISMATCH";
                  diag.flagColors.push("#991b1b"); 
                  diag.draft = `Vendor reported activity, but QB shows ${refData.stage} | ${refData.status}. Please update QB to Field CX | In Progress.`;
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
      reviewData.push(mappedRow);
      highlightsData.push({ rowState: diag.rowState, adaePaletteIdx: diag.adaePaletteIdx, colors: diag.colors, summary: diag.summary, gaps: adminGapsStr, flags: diag.flags, flagColors: diag.flagColors, cleanComment: diag.cleanComment, draft: diag.draft, benchmark: benchmarkDict[fdhId] || ""}); 
    }
  });

  // GHOST ROW INJECTION — Active projects with no submission today
  const GHOST_ACTIVE_STAGES = ["FIELD CX", "PERMITTING", "CONSTRUCTION", "ACTIVE"];
  Object.keys(refDict).forEach(ghostFdhId => {
    if (submittedFdhs.has(ghostFdhId)) return;
    const ref = refDict[ghostFdhId];
    if (!ref.vendor) return;
    const stageUp = (ref.stage || "").toUpperCase();
    const statUp  = (ref.status || "").toUpperCase();
    if (stageUp.includes("PERMITTING") && !statUp.includes("APPROVED")) return;
    if (statUp.includes("COMPLETE") || statUp.includes("ON HOLD")) return;
    if (!GHOST_ACTIVE_STAGES.some(s => stageUp.includes(s))) return;

    let ghostRowObj = {};
    finalMirrorHeaders.forEach(h => { ghostRowObj[h] = ""; });
    ghostRowObj["FDH Engineering ID"] = ghostFdhId;
    ghostRowObj["City"]               = ref.city || "-";
    ghostRowObj["Stage"]              = ref.stage || "-";
    ghostRowObj["Status"]             = ref.status || "-";
    ghostRowObj["BSLs"]               = ref.bsls || "-";
    ghostRowObj["Budget OFS"]         = ref.canonicalOfsDate || ref.forecastedOFS || "-";
    ghostRowObj["Contractor"]         = ref.vendor;
    ghostRowObj["Health Flags"]       = "MISSING DAILY REPORT";
    ghostRowObj["Action Required"]    = `Vendor (${ref.vendor}) did not submit a daily report.`;
    ghostRowObj["Field Production"]   = "No daily report submitted today.";
    ghostRowObj["Vendor Comment"]     = "Missing daily report.";
    ghostRowObj["Historical Milestones"] = benchmarkDict[ghostFdhId] || "No history logged.";
    ghostRowObj["Archive_Row"]        = "";

    reviewData.push(finalMirrorHeaders.map(h => ghostRowObj[h] !== undefined ? ghostRowObj[h] : ""));
    highlightsData.push({
      rowState:       "ACTIVE",
      adaePaletteIdx: "GHOST",
      colors:         { warn: [], mismatch: [], ug: [], ae: [], fib: [], nap: [] },
      summary:        "No daily report submitted today.",
      gaps:           "",
      flags:          "MISSING DAILY REPORT",
      flagColors:     [TEXT_COLORS.GHOST],
      cleanComment:   "Missing daily report.",
      draft:          `Vendor (${ref.vendor}) did not submit a daily report.`,
      benchmark:      benchmarkDict[ghostFdhId] || ""
    });
  });

  if (mirrorSheet.getLastRow() > 1) mirrorSheet.getRange(2,1,mirrorSheet.getLastRow()-1, mirrorSheet.getMaxColumns()).clearContent().clearDataValidations().setBackground(null).setFontColor(null).setFontWeight(null).setFontStyle("normal");
  
  if (reviewData.length > 0) {
    ensureCapacity(mirrorSheet, reviewData.length + 1, finalMirrorHeaders.length); 
    mirrorSheet.getRange(1, 1, 1, finalMirrorHeaders.length).setValues([finalMirrorHeaders]);
    mirrorSheet.getRange(2, 1, reviewData.length, finalMirrorHeaders.length).setValues(reviewData);
    applyFormatting(mirrorSheet); 
    
    if (styleSheet) {
      let styleHeaders = styleSheet.getRange(1, 1, 1, styleSheet.getLastColumn()).getValues()[0];
      finalMirrorHeaders.forEach((h, i) => {
         let lookupH = h === "Field Production" ? "Construction Summary" : h;
         let styleIdx = styleHeaders.indexOf(lookupH);
         if (styleIdx > -1) mirrorSheet.setColumnWidth(i + 1, styleSheet.getColumnWidth(styleIdx + 1));
      });
    }
    
    let flagsIdx = finalMirrorHeaders.indexOf("Health Flags") + 1;
    let draftIdx = finalMirrorHeaders.indexOf("Action Required") + 1;
    let summaryIdx = finalMirrorHeaders.indexOf("Field Production") + 1;
    let gapsIdx = finalMirrorHeaders.indexOf("QB Context & Gaps") + 1;
    let vCommentIdx = finalMirrorHeaders.indexOf("Vendor Comment") + 1;
    let fdhIdx = finalMirrorHeaders.indexOf("FDH Engineering ID") + 1;
    let benchIdx = finalMirrorHeaders.indexOf("Historical Milestones") + 1; 

    // ⚡ PERFORMANCE FIX: 2D Array Batching for Formatting
    let numRows = highlightsData.length;
    let numCols = finalMirrorHeaders.length;
    
    let bgGrid = Array(numRows).fill().map(() => Array(numCols).fill(null));
    let colorGrid = Array(numRows).fill().map(() => Array(numCols).fill(null));
    let weightGrid = Array(numRows).fill().map(() => Array(numCols).fill("normal"));
    let styleGrid = Array(numRows).fill().map(() => Array(numCols).fill("normal"));
    
    highlightsData.forEach((hData, rIdx) => {
      let rowNum = rIdx + 2;

      // 1. BASE ROW FORMATTING
      if (hData.rowState !== "ACTIVE") {
        let rTheme = ROW_THEMES[hData.rowState];
        for (let c = 0; c < numCols; c++) {
            bgGrid[rIdx][c] = rTheme.bg;
            colorGrid[rIdx][c] = rTheme.text;
        }
        if (hData.rowState === "COMPLETE" && flagsIdx > 0) {
            styleGrid[rIdx][flagsIdx - 1] = "italic";
        }
      } else {
        let pillTheme = BENNY_COLORS[hData.adaePaletteIdx];
        if (hData.adaePaletteIdx !== "CLEAN") {
            if (flagsIdx > 0) { bgGrid[rIdx][flagsIdx - 1] = pillTheme.bg; colorGrid[rIdx][flagsIdx - 1] = pillTheme.text; weightGrid[rIdx][flagsIdx - 1] = "bold"; }
            if (draftIdx > 0) { bgGrid[rIdx][draftIdx - 1] = pillTheme.bg; colorGrid[rIdx][draftIdx - 1] = pillTheme.text; weightGrid[rIdx][draftIdx - 1] = "bold"; }
        } else {
            if (flagsIdx > 0) { colorGrid[rIdx][flagsIdx - 1] = BENNY_COLORS.CLEAN.text; weightGrid[rIdx][flagsIdx - 1] = "bold"; }
            if (draftIdx > 0) { colorGrid[rIdx][draftIdx - 1] = ROW_THEMES.ACTIVE.text; }
        }
        
        // Apply Red/Yellow override colors to specific warning columns
        const applyColor = (colsArray, paletteColor) => {
            colsArray.forEach(colName => {
                let cIdx = finalMirrorHeaders.indexOf(colName);
                if (cIdx > -1) {
                    bgGrid[rIdx][cIdx] = paletteColor.bg;
                    colorGrid[rIdx][cIdx] = paletteColor.text;
                    weightGrid[rIdx][cIdx] = "bold";
                }
            });
        };
        applyColor(hData.colors.warn, BENNY_COLORS.RED); 
        applyColor(hData.colors.mismatch, BENNY_COLORS.YELLOW); 
        applyColor(hData.colors.ug, BENNY_COLORS.UG); 
        applyColor(hData.colors.ae, BENNY_COLORS.AE); 
        applyColor(hData.colors.fib, BENNY_COLORS.FIB); 
        applyColor(hData.colors.nap, BENNY_COLORS.NAP);
      }

      if (fdhIdx > 0) weightGrid[rIdx][fdhIdx - 1] = "bold";
      
      // 2. SPECIFIC CELL FORMATTING FIX (Cognitive Load Fix)
      if (summaryIdx > 0) {
          if (hData.summary.includes("No new production")) {
              colorGrid[rIdx][summaryIdx - 1] = "#a78bfa";
          } else {
              if (hData.rowState === "ACTIVE") bgGrid[rIdx][summaryIdx - 1] = "#faf5ff";
              colorGrid[rIdx][summaryIdx - 1] = "#000000";
              weightGrid[rIdx][summaryIdx - 1] = "bold";
          }
      }
      
      if (vCommentIdx > 0 && hData.cleanComment !== "") {
          if (hData.rowState === "ACTIVE") bgGrid[rIdx][vCommentIdx - 1] = "#fef3c7";
          colorGrid[rIdx][vCommentIdx - 1] = "#854d0e";
          weightGrid[rIdx][vCommentIdx - 1] = "bold";
      }
      
      if (benchIdx > 0 && hData.benchmark !== "") {
          if (hData.rowState === "ACTIVE") bgGrid[rIdx][benchIdx - 1] = "#f8fafc";
          colorGrid[rIdx][benchIdx - 1] = "#334155";
      }

      if (gapsIdx > 0 && hData.gaps !== "-") {
          colorGrid[rIdx][gapsIdx - 1] = "#475569";
          weightGrid[rIdx][gapsIdx - 1] = "bold";
      }

      // 3. RICH TEXT APPLICATION (Kept per-cell as it involves string offsets)
      if (flagsIdx > 0 && hData.flags !== "✅ No Anomalies" && hData.flags !== "") {
           let richText = SpreadsheetApp.newRichTextValue().setText(hData.flags);
           let parts = hData.flags.split("\n"), start = 0;
           parts.forEach((p, i) => {
             if (hData.flagColors[i]) { let style = SpreadsheetApp.newTextStyle().setForegroundColor(hData.flagColors[i]).setBold(true).build(); richText.setTextStyle(start, start + p.length, style); }
             start += p.length + 1; 
           });
           mirrorSheet.getRange(rowNum, flagsIdx).setRichTextValue(richText.build());
      }
      
      if (draftIdx > 0 && hData.draft !== "") { 
          let richText = SpreadsheetApp.newRichTextValue().setText(hData.draft); 
          colorizeText(richText, hData.draft, "UG", TEXT_COLORS.UG); 
          colorizeText(richText, hData.draft, "Strand", TEXT_COLORS.AE); 
          colorizeText(richText, hData.draft, "Fiber", TEXT_COLORS.FIB); 
          colorizeText(richText, hData.draft, "NAP", TEXT_COLORS.NAP); 
          colorizeText(richText, hData.draft, "\\[CD Intelligence\\]:", "#6b21a8"); 
          mirrorSheet.getRange(rowNum, draftIdx).setRichTextValue(richText.build()); 
      }
      
      if(summaryIdx > 0 && !hData.summary.includes("No new production")) {
          let richText = SpreadsheetApp.newRichTextValue().setText(hData.summary);
          const styleAfter = (rt, fullText, prefix, defaultColor) => {
              let idx = 0;
              fullText.split('\n').forEach(line => {
                  let isComplete = line.includes("★");
                  let activeColor = isComplete ? TEXT_COLORS.DONE : defaultColor;
                  if (line.startsWith(prefix)) {
                      let style = SpreadsheetApp.newTextStyle().setForegroundColor(activeColor).setBold(true).build();
                      rt.setTextStyle(idx + prefix.length, idx + line.length, style);
                  } else if (line.startsWith("[Tracker] " + prefix)) {
                      let tPrefix = "[Tracker] " + prefix;
                      let style = SpreadsheetApp.newTextStyle().setForegroundColor(activeColor).setBold(true).build();
                      rt.setTextStyle(idx + tPrefix.length, idx + line.length, style);
                      let trkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#0284c7").setBold(true).build();
                      rt.setTextStyle(idx, idx + "[Tracker]".length, trkStyle);
                  }
                  idx += line.length + 1;
              });
          };
          styleAfter(richText, hData.summary, "UG: ", TEXT_COLORS.UG);
          styleAfter(richText, hData.summary, "AE: ", TEXT_COLORS.AE);
          styleAfter(richText, hData.summary, "FIB: ", TEXT_COLORS.FIB);
          styleAfter(richText, hData.summary, "NAP: ", TEXT_COLORS.NAP);
          colorizeText(richText, hData.summary, "★", TEXT_COLORS.STAR);

          let linkIdx = hData.summary.indexOf("[📡 Tracker Linked]");
          if (linkIdx > -1) {
              let linkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#64748b").setBold(false).build();
              richText.setTextStyle(linkIdx, linkIdx + "[📡 Tracker Linked]".length, linkStyle);
          }
          mirrorSheet.getRange(rowNum, summaryIdx).setRichTextValue(richText.build());
      }
      
      if(vCommentIdx > 0 && hData.cleanComment !== "") {
          let richText = SpreadsheetApp.newRichTextValue().setText(hData.cleanComment); 
          colorizeText(richText, hData.cleanComment, "UG", TEXT_COLORS.UG); 
          colorizeText(richText, hData.cleanComment, "Strand", TEXT_COLORS.AE); 
          colorizeText(richText, hData.cleanComment, "Fiber", TEXT_COLORS.FIB); 
          let trkNoteIdx = hData.cleanComment.indexOf("[Tracker Note]:");
          if (trkNoteIdx > -1) {
              let trkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#0284c7").setBold(true).build();
              richText.setTextStyle(trkNoteIdx, trkNoteIdx + "[Tracker Note]:".length, trkStyle);
          }
          mirrorSheet.getRange(rowNum, vCommentIdx).setRichTextValue(richText.build());
      }
      
      if(benchIdx > 0 && hData.benchmark !== "") {
          let benchStr = hData.benchmark.replace(/\(100\%\)/g, "(100%) ★");
          let richText = SpreadsheetApp.newRichTextValue().setText(benchStr);
          
          const styleBenchLine = (rt, fullText, prefix, defaultColor) => {
              let idx = 0;
              fullText.split('\n').forEach(line => {
                  if (line.startsWith(prefix)) {
                      let isComplete = line.includes("(100%)");
                      let isPending = line.includes("Pending");
                      let isReroute = line.includes("[Possible Reroute]") || line.includes("[Scope Deviation]");
                      let activeColor = isComplete ? TEXT_COLORS.DONE : 
                                        isReroute ? TEXT_COLORS.MISMATCH : 
                                        isPending ? "#94a3b8" : defaultColor;
                      let style = SpreadsheetApp.newTextStyle().setForegroundColor(activeColor).setBold(!isPending).build();
                      rt.setTextStyle(idx + prefix.length, idx + line.length, style);
                      let prefixStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#000000").setBold(true).build();
                      rt.setTextStyle(idx, idx + prefix.length, prefixStyle);
                  }
                  idx += line.length + 1;
              });
          };
          styleBenchLine(richText, benchStr, "UG: ", TEXT_COLORS.UG);
          styleBenchLine(richText, benchStr, "AE: ", TEXT_COLORS.AE);
          styleBenchLine(richText, benchStr, "FIB: ", TEXT_COLORS.FIB);
          styleBenchLine(richText, benchStr, "NAP: ", TEXT_COLORS.NAP);
          colorizeText(richText, benchStr, "★", TEXT_COLORS.STAR);

          let labelStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#000000").setBold(true).build();
          let locIdx = benchStr.indexOf("Loc:");
          if (locIdx > -1) richText.setTextStyle(locIdx, locIdx + 4, labelStyle);
          let cabIdx = benchStr.indexOf("Cab:");
          if (cabIdx > -1) richText.setTextStyle(cabIdx, cabIdx + 4, labelStyle);
          let litIdx = benchStr.indexOf("Lit:");
          if (litIdx > -1) richText.setTextStyle(litIdx, litIdx + 4, labelStyle);
          
          mirrorSheet.getRange(rowNum, benchIdx).setRichTextValue(richText.build());
      }
      
      if(gapsIdx > 0 && hData.gaps !== "-") {
          let gRich = SpreadsheetApp.newRichTextValue().setText(hData.gaps);
          let dangerStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#991b1b").setBold(true).build();
          let warnStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#b45309").setBold(true).build();
          let alertIdx = hData.gaps.indexOf("🚨");
          if(alertIdx > -1) gRich.setTextStyle(alertIdx, hData.gaps.length, dangerStyle);
          let warnIdx = hData.gaps.indexOf("⚠️");
          if(warnIdx > -1) gRich.setTextStyle(warnIdx, hData.gaps.length, warnStyle);
          mirrorSheet.getRange(rowNum, gapsIdx).setRichTextValue(gRich.build());
      }
    });
    
    // ⚡ BATCH WRITE FORMATTING GRIDS (Massive Speedup)
    let updateRange = mirrorSheet.getRange(2, 1, numRows, numCols);
    updateRange.setBackgrounds(bgGrid);
    updateRange.setFontColors(colorGrid);
    updateRange.setFontWeights(weightGrid);
    updateRange.setFontStyles(styleGrid);
    
    mirrorSheet.hideColumns(finalMirrorHeaders.indexOf("Archive_Row") + 1);
    try { mirrorSheet.getRange(1, 1, 1, mirrorSheet.getMaxColumns()).shiftColumnGroupDepth(-10); } catch(e){} 
    let startGroupCol = finalMirrorHeaders.indexOf("Locates Called In") + 1;
    let endGroupCol = finalMirrorHeaders.indexOf("Splicing Crews") + 1;
    if (startGroupCol > 0 && endGroupCol >= startGroupCol) { try { mirrorSheet.getRange(1, startGroupCol, 1, endGroupCol - startGroupCol + 1).shiftColumnGroupDepth(1); mirrorSheet.collapseAllColumnGroups(); } catch(e) {} }
    
  } else if (!isSilent) {
    SpreadsheetApp.getUi().alert(`No data found in Master Archive for Date(s): ${targetDates.join(", ")}`);
  }
}
