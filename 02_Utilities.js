/**
 * FILE: 02_Utilities.gs
 */

function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🚀 Production Hub')
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
    ui.createMenu('Daily Analyzer')
      .addItem('Sync from QuickBase',    'importFDHProjects')
      .addItem('🔍 Discover All QB Fields', 'discoverAllQBFields')
      .addSeparator()
      .addItem('Run CD Analysis',        'runCDAnalysis')
      .addItem('Check Gemini API Usage', 'checkCDApiUsage')
      .addItem('Clear CD Sheet',         'clearCDSheet')
      .addSeparator()
      .addItem('Commit Verified Crossings to Queue', 'commitToQueue')
      .addItem('Export Crossings Queue to CSV',      'exportCommittedQueueToCSV')
      .addItem('QB Writeback (Coming Soon)',          'writebackQBDirect')
      .addToUi();
  } catch (e) {}
}

function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? e.parameter.view.toLowerCase() : 'web';

  if (view === 'mobile') {
    return HtmlService.createHtmlOutputFromFile('MobileApp')
        .setTitle('Production Hub · Mobile')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  }

  if (view === 'codex') {
    return HtmlService.createHtmlOutputFromFile('CodexMobileApp')
        .setTitle('Production Hub · Mobile (Codex)')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  }

  return HtmlService.createHtmlOutputFromFile('WebApp')
      .setTitle('Daily Production Hub')
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
  const CACHE_KEY = 'dashboard_data_cache_v10';
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  if (!mirrorSheet || mirrorSheet.getLastRow() < 2) return { actionItems: [], totalRows: 0, headers: [] };
  const refDict = getReferenceDictionary();
  const vendorGoals = getVendorDailyGoals();
  const cityCoordinates = getCityCoordinates();

  const data = mirrorSheet.getDataRange().getValues();
  const headers = data[0].map(String); // Force strings

  const getIdx = name => headers.indexOf(name);
  const getIdxByAliases = (aliases) => headers.findIndex(h => aliases.includes(String(h || '').trim().toUpperCase()));
  const fdhIdx = getIdx("FDH Engineering ID"), flagsIdx = getIdx("Health Flags"), draftIdx = getIdx("Action Required");
  const vendorIdx = getIdx("Contractor"), statusIdx = getIdx("Status"), cityIdx = getIdx("City"), stageIdx = getIdx("Stage");
  const ofsIdx = getIdx("Budget OFS"), benchIdx = getIdx("Historical Milestones"), dateIdx = getIdx("Date");
  const targetIdx = getIdx("Target Completion Date"), cxStartIdx = getIdx("CX Start"), cxEndIdx = getIdx("CX Complete");
  const summaryIdx = getIdx("Field Production");
  const xingIdx = getIdx("QB Context & Gaps"), bslsIdx = getIdx("BSLs"), lightIdx = getIdx("Light to Cabinets");
  const cdIntelIdx = getIdx("CD Intelligence"), geminiInsightIdx = getIdx("Gemini Insight"), geminiDateIdx = getIdx("Gemini Insight Date");
  const specXIdx = getIdx("Special Crossings?");
  const specXDetIdx = (() => { let i = headers.indexOf("Special Crossing Details"); return i > -1 ? i : headers.indexOf("Sepcial Crossings Details"); })();
  const vcIdx = getIdx("Vendor Comment") > -1 ? getIdx("Vendor Comment") : getIdx("Construction Comments");
  const drgIdx = getIdxByAliases(["DRG", "DIRECT VENDOR", "DIRECT VENDOR TRACKING", "DRG TRACKER", "DIRECT VENDOR TRACKER"]);
  const drgUrlIdx = getIdxByAliases(["DRG TRACKER URL", "DIRECT VENDOR TRACKER URL", "DRG URL", "DIRECT VENDOR URL", "TRACKER URL"]);

  const ugTotIdx = getIdx("Total UG Footage Completed"), ugBomIdx = getIdx("UG BOM Quantity"), ugDailyIdx = getIdx("Daily UG Footage");
  const aeTotIdx = getIdx("Total Strand Footage Complete?"), aeBomIdx = getIdx("Strand BOM Quantity"), aeDailyIdx = getIdx("Daily Strand Footage");
  const fibTotIdx = getIdx("Total Fiber Footage Complete"), fibBomIdx = getIdx("Fiber BOM Quantity"), fibDailyIdx = getIdx("Daily Fiber Footage");
  const napTotIdx = getIdx("Total NAPs Completed"), napBomIdx = getIdx("NAP/Encl. BOM Qty."), napDailyIdx = getIdx("Daily NAPs/Encl. Completed");

  const parseNum = (val) => {
      if (val == null || val === "") return 0;
      if (typeof val === 'number') return val;
      let match = String(val).split('(')[0].replace(/,/g, '').trim().match(/-?\d+(\.\d+)?/);
      return match ? Number(match[0]) : 0;
  };
  const isChecked = (val) => {
      if (val === true) return true;
      let normalized = String(val || '').trim().toLowerCase();
      return ['true', '1', 'yes', 'y', 'checked', 'x', 'drg', 'direct vendor', 'tracked'].includes(normalized);
  };
  const defaultDrgTrackerUrl = VENDOR_TRACKER_ID ? `https://docs.google.com/spreadsheets/d/${VENDOR_TRACKER_ID}/edit` : "";

  const logSheet = ss.getSheetByName(CHANGE_LOG_SHEET);
  let globalLogs = [];
  let hasRecentGlobalChange = false;
  let yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  if (logSheet && logSheet.getLastRow() > 1) {
    const logData = logSheet.getDataRange().getValues();
    for (let j = 1; j < logData.length; j++) {
      let timeVal = logData[j][4];
      let logTime;
      let timeDisplay;
      if (timeVal instanceof Date) {
          // Sheets auto-converts date strings to Date objects; never call String() on them.
          const hm = Utilities.formatDate(timeVal, "GMT-6", "HH:mm");
          const dm = Utilities.formatDate(timeVal, "GMT-6", "MM/dd/yyyy");
          if (hm === "00:00") {
              // QB date-only field (midnight CST) → normalize to UTC midnight so
              // the frontend isMidnightUTC check suppresses the time display.
              const p = dm.split('/');
              logTime = new Date(Date.UTC(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])));
              timeDisplay = dm;
          } else {
              logTime = new Date(timeVal.getTime());
              timeDisplay = dm + " " + hm;
          }
      } else {
          const s = String(timeVal || '').trim();
          // Date-only strings (MM/dd/yyyy) are parsed as UTC midnight to prevent TZ drift.
          const dateOnly = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (dateOnly) {
              logTime = new Date(Date.UTC(parseInt(dateOnly[3]), parseInt(dateOnly[1]) - 1, parseInt(dateOnly[2])));
          } else {
              logTime = new Date(s);
          }
          timeDisplay = s;
      }
      let timestampObj = isNaN(logTime.getTime()) ? 0 : logTime.getTime();
      if (timestampObj > yesterday.getTime()) hasRecentGlobalChange = true;

      globalLogs.push({
        fdh: String(logData[j][0] || ""),
        type: String(logData[j][1] || ""),
        val: String(logData[j][2] || ""),
        user: String(logData[j][3] || "System"),
        time: timeDisplay,
        timestampObj: timestampObj
      });
    }
  }

  let actionItems = [];

  for (let i = 1; i < data.length; i++) {
     let flags = data[i][flagsIdx] ? String(data[i][flagsIdx]) : "";
     let stageStr = stageIdx > -1 ? String(data[i][stageIdx]).toUpperCase() : "";
     let statStr = statusIdx > -1 ? String(data[i][statusIdx]).toUpperCase() : "";
     let fdhKey = fdhIdx > -1 ? String(data[i][fdhIdx] || "").trim().toUpperCase() : "";
     let refData = refDict[fdhKey] || null;

     // Ignore all permitting projects unless they are Approved.
     if (stageStr.includes("PERMITTING") && !statStr.includes("APPROVED")) continue;

     if (flags !== "" && !flags.includes("✅ No Anomalies")) {
         const parseDate = (val) => val ? ((val instanceof Date) ? Utilities.formatDate(val, "GMT-5", "MM-dd-yyyy") : String(val).split('T')[0]) : "";
         const fieldProduction = summaryIdx > -1 ? String(data[i][summaryIdx] || "").trim() : "";
         const mirrorTrackerLinked = fieldProduction.includes("[📡 Tracker Linked]") || fieldProduction.includes("[Tracker Linked]");
         const mirrorDrgTracked = drgIdx > -1 ? isChecked(data[i][drgIdx]) : false;
         const mirrorDrgTrackerUrl = drgUrlIdx > -1 ? String(data[i][drgUrlIdx] || "").trim() : "";
         const refDrgTracked = refData ? !!refData.isDrgTracked : false;
         const refDrgTrackerUrl = refData ? String(refData.drgTrackerUrl || "").trim() : "";
         
         // 🧠 FIX: Ensure no Date objects make it into the raw row
         let safeRawRow = data[i]
             .map((cell, idx) => ({ h: headers[idx], v: (cell instanceof Date) ? cell.toISOString() : String(cell || "") }))
             .filter(({ v }) => v !== '');

         actionItems.push({
             fdh: fdhIdx > -1 ? String(data[i][fdhIdx] || "") : "", 
             vendor: vendorIdx > -1 ? String(data[i][vendorIdx] || "") : "", 
             city: cityIdx > -1 ? String(data[i][cityIdx] || "") : "",
             stage: stageIdx > -1 ? String(data[i][stageIdx] || "") : "", 
             status: statusIdx > -1 ? String(data[i][statusIdx] || "") : "", 
             bsls: bslsIdx > -1 ? String(data[i][bslsIdx] || "-") : "-",
             isLight: lightIdx > -1 ? (data[i][lightIdx] === true || String(data[i][lightIdx]).toLowerCase() === 'true') : false,
             ofsDate: parseDate(ofsIdx > -1 ? data[i][ofsIdx] : ""), 
             reportDate: parseDate(dateIdx > -1 ? data[i][dateIdx] : ""), 
             targetDate: parseDate(targetIdx > -1 ? data[i][targetIdx] : ""),
             cxStart: parseDate(cxStartIdx > -1 ? data[i][cxStartIdx] : ""), 
             cxEnd: parseDate(cxEndIdx > -1 ? data[i][cxEndIdx] : ""),
             isXing: xingIdx > -1 && String(data[i][xingIdx]).includes("X-ING YES"), 
             gaps: xingIdx > -1 ? String(data[i][xingIdx] || "") : "", 
             flags: flags, 
             draft: draftIdx > -1 ? String(data[i][draftIdx] || "") : "", 
             fieldProduction: fieldProduction,
             bench: benchIdx > -1 ? String(data[i][benchIdx] || "") : "",
             vendorComment: vcIdx > -1 ? String(data[i][vcIdx] || "") : "",
             cdIntel: cdIntelIdx > -1 ? String(data[i][cdIntelIdx] || "").trim() : "",
             geminiInsight: geminiInsightIdx > -1 ? String(data[i][geminiInsightIdx] || "").trim() : "",
             geminiDate: geminiDateIdx > -1 ? String(data[i][geminiDateIdx] || "").trim() : "",
             rawSpecialX:  specXIdx > -1 ? String(data[i][specXIdx] || "").trim() : "",
             specXDetails: specXDetIdx > -1 ? String(data[i][specXDetIdx] || "").trim() : "",
             isTrackerLinked: mirrorTrackerLinked,
             isDrgTracked: mirrorDrgTracked || refDrgTracked,
             drgTrackerUrl: mirrorDrgTrackerUrl || refDrgTrackerUrl || defaultDrgTrackerUrl,
             rid: refData ? String(refData.rid || "") : "",
             hasBOMDel: refData ? refData.hasBOMDel : false,
             hasSpliceDel: refData ? refData.hasSpliceDel : false,
             hasStandDel: refData ? refData.hasStandDel : false,
             hasCDDel: refData ? refData.hasCDDel : false,
             hasSpliceDist: refData ? refData.hasSpliceDist : false,
             hasStrandDist: refData ? refData.hasStrandDist : false,
             hasCDDist: refData ? refData.hasCDDist : false,
             hasBOMPo: refData ? refData.hasBOMPo : false,
             hasSOW: refData ? refData.hasSOW : false,
             qbRef: refData ? (refData.qbRef || {}) : {},
             vel: {
                 ug: { tot: parseNum(data[i][ugTotIdx]), bom: parseNum(data[i][ugBomIdx]), daily: parseNum(data[i][ugDailyIdx]) },
                 ae: { tot: parseNum(data[i][aeTotIdx]), bom: parseNum(data[i][aeBomIdx]), daily: parseNum(data[i][aeDailyIdx]) },
                 fib: { tot: parseNum(data[i][fibTotIdx]), bom: parseNum(data[i][fibBomIdx]), daily: parseNum(data[i][fibDailyIdx]) },
                 nap: { tot: parseNum(data[i][napTotIdx]), bom: parseNum(data[i][napBomIdx]), daily: parseNum(data[i][napDailyIdx]) }
             },
             rawRow: safeRawRow, 
             rowNum: i + 1
         });
     }
  }

  let refDataDate = String(PropertiesService.getScriptProperties().getProperty('refDataImportDate') || "");
  let vendorCities = buildVendorCityCoordinateRecords(actionItems, cityCoordinates);

  let payload = {
    actionItems: actionItems,
    hasRecentChanges: hasRecentGlobalChange,
    globalLogs: globalLogs,
    vendorGoals: vendorGoals,
    vendorCities: vendorCities,
    totalRows: data.length - 1,
    headers: headers,
    refDataDate: refDataDate,
    allFdhIds: Object.keys(refDict)
  };
  try { cache.put(CACHE_KEY, JSON.stringify(payload), 1800); } catch(e) {}
  return payload;
}

