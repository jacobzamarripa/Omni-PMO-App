/**
 * FILE: 02_Utilities.gs
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🚀 Production Hub')
      .addItem('▶️ 1a. Process Incoming (Auto-Scan & QB)', 'processIncomingForQuickBase')
      .addItem('▶️ 1b. Load Specific Date to QB Tab', 'promptLoadSpecificDateToQB')
      .addItem('📥 2. Export QuickBase CSV', 'promptExportQuickBaseCSV')
      .addSeparator()
      .addItem('🧠 3a. Generate Daily Review (Benny Diagnostics)', 'promptGenerateDailyReview')
      .addItem('🔄 3b. Sync Corrections to Archive & QB', 'commitReviewToArchiveAndQB')
      .addSeparator()
      .addItem('📊 4a. Export Director Review (.xlsx)', 'exportDirectorReviewXLSX')
      .addItem('📤 4b. Export Vendor Corrections (.xlsx)', 'exportVendorCorrectionsXLSX')
      .addSeparator()
      .addItem('🗄️ 5. Pull Weekly Reference Data (CSV)', 'importReferenceData')
      .addSeparator()
      .addItem('⏰ Enable Daily Automations', 'setupDailyTrigger')
      .addSeparator()
      .addItem('📁 Update Master Archive (Historical)', 'importArchiveFolder')
      .addItem('🎨 Force Sync Styles & Checkboxes', 'applyFormatting')
      .addItem('🔄 Reset "Processed" Tags', 'resetFileTags')
      .addSeparator()
      .addItem('🛠️ FIX: Remove Duplicates from Archive', 'removeDuplicatesFromArchive')
      .addToUi();
  } catch (e) {}
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('WebApp')
      .setTitle('Daily Production Hub') // 🧠 Changed browser tab title here
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function logFrontendError(errorMsg) {
  logMsg("💻 WEB APP CRASH: " + errorMsg);
}

function commitBatchReviewsToLog(reviewsArray) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(REVIEW_LOG_SHEET);
  
  if (!logSheet) {
    logSheet = ss.insertSheet(REVIEW_LOG_SHEET);
    logSheet.appendRow(["Timestamp", "FDH", "Vendor", "System Flags", "Manager Comment"]);
    logSheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
    logSheet.setFrozenRows(1);
    logSheet.setColumnWidth(4, 300);
    logSheet.setColumnWidth(5, 400);
  }
  
  if (!reviewsArray || reviewsArray.length === 0) return false;

  let rowsToAppend = [];
  let now = new Date();
  
  reviewsArray.forEach(rev => {
     rowsToAppend.push([now, rev.fdh, rev.vendor, rev.flags.replace(/\n/g, ", "), rev.comment]);
  });
  
  logSheet.getRange(logSheet.getLastRow() + 1, 1, rowsToAppend.length, 5).setValues(rowsToAppend);
  return true;
}

function exportInboxReviewsCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(REVIEW_LOG_SHEET);
  if (!logSheet || logSheet.getLastRow() < 2) return "No reviews found to export.";

  const data = logSheet.getDataRange().getValues();
  let csvContent = "";
  data.forEach(row => {
    let csvRow = row.map(cell => {
      let cellStr = (cell instanceof Date) ? Utilities.formatDate(cell, "GMT-5", "MM/dd/yyyy HH:mm") : cell.toString();
      return `"${cellStr.replace(/"/g, '""')}"`; 
    });
    csvContent += csvRow.join(",") + "\n";
  });

  let fileDate = Utilities.formatDate(new Date(), "GMT-5", "MM.dd.yy");
  let fileName = `Manager_Notes_Export_${fileDate}.csv`;
  let file = DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(fileName, csvContent, MimeType.CSV);
  
  if(logSheet.getMaxRows() > 2) logSheet.deleteRows(2, logSheet.getLastRow() - 1);
  return file.getUrl();
}

function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  if (!mirrorSheet || mirrorSheet.getLastRow() < 2) return { actionItems: [], totalRows: 0, headers: [] };

  const data = mirrorSheet.getDataRange().getValues();
  const headers = data[0];
  
  const getIdx = name => headers.indexOf(name);
  const fdhIdx = getIdx("FDH Engineering ID"), flagsIdx = getIdx("Health Flags"), draftIdx = getIdx("Action Required");
  const vendorIdx = getIdx("Contractor"), statusIdx = getIdx("Status"), cityIdx = getIdx("City"), stageIdx = getIdx("Stage");
  const ofsIdx = getIdx("Forecasted OFS"), benchIdx = getIdx("Historical Milestones"), dateIdx = getIdx("Date");
  const targetIdx = getIdx("Target Completion Date"), cxStartIdx = getIdx("CX Start"), cxEndIdx = getIdx("CX Complete");
  const xingIdx = getIdx("QB Context & Gaps"), bslsIdx = getIdx("BSLs"), lightIdx = getIdx("Light to Cabinets");
  const cdIntelIdx = getIdx("CD Intelligence");

  // 🧠 Grab Vendor Comment
  const vcIdx1 = getIdx("Vendor Comment");
  const vcIdx2 = getIdx("Construction Comments");
  const vcIdx = vcIdx1 > -1 ? vcIdx1 : vcIdx2;

  const ugTotIdx = getIdx("Total UG Footage Completed"), ugBomIdx = getIdx("UG BOM Quantity"), ugDailyIdx = getIdx("Daily UG Footage");
  const aeTotIdx = getIdx("Total Strand Footage Complete?"), aeBomIdx = getIdx("Strand BOM Quantity"), aeDailyIdx = getIdx("Daily Strand Footage");
  const fibTotIdx = getIdx("Total Fiber Footage Complete"), fibBomIdx = getIdx("Fiber BOM Quantity"), fibDailyIdx = getIdx("Daily Fiber Footage");
  const napTotIdx = getIdx("Total NAPs Completed"), napBomIdx = getIdx("NAP/Encl. BOM Qty."), napDailyIdx = getIdx("Daily NAPs/Encl. Completed");

  const parseNum = (val) => {
      if (val === null || val === undefined || val === "") return 0;
      if (typeof val === 'number') return val;
      let cleanStr = String(val).split('(')[0].replace(/,/g, '').trim();
      let match = cleanStr.match(/-?\d+(\.\d+)?/);
      return match ? Number(match[0]) : 0;
  };

  let actionItems = [];
  
  for (let i = 1; i < data.length; i++) {
     let flags = data[i][flagsIdx] || "";
     let stageStr = stageIdx > -1 ? String(data[i][stageIdx]).toUpperCase() : "";
     let statStr = statusIdx > -1 ? String(data[i][statusIdx]).toUpperCase() : "";
     
     if (flags !== "" && !flags.includes("✅ No Anomalies") && !flags.includes("COMPLETE") && !stageStr.includes("OFS") && !statStr.includes("OPEN FOR SALE")) {
         const parseDate = (val) => val ? ((val instanceof Date) ? Utilities.formatDate(val, "GMT-5", "MM-dd-yyyy") : String(val).split('T')[0]) : "";
         let safeRawRow = data[i].map(cell => (cell instanceof Date) ? Utilities.formatDate(cell, "GMT-5", "MM/dd/yy") : cell);

         actionItems.push({
             fdh: fdhIdx > -1 ? data[i][fdhIdx] : "", vendor: vendorIdx > -1 ? data[i][vendorIdx] : "", city: cityIdx > -1 ? data[i][cityIdx] : "",
             stage: stageIdx > -1 ? data[i][stageIdx] : "", status: statusIdx > -1 ? data[i][statusIdx] : "", bsls: bslsIdx > -1 ? data[i][bslsIdx] : "-",
             isLight: lightIdx > -1 ? (data[i][lightIdx] === true || String(data[i][lightIdx]).toLowerCase() === 'true') : false,
             ofsDate: parseDate(ofsIdx > -1 ? data[i][ofsIdx] : ""), reportDate: parseDate(dateIdx > -1 ? data[i][dateIdx] : ""), targetDate: parseDate(targetIdx > -1 ? data[i][targetIdx] : ""),
             cxStart: parseDate(cxStartIdx > -1 ? data[i][cxStartIdx] : ""), cxEnd: parseDate(cxEndIdx > -1 ? data[i][cxEndIdx] : ""),
             isXing: xingIdx > -1 && String(data[i][xingIdx]).includes("X-ING YES"), gaps: xingIdx > -1 ? String(data[i][xingIdx]) : "", flags: flags, draft: draftIdx > -1 ? data[i][draftIdx] : "", bench: benchIdx > -1 ? data[i][benchIdx] : "",
             
             // 🧠 Pass the Vendor Comment and CD Intelligence column
             vendorComment: vcIdx > -1 ? data[i][vcIdx] : "",
             cdIntel: cdIntelIdx > -1 ? String(data[i][cdIntelIdx] || "").trim() : "",
             
             vel: {
                 ug: { tot: parseNum(data[i][ugTotIdx]), bom: parseNum(data[i][ugBomIdx]), daily: parseNum(data[i][ugDailyIdx]) },
                 ae: { tot: parseNum(data[i][aeTotIdx]), bom: parseNum(data[i][aeBomIdx]), daily: parseNum(data[i][aeDailyIdx]) },
                 fib: { tot: parseNum(data[i][fibTotIdx]), bom: parseNum(data[i][fibBomIdx]), daily: parseNum(data[i][fibDailyIdx]) },
                 nap: { tot: parseNum(data[i][napTotIdx]), bom: parseNum(data[i][napBomIdx]), daily: parseNum(data[i][napDailyIdx]) }
             },
             rawRow: safeRawRow, rowNum: i + 1 
         });
     }
  }
  // Read reference data import date (set by importReferenceData() in 01_Engine.js)
  let refDataDate = PropertiesService.getScriptProperties().getProperty('refDataImportDate') || "";

  return { actionItems: actionItems, totalRows: data.length - 1, headers: headers, refDataDate: refDataDate };
}

function promptLoadSpecificDateToQB() { const ui = SpreadsheetApp.getUi(); const response = ui.prompt('Load QuickBase Tab', 'Enter the date to load (YYYY-MM-DD):', ui.ButtonSet.OK_CANCEL); if (response.getSelectedButton() === ui.Button.OK) populateQuickBaseTabCore(response.getResponseText().trim()); }
function promptExportQuickBaseCSV() { exportQuickBaseCSVCore(false); }
function promptGenerateDailyReview() { const ui = SpreadsheetApp.getUi(); const response = ui.prompt('Generate Daily Review', 'Enter the date to review (YYYY-MM-DD):', ui.ButtonSet.OK_CANCEL); if (response.getSelectedButton() === ui.Button.OK) generateDailyReviewCore(response.getResponseText().trim(), null, false); }
function importArchiveFolder() { const keys = getExistingKeys(); const refDict = getReferenceDictionary(); processFolderRecursive(DriveApp.getFolderById(ARCHIVE_FOLDER_ID), keys, refDict, "", true, null); SpreadsheetApp.getUi().alert("✅ Master Archive Updated."); }
function setupDailyTrigger() { const triggers = ScriptApp.getProjectTriggers(); for (let i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]); ScriptApp.newTrigger('runMiddayAutomation').timeBased().atHour(12).everyDays(1).create(); ScriptApp.newTrigger('moveIncomingFoldersToArchive').timeBased().atHour(0).everyDays(1).create(); SpreadsheetApp.getUi().alert("✅ Daily Automations Enabled."); }
function runMiddayAutomation() { logMsg("🤖 STARTING MIDDAY AUTOMATION..."); setupSheets(); const keys = getExistingKeys(); const refDict = getReferenceDictionary(); let rowCollector = []; processFolderRecursive(DriveApp.getFolderById(INCOMING_FOLDER_ID), keys, refDict, "", false, rowCollector); let targetDateStr = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd"); if (rowCollector.length > 0) { let maxTime = 0; rowCollector.forEach(row => { let d = new Date(row[0]); if (d.getTime() > maxTime) { maxTime = d.getTime(); targetDateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd"); } }); } populateQuickBaseTabCore(targetDateStr); generateDailyReviewCore(targetDateStr, refDict, true); exportDirectorReviewXLSX(true); exportVendorCorrectionsXLSX(true); logMsg(`✅ MIDDAY AUTOMATION COMPLETE for Date: ${targetDateStr}`); }
function moveIncomingFoldersToArchive() { logMsg("🧹 STARTING MIDNIGHT SWEEP..."); let inc = DriveApp.getFolderById(INCOMING_FOLDER_ID), arch = DriveApp.getFolderById(ARCHIVE_FOLDER_ID); let folders = inc.getFolders(); let count = 0; while (folders.hasNext()) { folders.next().moveTo(arch); count++; } logMsg(`✅ MIDNIGHT SWEEP COMPLETE: Moved ${count} folders.`); }
function setupSheets() { const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheets = [{n: QB_UPLOAD_SHEET, h: QB_HEADERS}, {n: HISTORY_SHEET, h: HISTORY_HEADERS}, {n: MIRROR_SHEET, h: HISTORY_HEADERS}]; sheets.forEach(s => { let sh = ss.getSheetByName(s.n) || ss.insertSheet(s.n); if (sh.getLastRow() === 0) sh.appendRow(s.h); }); }

// 🧠 UPDATED FORMATTING FUNCTION TO HANDLE NEW XING SHEET AND CD INTELLIGENCE WRAPPING
function applyFormatting(targetSheet = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const styleSheet = ss.getSheetByName(STYLE_MASTER);
  if (!styleSheet) return;
  
  // 🧠 Ensure XING_SHEET is included if it exists
  let sheetsToFormat = [];
  if (targetSheet) {
      sheetsToFormat = [targetSheet];
  } else {
      sheetsToFormat = [
          ss.getSheetByName(QB_UPLOAD_SHEET), 
          ss.getSheetByName(HISTORY_SHEET), 
          ss.getSheetByName(MIRROR_SHEET)
      ];
      // Only push XING_SHEET if it has been defined globally
      if (typeof XING_SHEET !== 'undefined' && ss.getSheetByName(XING_SHEET)) {
          sheetsToFormat.push(ss.getSheetByName(XING_SHEET));
      }
  }
  
  sheetsToFormat.forEach(sh => {
    if (!sh) return;
    const trueLastRow = getTrueLastDataRow(sh);
    if (trueLastRow === 0) return;
    
    let activeHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    let expectedCols = activeHeaders.length;
    ensureCapacity(sh, Math.max(trueLastRow, 2), expectedCols);
    
    let rawStyleHeaders = styleSheet.getRange(1, 1, 1, styleSheet.getLastColumn()).getValues()[0];
    let styleHeaders = rawStyleHeaders.map(h => h.toString().trim());
    
    // Clear old bandings, apply fresh striping
    sh.getBandings().forEach(b => b.remove());
    if (trueLastRow > 1) {
        sh.getRange(2, 1, trueLastRow - 1, expectedCols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
    }
    
    activeHeaders.forEach((header, index) => {
      let lookupHeader = header.trim();
      let styleCol = styleHeaders.indexOf(lookupHeader) + 1;
      
      // Check exact match FIRST. If not found, THEN fallback to aliases.
      if (styleCol === 0) {
          if (lookupHeader === "Construction Comments" || lookupHeader === "Field Production") {
              styleCol = styleHeaders.indexOf("Vendor Comment") + 1;
          }
      }
      
      if (styleCol > 0) {
        styleSheet.getRange(1, styleCol).copyTo(sh.getRange(1, index + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT);
        sh.setColumnWidth(index + 1, styleSheet.getColumnWidth(styleCol));
        
        let styleCell = styleSheet.getRange(2, styleCol);
        let bg = styleCell.getBackground();
        let font = styleCell.getFontFamily();
        let size = styleCell.getFontSize();
        let align = styleCell.getHorizontalAlignment();
        let numFormat = styleCell.getNumberFormat();
        
        if (trueLastRow > 1) {
            let targetRange = sh.getRange(2, index + 1, trueLastRow - 1, 1);
            targetRange.setFontFamily(font).setFontSize(size).setHorizontalAlignment(align).setNumberFormat(numFormat);
            if (bg !== '#ffffff' && bg !== '#000000') targetRange.setBackground(bg);
            else targetRange.setBackground(null);
        }
      }
      
      // 🧠 Force width and wrap for long comment fields, AI Summaries, and the new CD Intelligence column
      if (header.trim() === "Construction Comments" || header.trim() === "Vendor Comment" || header.includes("Summary") || header.includes("Locations") || header.trim() === "CD Intelligence") {
          sh.setColumnWidth(index + 1, 400); 
      }
    });
    
    sh.setFrozenRows(1);
    // Don't freeze 7 columns on the Xing sheet, only the main trackers
    if (typeof XING_SHEET !== 'undefined' && sh.getName() !== XING_SHEET) {
        sh.setFrozenColumns(7);
    }
    
    if (trueLastRow > 1) {
      let dataRange = sh.getRange(2, 1, trueLastRow - 1, expectedCols);
      dataRange.setWrap(true).setVerticalAlignment("middle");
      sh.clearConditionalFormatRules();
      
      let rules = [];
      
      if (sh.getName() === QB_UPLOAD_SHEET || (typeof XING_SHEET !== 'undefined' && sh.getName() === XING_SHEET)) {
        sh.getRange(2, 1, trueLastRow - 1, expectedCols).clearDataValidations();
      } else {
        let fdhColIdx = activeHeaders.indexOf("FDH Engineering ID") + 1;
        if (fdhColIdx > 0 && sh.getName() === MIRROR_SHEET) {
            sh.getRange(2, fdhColIdx, trueLastRow - 1, 1).setBackground(null).setFontColor(null).setFontWeight("bold");
        }
        
        activeHeaders.forEach((header, index) => {
          let targetRange = sh.getRange(2, index + 1, trueLastRow - 1, 1);
          let topCell = sh.getRange(2, index + 1).getA1Notation();
          
          if (isBooleanColumn(header)) {
            targetRange.insertCheckboxes();
            targetRange.setHorizontalAlignment("center");
            let boolRule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK(${topCell})), NOT(ISLOGICAL(${topCell})))`).setBackground("#fee2e2").setFontColor("#991b1b").setBold(true).setRanges([targetRange]).build();
            rules.push(boolRule);
          }
          if (isDateColumn(header)) {
            targetRange.setNumberFormat("m/d/yyyy");
            targetRange.setHorizontalAlignment("right");
            let dateRule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK(${topCell})), NOT(ISNUMBER(${topCell})))`).setBackground("#fee2e2").setFontColor("#991b1b").setBold(true).setRanges([targetRange]).build();
            rules.push(dateRule);
          } else if (isNumericColumn(header) || header.includes("BOM")) {
            targetRange.setHorizontalAlignment("right");
            let numRule = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK(${topCell})), NOT(ISNUMBER(${topCell})), ISERROR(SEARCH("BOM:", ${topCell})))`).setBackground("#fee2e2").setFontColor("#991b1b").setBold(true).setRanges([targetRange]).build();
            rules.push(numRule);
          }
        });
        sh.setConditionalFormatRules(rules);
      }
    }
    trimAndFilterSheet(sh, trueLastRow, expectedCols);
  });
}

function getExistingKeys() { const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET); if (!sh) return new Set(); const data = sh.getDataRange().getValues(); const keys = new Set(); const trueLastRow = getTrueLastDataRow(sh); if (trueLastRow < 2) return keys; for (let i = 1; i < trueLastRow; i++) { let cellDate = data[i][0]; let fdhId = String(data[i][2]).toUpperCase().trim(); let dateStr = ""; if (cellDate) { if (cellDate instanceof Date) { dateStr = Utilities.formatDate(cellDate, "GMT-5", "yyyy-MM-dd"); } else { let d = new Date(cellDate); if (!isNaN(d.getTime())) { dateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd"); } else { dateStr = String(cellDate).trim(); } } } keys.add(dateStr + "_" + fdhId); } return keys; }
function removeDuplicatesFromArchive() { const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET); const data = sh.getDataRange().getValues(); const trueLastRow = getTrueLastDataRow(sh); if (trueLastRow < 2) return; const keys = new Set(); let rowsToDelete = []; for (let i = 1; i < trueLastRow; i++) { let cellDate = data[i][0]; let fdhId = String(data[i][2]).toUpperCase().trim(); let dateStr = ""; if (cellDate) { if (cellDate instanceof Date) { dateStr = Utilities.formatDate(cellDate, "GMT-5", "yyyy-MM-dd"); } else { let d = new Date(cellDate); if (!isNaN(d.getTime())) dateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd"); else dateStr = String(cellDate).trim(); } } let key = dateStr + "_" + fdhId; if (keys.has(key)) rowsToDelete.push(i + 1); else keys.add(key); } rowsToDelete.reverse(); let deleted = 0; rowsToDelete.forEach(r => { sh.deleteRow(r); deleted++; }); SpreadsheetApp.getUi().alert(`✅ Cleaned up ${deleted} duplicate rows from the Archive.`); }
function resetFileTags() { const resetFolder = (folderId) => { let folder = DriveApp.getFolderById(folderId); let files = folder.getFiles(); while (files.hasNext()) files.next().setDescription(""); let subs = folder.getFolders(); while (subs.hasNext()) resetFolder(subs.next().getId()); }; [ARCHIVE_FOLDER_ID, INCOMING_FOLDER_ID].forEach(id => resetFolder(id)); SpreadsheetApp.getUi().alert("Tags cleared for Archive & Incoming."); }
function commitReviewToArchiveAndQB() { syncReviewToArchive(); let ss = SpreadsheetApp.getActiveSpreadsheet(); let mirrorSheet = ss.getSheetByName(MIRROR_SHEET); let dateVal = mirrorSheet.getRange("A2").getValue(); let targetDateStr = (dateVal instanceof Date) ? Utilities.formatDate(dateVal, "GMT-5", "yyyy-MM-dd") : String(dateVal); populateQuickBaseTabCore(targetDateStr); exportDirectorReviewXLSX(); exportVendorCorrectionsXLSX(); }
function syncReviewToArchive() { logMsg("🔄 SYNC START: Review to Archive"); const ss = SpreadsheetApp.getActiveSpreadsheet(); const mirrorSheet = ss.getSheetByName(MIRROR_SHEET); const archiveSheet = ss.getSheetByName(HISTORY_SHEET); if (getTrueLastDataRow(mirrorSheet) < 2) return; let mirrorHeaders = mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0]; let archiveHeaders = archiveSheet.getRange(1, 1, 1, archiveSheet.getLastColumn()).getValues()[0]; let rowPtrIdx = mirrorHeaders.indexOf("Archive_Row"); if (rowPtrIdx === -1) { logMsg("⚠️ Sync Skipped: 'Archive_Row' column not found."); return; } let mirrorData = mirrorSheet.getRange(2, 1, getTrueLastDataRow(mirrorSheet) - 1, mirrorSheet.getLastColumn()).getValues(); let archiveData = archiveSheet.getDataRange().getValues(); let updateCount = 0; mirrorData.forEach(row => { let archiveRowIndex = row[rowPtrIdx]; if (archiveRowIndex && typeof archiveRowIndex === 'number' && archiveRowIndex <= archiveData.length) { mirrorHeaders.forEach((header, colIdx) => { if (ANALYTICS_QUADRANT.includes(header) || REVIEW_EXTRA_HEADERS.includes(header) || header === "Archive_Row") return; let archiveColIdx = archiveHeaders.indexOf(header); if (archiveColIdx > -1) { let newValue = row[colIdx]; if (typeof newValue === 'string' && newValue.includes('(BOM:')) { let cleanString = newValue.split('\n')[0].trim(); let cleanNum = Number(cleanString.replace(/,/g, '')); if (!isNaN(cleanNum)) newValue = cleanNum; else newValue = cleanString; } archiveSheet.getRange(archiveRowIndex, archiveColIdx + 1).setValue(newValue); } }); updateCount++; } }); SpreadsheetApp.flush(); logMsg(`✅ SYNC COMPLETE: Updated ${updateCount} rows in Master Archive.`); }
function exportSpreadsheetToXLSX(ssId, fileName) { let url = "https://docs.google.com/spreadsheets/export?id=" + ssId + "&exportFormat=xlsx"; let params = { method: "get", headers: {"Authorization": "Bearer " + ScriptApp.getOAuthToken()}, muteHttpExceptions: true }; let response = UrlFetchApp.fetch(url, params); if (response.getResponseCode() !== 200) { logMsg(`❌ EXPORT FAILED: ${response.getContentText()}`); return false; } let blob = response.getBlob(); blob.setName(fileName + ".xlsx"); DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(blob); return true; }
function exportDirectorReviewXLSX(isSilent = false) { logMsg("⚡ STARTING: Director Review XLSX Export"); const ss = SpreadsheetApp.getActiveSpreadsheet(); const mirrorSheet = ss.getSheetByName(MIRROR_SHEET); if (getTrueLastDataRow(mirrorSheet) < 2) { if(!isSilent) SpreadsheetApp.getUi().alert("No data available to export."); return; } let targetDateStr = mirrorSheet.getRange("A2").getValue(); let dateFormatted = (targetDateStr instanceof Date) ? Utilities.formatDate(targetDateStr, "GMT-5", "M.d.yy") : String(targetDateStr); let fileName = `Daily_Production_Analysis_${dateFormatted}`; let tempSS = SpreadsheetApp.create(fileName); let copiedSheet = mirrorSheet.copyTo(tempSS); copiedSheet.setName("Executive_Summary"); tempSS.deleteSheet(tempSS.getSheets()[0]); try { let maxRows = copiedSheet.getMaxRows(); let maxCols = copiedSheet.getMaxColumns(); copiedSheet.showRows(1, maxRows); copiedSheet.showColumns(1, maxCols); copiedSheet.getRange(1, 1, 1, maxCols).shiftColumnGroupDepth(-10); copiedSheet.getDataRange().setFontFamily("Arial").setFontSize(12); for (let c = 1; c <= maxCols; c++) { let w = copiedSheet.getColumnWidth(c); copiedSheet.setColumnWidth(c, w * 1.4); } copiedSheet.setFrozenColumns(7); } catch(e){} SpreadsheetApp.flush(); let success = exportSpreadsheetToXLSX(tempSS.getId(), fileName); DriveApp.getFileById(tempSS.getId()).setTrashed(true); if (success && !isSilent) { logMsg(`✅ FINISHED: Exported ${fileName}.xlsx`); SpreadsheetApp.getUi().alert(`✅ Daily Production Analysis exported as:\n${fileName}.xlsx`); } }
function exportVendorCorrectionsXLSX(isSilent = false) { logMsg("⚡ STARTING: Vendor Corrections XLSX Export"); const ss = SpreadsheetApp.getActiveSpreadsheet(); const mirrorSheet = ss.getSheetByName(MIRROR_SHEET); const styleSheet = ss.getSheetByName(STYLE_MASTER); if (getTrueLastDataRow(mirrorSheet) < 2) { if(!isSilent) SpreadsheetApp.getUi().alert("No data available to export."); return; } let targetDateStr = mirrorSheet.getRange("A2").getValue(); let dateFormatted = (targetDateStr instanceof Date) ? Utilities.formatDate(targetDateStr, "GMT-5", "M.d.yy") : String(targetDateStr); let currentHeaders = mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0]; let trueLastRow = getTrueLastDataRow(mirrorSheet); let mirrorData = mirrorSheet.getRange(2, 1, trueLastRow - 1, currentHeaders.length).getValues(); let contractorIdx = currentHeaders.indexOf("Contractor"); if (contractorIdx === -1) { logMsg("❌ ERROR: Contractor column not found."); return; } let vendors = [...new Set(mirrorData.map(row => row[contractorIdx]).filter(v => v !== ""))]; let exportedCount = 0; vendors.forEach(vendor => { let safeVendorName = vendor.toString().replace(/[\\/:*?"<>|]/g, "_").trim(); let fileName = `${safeVendorName}_Daily_Production_Report_${dateFormatted} (correction)`; let vendorData = mirrorData.filter(row => row[contractorIdx] === vendor); let strippedData = vendorData.map(row => QB_HEADERS.map(h => { let lookupH = h === "Construction Comments" ? "Vendor Comment" : h; let cIdx = currentHeaders.indexOf(lookupH); return cIdx > -1 ? row[cIdx] : ""; })); let tempSS = SpreadsheetApp.create(fileName); let tempSheet = tempSS.getSheets()[0]; tempSheet.setName("Daily Report"); styleSheet.copyTo(tempSS).setName(STYLE_MASTER); tempSheet.getRange(1, 1, 1, QB_HEADERS.length).setValues([QB_HEADERS]); if (strippedData.length > 0) tempSheet.getRange(2, 1, strippedData.length, QB_HEADERS.length).setValues(strippedData); let styleHeaders = tempSS.getSheetByName(STYLE_MASTER).getRange(1, 1, 1, tempSS.getSheetByName(STYLE_MASTER).getLastColumn()).getValues()[0]; QB_HEADERS.forEach((header, index) => { let lookupHeader = header.trim() === "Construction Comments" ? "Vendor Comment" : header.trim(); let styleCol = styleHeaders.indexOf(lookupHeader) + 1; if (styleCol > 0) { tempSS.getSheetByName(STYLE_MASTER).getRange(1, styleCol).copyTo(tempSheet.getRange(1, index + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT); let origWidth = tempSS.getSheetByName(STYLE_MASTER).getColumnWidth(styleCol); tempSheet.setColumnWidth(index + 1, origWidth * 1.4); } }); tempSheet.setFrozenRows(1); tempSheet.setFrozenColumns(7); if (strippedData.length > 0) { let dataRange = tempSheet.getRange(2, 1, strippedData.length, QB_HEADERS.length); dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false); dataRange.setWrap(true).setVerticalAlignment("middle"); QB_HEADERS.forEach((header, index) => { if (isBooleanColumn(header)) { tempSheet.getRange(2, index + 1, strippedData.length, 1).insertCheckboxes(); tempSheet.getRange(2, index + 1, strippedData.length, 1).setHorizontalAlignment("center"); } if (isNumericColumn(header) || header.includes("BOM")) tempSheet.getRange(2, index + 1, strippedData.length, 1).setHorizontalAlignment("right"); }); } tempSheet.getDataRange().setFontFamily("Arial").setFontSize(12); try { tempSheet.showRows(1, tempSheet.getMaxRows()); tempSheet.showColumns(1, tempSheet.getMaxColumns()); } catch(e) {} SpreadsheetApp.flush(); let success = exportSpreadsheetToXLSX(tempSS.getId(), fileName); DriveApp.getFileById(tempSS.getId()).setTrashed(true); if (success) exportedCount++; }); if (!isSilent) SpreadsheetApp.getUi().alert(`✅ Exported ${exportedCount} separate Vendor Correction file(s)!`); }

// 🧠 NEW: WEB APP ENGINE TRIGGER (Replaces View in Sheet)
// This allows the Web App to directly run Function 3a and return fresh data!
function webAppTrigger3a(targetDateStr) {
  try {
    logMsg("🌐 WebApp triggered Engine (Fn 3a) for Date: " + targetDateStr);
    
    // Run the exact same engine the Google Sheet menu runs
    generateDailyReviewCore(targetDateStr, null, false);
    
    // Fetch and return the newly generated data back to the UI
    return getDashboardData();
  } catch (e) {
    logFrontendError("webAppTrigger3a Error: " + e.message);
    throw e;
  }
}

// 🧠 WEB APP BRIDGE: Logs the Admin Check permanently and cleans the Daily Review sheet instantly
function markAdminCheckComplete(fdhId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if(!adminSheet) return false;
  
  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");
  
  let data = adminSheet.getDataRange().getValues();
  let found = false;
  let dateStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy");
  
  for(let i=1; i<data.length; i++) {
      if(data[i][0].toString().toUpperCase() === fdhId.toUpperCase()) {
          adminSheet.getRange(i+1, 2).setValue(dateStr);
          found = true; break;
      }
  }
  if(!found) adminSheet.appendRow([fdhId.toUpperCase(), dateStr, ""]);
  
  let mirror = ss.getSheetByName(MIRROR_SHEET);
  if(mirror) {
      let mData = mirror.getDataRange().getValues();
      let headers = mData[0];
      let idIdx = headers.indexOf("FDH Engineering ID"), flagIdx = headers.indexOf("Health Flags"), gapIdx = headers.indexOf("QB Context & Gaps");
      
      if (idIdx > -1 && flagIdx > -1 && gapIdx > -1) {
          for(let i=1; i<mData.length; i++) {
              if(mData[i][idIdx].toString().toUpperCase() === fdhId.toUpperCase()) {
                  let currentFlags = mData[i][flagIdx].toString();
                  let newFlags = currentFlags.replace("🚩 ADMIN: CHECK CROSSINGS", "").trim().replace(/\n+/g, '\n'); 
                  if(newFlags === "") newFlags = "✅ No Anomalies"; 
                  
                  let currentGaps = mData[i][gapIdx].toString();
                  let newGaps = currentGaps.replace("[Chk: NEVER]", `[Chk: ${dateStr}]`);
                  
                  mirror.getRange(i+1, flagIdx+1).setValue(newFlags);
                  mirror.getRange(i+1, gapIdx+1).setValue(newGaps);
                  break;
              }
          }
      }
  }
  return dateStr;
}

// 🧠 NEW: Status Sync Log Bridge
function markStatusSyncComplete(fdhId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if(!adminSheet) return false;

  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");

  let data = adminSheet.getDataRange().getValues();
  let found = false;
  let dateStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy");

  for(let i=1; i<data.length; i++) {
      if(data[i][0].toString().toUpperCase() === fdhId.toUpperCase()) {
          adminSheet.getRange(i+1, 3).setValue(dateStr); 
          found = true; break;
      }
  }
  if(!found) adminSheet.appendRow([fdhId.toUpperCase(), "", dateStr]);

  let mirror = ss.getSheetByName(MIRROR_SHEET);
  if(mirror) {
      let mData = mirror.getDataRange().getValues();
      let headers = mData[0];
      let idIdx = headers.indexOf("FDH Engineering ID"), flagIdx = headers.indexOf("Health Flags"), draftIdx = headers.indexOf("Action Required");

      if (idIdx > -1 && flagIdx > -1) {
          for(let i=1; i<mData.length; i++) {
              if(mData[i][idIdx].toString().toUpperCase() === fdhId.toUpperCase()) {
                  let currentFlags = mData[i][flagIdx].toString();
                  // 🧠 Clears BOTH Status Mismatches AND Missing Status Flags
                  let newFlags = currentFlags.replace("🚩 STATUS MISMATCH", "⚠️ ADMIN: REFRESH REF DATA").replace("🚩 MISSING QB STATUS", "⚠️ ADMIN: REFRESH REF DATA");
                  mirror.getRange(i+1, flagIdx+1).setValue(newFlags);

                  if (draftIdx > -1) {
                      mirror.getRange(i+1, draftIdx+1).setValue(`QB marked as updated on ${dateStr}. Import new Reference Data to clear this flag.`);
                  }
                  break;
              }
          }
      }
  }
  return dateStr;
}

// 🧠 NEW: EMAIL EXPORT ENGINE
function emailExportCSV(reviewsArray, targetEmail) {
  if (!reviewsArray || reviewsArray.length === 0) return "No reviews to export.";
  
  // 1. Commit to the permanent log tab
  commitBatchReviewsToLog(reviewsArray);
  
  // 2. Build the CSV file in memory
  let csvContent = "Timestamp,FDH,Vendor,System Flags,Manager Comment\n";
  let now = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy HH:mm");
  
  reviewsArray.forEach(item => {
     let safeFlags = `"${item.flags.replace(/\n/g, ', ').replace(/"/g, '""')}"`;
     let safeComment = `"${item.comment.replace(/"/g, '""')}"`;
     csvContent += `${now},${item.fdh},${item.vendor},${safeFlags},${safeComment}\n`;
  });
  
  let fileDate = Utilities.formatDate(new Date(), "GMT-5", "MM.dd.yy");
  let fileName = `Manager_Notes_Export_${fileDate}.csv`;
  
  // 3. Create the file attachment
  let blob = Utilities.newBlob(csvContent, MimeType.CSV, fileName);
  
  // 4. Send the Email
  MailApp.sendEmail({
    to: targetEmail,
    subject: "📊 Daily Production Hub: Manager Notes Export",
    body: "Attached is the latest Manager Notes Export from the Dailies Command Center.",
    attachments: [blob]
  });
  
  return "✅ Success! CSV emailed to " + targetEmail;
}