function getVendorDailyGoals() {
  let goalDict = Object.assign({}, DEFAULT_VENDOR_DAILY_GOALS || {});
  let sources = [];
  try {
    sources.push(SpreadsheetApp.getActiveSpreadsheet());
  } catch (e) {}
  try {
    sources.push(SpreadsheetApp.openById(VENDOR_TRACKER_ID));
  } catch (e) {}

  const parseGoalSheet = function(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return;
    let values = sheet.getDataRange().getValues();
    let headers = values[0].map(function(h) { return String(h || '').trim(); });
    let upper = headers.map(function(h) { return h.toUpperCase(); });
    let vendorIdx = upper.findIndex(function(h) {
      return h === "VENDOR" || h === "CONTRACTOR" || h.includes("VENDOR NAME");
    });
    let goalIdx = upper.findIndex(function(h) {
      return h.includes("DAILY GOAL") || h.includes("GOAL FT") || h.includes("TARGET FT") || h.includes("TARGET FOOTAGE") || h.includes("DAILY TARGET");
    });
    if (vendorIdx === -1 || goalIdx === -1) return;
    for (let i = 1; i < values.length; i++) {
      let vendor = String(values[i][vendorIdx] || '').trim();
      let raw = values[i][goalIdx];
      if (!vendor || raw === '' || raw == null) continue;
      let num = Number(String(raw).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(num) && num > 0) goalDict[vendor] = num;
    }
  };

  sources.forEach(function(ss) {
    try {
      let sheets = ss.getSheets();
      sheets.forEach(function(sheet) {
        let name = String(sheet.getName() || '').toUpperCase();
        if (name.includes('GOAL') || name.includes('TARGET')) parseGoalSheet(sheet);
      });
    } catch (e) {}
  });

  return goalDict;
}

function getCityCoordinates() {
  let cityDict = Object.assign({}, DEFAULT_CITY_COORDS || {});
  let sources = [];
  try {
    sources.push(SpreadsheetApp.getActiveSpreadsheet());
  } catch (e) {}
  try {
    sources.push(SpreadsheetApp.openById(VENDOR_TRACKER_ID));
  } catch (e) {}

  const parseCoordSheet = function(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return;
    let values = sheet.getDataRange().getValues();
    let headers = values[0].map(function(h) { return String(h || '').trim(); });
    let upper = headers.map(function(h) { return h.toUpperCase(); });
    let cityIdx = upper.findIndex(function(h) { return h === "CITY" || h.includes("VENDOR CITY"); });
    let stateIdx = upper.findIndex(function(h) { return h === "STATE" || h === "ST" || h.includes("STATE"); });
    let latIdx = upper.findIndex(function(h) { return h === "LAT" || h === "LATITUDE"; });
    let lngIdx = upper.findIndex(function(h) { return h === "LNG" || h === "LONG" || h === "LONGITUDE"; });
    if (cityIdx === -1 || latIdx === -1 || lngIdx === -1) return;

    for (let i = 1; i < values.length; i++) {
      let city = String(values[i][cityIdx] || '').trim();
      let state = stateIdx > -1 ? String(values[i][stateIdx] || '').trim() : '';
      let lat = Number(values[i][latIdx]);
      let lng = Number(values[i][lngIdx]);
      if (!city || isNaN(lat) || isNaN(lng)) continue;
      cityDict[normalizeCityKey(city)] = { city: city, state: state, lat: lat, lng: lng };
    }
  };

  sources.forEach(function(ss) {
    try {
      let sheets = ss.getSheets();
      sheets.forEach(function(sheet) {
        let name = String(sheet.getName() || '').toUpperCase();
        if (name.includes('GOAL') || name.includes('TARGET') || name.includes('CITY') || name.includes('VENDOR')) parseCoordSheet(sheet);
      });
    } catch (e) {}
  });

  return cityDict;
}

function normalizeCityKey(city) {
  return String(city || '')
    .toUpperCase()
    .replace(/\s*,\s*[A-Z]{2}$/g, '')
    .replace(/\./g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVendorCityCoordinateRecords(actionItems, cityCoordinates) {
  let rows = [];
  let seen = {};
  (actionItems || []).forEach(function(item) {
    let vendor = String(item && item.vendor || '').trim();
    let city = String(item && item.city || '').trim();
    if (!vendor || !city) return;
    let coord = cityCoordinates[normalizeCityKey(city)] || null;
    if (!coord) return;
    let key = [vendor.toUpperCase(), normalizeCityKey(city)].join('||');
    if (seen[key]) return;
    seen[key] = true;
    rows.push({
      vendor: vendor,
      city: coord.city || city,
      state: coord.state || '',
      lat: Number(coord.lat),
      lng: Number(coord.lng)
    });
  });
  return rows;
}

function promptLoadSpecificDateToQB() { 
  showDatePickerDialog("LoadQB", "Load QuickBase Tab");
}
function promptExportQuickBaseCSV() { exportQuickBaseCSVCore(false); }
function promptGenerateDailyReview() { 
  showDatePickerDialog("RunReview", "Generate Daily Review");
}
function showDatePickerDialog(actionName, title) {
  let tmpl = HtmlService.createTemplateFromFile("DatePicker");
  tmpl.action = actionName;

  let html = tmpl.evaluate()
    .setWidth(300)
    .setHeight(220);

  SpreadsheetApp.getUi().showModalDialog(html, "📅 " + title);
}
function processDateSelection(dateStr, actionName) {
  if (!dateStr || (Array.isArray(dateStr) && dateStr.length === 0)) return;

  if (actionName === "LoadQB") {
    populateQuickBaseTabCore(dateStr);
  } else if (actionName === "RunReview") {
    generateDailyReviewCore(dateStr, null, false);
  }
}
function importArchiveFolder() { const keys = getExistingKeys(); const refDict = getReferenceDictionary(); processFolderRecursive(DriveApp.getFolderById(ARCHIVE_FOLDER_ID), keys, refDict, "", true, null); SpreadsheetApp.getUi().alert("✅ Master Archive Updated."); }
function setupDailyTrigger() { const triggers = ScriptApp.getProjectTriggers(); for (let i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]); ScriptApp.newTrigger('runMiddayAutomation').timeBased().atHour(12).everyDays(1).create(); ScriptApp.newTrigger('moveIncomingFoldersToArchive').timeBased().atHour(0).everyDays(1).create(); SpreadsheetApp.getUi().alert("✅ Daily Automations Enabled."); }
function runMiddayAutomation() { logMsg("🤖 STARTING MIDDAY AUTOMATION..."); setupSheets(); const keys = getExistingKeys(); const refDict = getReferenceDictionary(); let newRowsAppended = []; let allProcessedDates = []; let rowCollector = []; processFolderRecursive(DriveApp.getFolderById(INCOMING_FOLDER_ID), keys, refDict, "", false, newRowsAppended, allProcessedDates, false, rowCollector); let targetDateStr = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd"); if (rowCollector.length > 0) { let maxTime = 0; rowCollector.forEach(row => { let d = new Date(row[0]); if (d.getTime() > maxTime) { maxTime = d.getTime(); targetDateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd"); } }); } populateQuickBaseTabDirectly(rowCollector); generateDailyReviewCore(targetDateStr, refDict, true); exportDirectorReviewXLSX(true); exportVendorCorrectionsXLSX(true); logMsg(`✅ MIDDAY AUTOMATION COMPLETE for Date: ${targetDateStr}`); }
function moveIncomingFoldersToArchive() { logMsg("🧹 STARTING MIDNIGHT SWEEP..."); let inc = DriveApp.getFolderById(INCOMING_FOLDER_ID), arch = DriveApp.getFolderById(ARCHIVE_FOLDER_ID); let folders = inc.getFolders(); let count = 0; while (folders.hasNext()) { folders.next().moveTo(arch); count++; } logMsg(`✅ MIDNIGHT SWEEP COMPLETE: Moved ${count} folders.`); }
function setupSheets() { const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheets = [{n: QB_UPLOAD_SHEET, h: QB_HEADERS}, {n: HISTORY_SHEET, h: HISTORY_HEADERS}, {n: MIRROR_SHEET, h: HISTORY_HEADERS}]; sheets.forEach(s => { let sh = ss.getSheetByName(s.n) || ss.insertSheet(s.n); if (sh.getLastRow() === 0) sh.appendRow(s.h); }); }

// 🧠 DECK BACKEND: Upserts answers into 8-Deck_Answers
function saveDeckAnswers(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DECK_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(DECK_SHEET);
    sheet.appendRow(DECK_HEADERS);
    sheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    ensureCapacity(sheet, Math.max(sheet.getMaxRows(), 1), DECK_HEADERS.length);
    const currentHeaders = sheet.getRange(1, 1, 1, DECK_HEADERS.length).getValues()[0].map(String);
    if (currentHeaders.join("||") !== DECK_HEADERS.join("||")) {
      sheet.getRange(1, 1, 1, DECK_HEADERS.length).setValues([DECK_HEADERS]);
      sheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }

  const safePayload = payload || {};
  const safeAnswers = safePayload.answers || {};
  const toBool = v => v === true || v === 'true';
  const data = sheet.getDataRange().getValues();
  const fdhIdx = DECK_HEADERS.indexOf("FDH Engineering ID");
  let targetRow = -1;
  let targetFdh = safePayload.fdh ? safePayload.fdh.toString().trim().toUpperCase() : "";

  if (fdhIdx > -1 && data.length > 1 && targetFdh) {
    for (let i = 1; i < data.length; i++) {
      let rowFdh = data[i][fdhIdx] ? data[i][fdhIdx].toString().trim().toUpperCase() : "";
      if (rowFdh === targetFdh) {
        targetRow = i + 1;
        break;
      }
    }
  }

  const now = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy HH:mm");
  let rowData = DECK_HEADERS.map(header => {
    switch (header) {
      case "Timestamp": return now;
      case "FDH Engineering ID": return safePayload.fdh || "";
      case "Vendor": return safePayload.vendor || "";
      case "Target Date": return safePayload.targetDate || "";
      case "Sent for Permitting": return safeAnswers.q_permit_sent || "";
      case "Permit Approved": return safeAnswers.q_permit_appr || "";
      case "DOT Paperwork Submitted": return safeAnswers.q_cross_sub || "";
      case "Special Crossing Approved": return safeAnswers.q_cross_appr || "";
      case "Approval Dist to Vendor": return safeAnswers.q_cross_dist || "";
      case "CD Distributed":   return toBool(safeAnswers.q_cd_dist);
      case "Splice Docs Dist":  return toBool(safeAnswers.q_splice_dist);
      case "Strand Maps Dist":  return toBool(safeAnswers.q_strand_dist);
      case "BOM Sent":          return toBool(safeAnswers.q_bom_sent);
      case "PO Number Sent":    return toBool(safeAnswers.q_po_sent);
      case "SOW Signed":        return toBool(safeAnswers.q_sow_sign);
      case "Active Set": return toBool(safeAnswers.q_active_set);
      case "Active Has Power": return toBool(safeAnswers.q_active_pwr);
      case "Leg ID": return safeAnswers.q_leg || "";
      case "Transport Available": return toBool(safeAnswers.q_transport);
      case "How is it Fed": return safeAnswers.q_how_fed || "";
      case "What Does it Feed": return safeAnswers.q_what_feeds || "";
      case "Island Missing Components": return safeAnswers.q_island || "";
      case "OFS Changed Check": return toBool(safeAnswers.q_ofs_change);
      case "OFS Changed Reason": return safeAnswers.q_ofs_reason || "";
      case "Is Xing Override":  return safeAnswers.q_is_xing !== undefined ? toBool(safeAnswers.q_is_xing) : "";
      case "Manager Note": return safePayload.note || "";
      case "QB Sync Status": return "Pending";
      default: return "";
    }
  });

  if (targetRow > -1) {
    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return now;
}

// 🧠 DECK BACKEND: Batch Save to Sheet & Email Export
function processBatchDeckExport(payloads, targetEmail, emailBody) {
  if (!payloads || payloads.length === 0) throw new Error("No items to process.");
  payloads.forEach(payload => saveDeckAnswers(payload));
  MailApp.sendEmail({
    to: targetEmail,
    subject: `📊 Daily PM Deck Report (${payloads.length} Projects)`,
    body: emailBody
  });
  return payloads.length;
}

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
    let targetDates = Array.isArray(targetDateStr) ? targetDateStr : [targetDateStr];
    logMsg("🌐 WebApp triggered Engine (Fn 3a) for Date(s): " + targetDates.join(", "));
    generateDailyReviewCore(targetDateStr, null, false);
    return getDashboardData();
  } catch (e) {
    logFrontendError("webAppTrigger3a Error: " + e.message);
    throw e;
  }
}

// 🧠 WEB APP BRIDGE: Logs the Admin Check permanently and cleans the Daily Review sheet instantly
function markAdminCheckComplete(fdhId) {
  CacheService.getScriptCache().remove('dashboard_data_cache');
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

function verifySpecialCrossings(fdhId) {
  CacheService.getScriptCache().remove('dashboard_data_cache');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if (!adminSheet) return false;

  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");
  if (adminSheet.getLastColumn() < 4) adminSheet.getRange(1, 4).setValue("Crossings Verified Date");
  if (adminSheet.getLastColumn() < 5) adminSheet.getRange(1, 5).setValue("Committed Date");

  let data = adminSheet.getDataRange().getValues();
  let found = false;
  let dateStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy");

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === fdhId.toUpperCase()) {
      adminSheet.getRange(i + 1, 2).setValue(dateStr);
      adminSheet.getRange(i + 1, 4).setValue(dateStr);
      found = true; break;
    }
  }
  if (!found) adminSheet.appendRow([fdhId.toUpperCase(), dateStr, "", dateStr, ""]);

  let mirror = ss.getSheetByName(MIRROR_SHEET);
  if (mirror) {
    let mData = mirror.getDataRange().getValues();
    let headers = mData[0];
    let idIdx = headers.indexOf("FDH Engineering ID"), flagIdx = headers.indexOf("Health Flags"), gapIdx = headers.indexOf("QB Context & Gaps");
    if (idIdx > -1 && flagIdx > -1 && gapIdx > -1) {
      for (let i = 1; i < mData.length; i++) {
        if (mData[i][idIdx].toString().toUpperCase() === fdhId.toUpperCase()) {
          let currentFlags = mData[i][flagIdx].toString();
          let newFlags = currentFlags.replace("🚩 ADMIN: CHECK CROSSINGS", "").trim().replace(/\n+/g, '\n');
          if (newFlags === "") newFlags = "✅ No Anomalies";
          let currentGaps = mData[i][gapIdx].toString();
          let newGaps = currentGaps.replace("[Chk: NEVER]", `[Chk: ${dateStr}]`);
          mirror.getRange(i + 1, flagIdx + 1).setValue(newFlags);
          mirror.getRange(i + 1, gapIdx + 1).setValue(newGaps);
          break;
        }
      }
    }
  }
  return dateStr;
}

// 🧠 NEW: Status Sync Log Bridge
function markStatusSyncComplete(fdhId) {
  CacheService.getScriptCache().remove('dashboard_data_cache');
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
