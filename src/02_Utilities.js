/**
 * FILE: 02_Utilities.gs
 */

function getVendorHybridStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let stats = {};

  // 1. LIFETIME PASS (Authoritative Reference Data)
  const refSheet = ss.getSheetByName(REF_SHEET);
  if (refSheet && refSheet.getLastRow() > 1) {
    const data = refSheet.getDataRange().getValues();
    const headers = data[0];
    const contractorIdx = headers.findIndex(h => h && ["CX VENDOR", "CONTRACTOR", "VENDOR"].includes(h.trim().toUpperCase()));
    const fiberTotIdx = headers.findIndex(h => h && ["FIBER FOOTAGE", "TOTAL FIBER FOOTAGE COMPLETE", "FIBER FOOTAGE COMPLETE"].includes(h.trim().toUpperCase()));
    const fdhIdx = headers.findIndex(h => h && h.trim().toUpperCase().includes("FDH"));

    if (fiberTotIdx === -1) logMsg('WARN', 'getVendorHybridStats', 'Fiber Footage column not found in Reference_Data. Headers: ' + JSON.stringify(headers.slice(0, 20)));
    if (contractorIdx > -1) {
      for (let i = 1; i < data.length; i++) {
        let vendor = String(data[i][contractorIdx] || '').trim();
        if (!vendor || vendor === '-' || vendor === 'Unknown') continue;
        
        if (!stats[vendor]) {
          stats[vendor] = {
            lifetime:    { footage: 0, miles: 0, fdhs: new Set() },
            recent30:    { footage: 0, miles: 0 },
            recent7:     { footage: 0, miles: 0 },
            today:       { footage: 0, miles: 0 },
            month:       { footage: 0, miles: 0 },
            prevMonth:   { footage: 0, miles: 0 },
            quarter:     { footage: 0, miles: 0 },
            prevQuarter: { footage: 0, miles: 0 }
          };
        }

        if (fiberTotIdx > -1) {
          let rawFootage = data[i][fiberTotIdx];
          if (rawFootage instanceof Date) {
            logMsg('WARN', 'getVendorHybridStats', 'Fiber Footage cell is Date-typed at row ' + i + ' — skipping. Reformat column as Number in Sheets.');
          } else {
            stats[vendor].lifetime.footage += (Number(rawFootage) || 0);
          }
        }
        if (fdhIdx > -1) {
          let fdh = String(data[i][fdhIdx] || '').trim();
          if (fdh) stats[vendor].lifetime.fdhs.add(fdh);
        }
      }
    }
  }

  // 2. RECENT PASS (Master Archive Dailies)
  const historySheet = ss.getSheetByName(HISTORY_SHEET);
  if (historySheet && historySheet.getLastRow() > 1) {
    const data = historySheet.getDataRange().getValues();
    const headers = data[0];
    const contractorIdx = headers.indexOf("Contractor");
    const fiberDailyIdx = headers.indexOf("Daily Fiber Footage");
    const dateIdx = headers.indexOf("Date");

    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const nowMonth  = now.getMonth();
    const nowYear   = now.getFullYear();
    const nowQ      = Math.floor(nowMonth / 3);
    const prevMoNum = nowMonth === 0 ? 11 : nowMonth - 1;
    const prevMoYr  = nowMonth === 0 ? nowYear - 1 : nowYear;
    const prevQNum  = nowQ === 0 ? 3 : nowQ - 1;
    const prevQYr   = nowQ === 0 ? nowYear - 1 : nowYear;

    if (contractorIdx > -1 && fiberDailyIdx > -1 && dateIdx > -1) {
      for (let i = 1; i < data.length; i++) {
        let vendor = String(data[i][contractorIdx] || '').trim();
        if (!vendor || vendor === '-') continue;
        
        let footage = Number(data[i][fiberDailyIdx]) || 0;
        if (footage === 0) continue;

        let entryDate = new Date(data[i][dateIdx]);
        if (isNaN(entryDate.getTime())) continue;

        let diffDays = (now - entryDate) / msPerDay;

        if (!stats[vendor]) {
          stats[vendor] = {
            lifetime:    { footage: 0, miles: 0, fdhs: new Set() },
            recent30:    { footage: 0, miles: 0 },
            recent7:     { footage: 0, miles: 0 },
            today:       { footage: 0, miles: 0 },
            month:       { footage: 0, miles: 0 },
            prevMonth:   { footage: 0, miles: 0 },
            quarter:     { footage: 0, miles: 0 },
            prevQuarter: { footage: 0, miles: 0 }
          };
        }

        if (diffDays <= 30) stats[vendor].recent30.footage += footage;
        if (diffDays <= 7)  stats[vendor].recent7.footage  += footage;
        if (diffDays < 1)   stats[vendor].today.footage    += footage;

        var eMonth = entryDate.getMonth(), eYear = entryDate.getFullYear();
        var eQ = Math.floor(eMonth / 3);
        if (eMonth === nowMonth  && eYear === nowYear)   stats[vendor].month.footage       += footage;
        if (eMonth === prevMoNum && eYear === prevMoYr)  stats[vendor].prevMonth.footage   += footage;
        if (eQ === nowQ          && eYear === nowYear)   stats[vendor].quarter.footage     += footage;
        if (eQ === prevQNum      && eYear === prevQYr)   stats[vendor].prevQuarter.footage += footage;
      }
    }
  }

  // 3. FINAL CONVERSION & CLEANUP
  for (let vendor in stats) {
    let s = stats[vendor];
    s.lifetime.miles = Number((s.lifetime.footage / FT_PER_MILE).toFixed(2));
    s.lifetime.fdhCount = s.lifetime.fdhs.size;
    delete s.lifetime.fdhs; // Remove Set before JSON stringify

    s.recent30.miles    = Number((s.recent30.footage    / FT_PER_MILE).toFixed(2));
    s.recent7.miles     = Number((s.recent7.footage     / FT_PER_MILE).toFixed(2));
    s.today.miles       = Number((s.today.footage       / FT_PER_MILE).toFixed(2));
    s.month.miles       = Number((s.month.footage       / FT_PER_MILE).toFixed(2));
    s.prevMonth.miles   = Number((s.prevMonth.footage   / FT_PER_MILE).toFixed(2));
    s.quarter.miles     = Number((s.quarter.footage     / FT_PER_MILE).toFixed(2));
    s.prevQuarter.miles = Number((s.prevQuarter.footage / FT_PER_MILE).toFixed(2));
  }

  return stats;
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    const main = ui.createMenu('Omni PMO');
    
    main.addSubMenu(ui.createMenu('Data Pipeline')
      .addItem('Process Incoming Reports', 'processIncomingForQuickBase')
      .addItem('Load Specific Date to QB Tab', 'promptLoadSpecificDateToQB')
      .addItem('Load Vendor Range to QB Tab', 'promptLoadVendorRangeToQB')
      .addSeparator()
      .addItem('Emergency: Force Re-scan All Files', 'forceRescanIncoming')
      .addItem('Unlock Ingestion', 'resetIngestionLock')
    );

    main.addSubMenu(ui.createMenu('Review Engine')
      .addItem('Generate Daily Review', 'promptGenerateDailyReview')
      .addItem('Commit Review to Archive & QB', 'commitReviewToArchiveAndQB')
    );

    main.addSubMenu(ui.createMenu('Quickbase Hub')
      .addItem('Refresh Reference Data', 'importReferenceData')
      .addItem('Sync Projects from Quickbase', 'importFDHProjects')
      .addItem('Discover Quickbase Fields', 'discoverAllQBFields')
      .addSeparator()
      .addItem('Commit Status Queue', 'commitToQueue')
      .addItem('Export Status Queue (CSV)', 'exportCommittedQueueToCSV')
      .addItem('Direct Quickbase Writeback', 'writebackQBDirect')
    );

    main.addSubMenu(ui.createMenu('Exports & Reporting')
      .addItem('Export Director Review (XLSX)', 'exportDirectorReviewXLSX')
      .addItem('Export Vendor Corrections (XLSX)', 'exportVendorCorrectionsXLSX')
      .addItem('Export Quickbase Upload (CSV)', 'promptExportQuickBaseCSV')
      .addSeparator()
      .addItem('Backfill Missing Reports (7-Day)', 'backfillMissingReports')
    );

    main.addSubMenu(ui.createMenu('System Maintenance')
      .addItem('Configure Daily Automations', 'setupDailyTrigger')
      .addItem('Refresh Styles & Checkboxes', 'applyFormatting')
      .addItem('Clear Processed File Tags', 'resetFileTags')
      .addItem('Clean Archive Duplicates', 'removeDuplicatesFromArchive')
      .addItem('Import Historical Archive', 'importArchiveFolder')
    );

    main.addToUi();
  } catch (e) {}
}

function doGet(e) {
  // Mobile shell routing:
  // `WebApp` remains the shared desktop shell.
  // `GlassFlow` is the active mobile shell and is addressable via `?v=GlassFlow`.
  const MOBILE_SHELLS = {
    'GlassFlow': 'v2_shell_GlassFlow',
  };

  const variant = (e && e.parameter && e.parameter.v) ? e.parameter.v : null;
  const templateFile = (variant && MOBILE_SHELLS[variant]) ? MOBILE_SHELLS[variant] : 'WebApp';
  const title = variant ? 'Omni PMO — Mobile: ' + variant : 'Omni PMO App';

  return HtmlService.createTemplateFromFile(templateFile)
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
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

// Splits large strings into ≤90 KB chunks to stay under CacheService's 100 KB-per-key limit.
function putChunkedCache(cache, baseKey, dataStr, ttl) {
  const CHUNK_SIZE = 90000;
  const numChunks = Math.ceil(dataStr.length / CHUNK_SIZE);
  cache.put(baseKey + '_meta', String(numChunks), ttl);
  for (let i = 0; i < numChunks; i++) {
    cache.put(baseKey + '_' + i, dataStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), ttl);
  }
}

function getChunkedCache(cache, baseKey) {
  const metaStr = cache.get(baseKey + '_meta');
  if (!metaStr) return null;
  const numChunks = parseInt(metaStr, 10);
  let result = '';
  for (let i = 0; i < numChunks; i++) {
    const chunk = cache.get(baseKey + '_' + i);
    if (chunk === null) return null; // partial expiry → fall through to cold path
    result += chunk;
  }
  return result;
}

function _parseDashboardDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  const raw = String(value || '').trim();
  if (!raw || raw === '-' || raw.toLowerCase() === 'unknown') return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function _shouldHideStaleOfsQueueItem(stage, status, flags, primaryOfsDate, fallbackOfsDate, reportDate) {
  const stageStr = String(stage || '').toUpperCase();
  const statusStr = String(status || '').toUpperCase();
  const flagsStr = String(flags || '').toUpperCase();
  const isOfsScoped = stageStr.includes('OFS') || statusStr.includes('OUT OF CX SCOPE') || flagsStr.includes('LIKELY OFS / OUT OF CX SCOPE');
  if (!isOfsScoped) return false;

  const ofsDate = _parseDashboardDateValue(primaryOfsDate) || _parseDashboardDateValue(fallbackOfsDate) || _parseDashboardDateValue(reportDate);
  if (!ofsDate) return false;

  const cutoff = new Date(ofsDate.getFullYear(), ofsDate.getMonth() + 1, 7);
  cutoff.setHours(23, 59, 59, 999);
  return Date.now() > cutoff.getTime();
}

function getDashboardData() {
  const CACHE_KEY = 'dashboard_data_cache_v11';
  const cache = CacheService.getScriptCache();
  const cached = getChunkedCache(cache, CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  if (!mirrorSheet || mirrorSheet.getLastRow() < 2) return { actionItems: [], totalRows: 0, headers: [] };
  const refDict = getReferenceDictionary();
  const vendorGoals = getVendorDailyGoals();
  const cityCoordinates = getCityCoordinates();
  const fiberStats = getVendorHybridStats();

  const data = mirrorSheet.getDataRange().getValues();
  const headers = data[0].map(String); // Force strings

  const getIdx = name => headers.indexOf(name);
  const getIdxByAliases = (aliases) => headers.findIndex(h => aliases.includes(String(h || '').trim().toUpperCase()));
  const fdhIdx = getIdx("FDH Engineering ID"), flagsIdx = getIdx("Health Flags"), draftIdx = getIdx("Action Required");
  const vendorIdx = getIdx("Contractor"), statusIdx = getIdx("Status"), cityIdx = getIdx("City"), stageIdx = getIdx("Stage");
  const ofsIdx = getIdxByAliases(["OFS DATE", "BUDGET OFS"]), benchIdx = getIdx("Historical Milestones"), dateIdx = getIdx("Date");
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
             .map((cell, idx) => {
                 let val = cell;
                 if (cell instanceof Date) {
                     val = (!isNaN(cell.getTime())) ? cell.toISOString() : "";
                 } else {
                     val = String(cell || "");
                 }
                 return { h: headers[idx], v: val };
             })
             .filter(({ v }) => v !== '');

         let vendorName = vendorIdx > -1 ? String(data[i][vendorIdx] || "").trim() : "";
         let vStats = fiberStats[vendorName] || { lifetime: { footage: 0, miles: 0 }, recent30: { footage: 0, miles: 0 }, recent7: { footage: 0, miles: 0 }, today: { footage: 0, miles: 0 }, month: { footage: 0, miles: 0 }, prevMonth: { footage: 0, miles: 0 }, quarter: { footage: 0, miles: 0 }, prevQuarter: { footage: 0, miles: 0 } };

         const rawMirrorOfsDate = parseDate(ofsIdx > -1 ? data[i][ofsIdx] : "");
         const canonicalOfsDate = refData
             ? String(refData.canonicalOfsDate || refData.forecastedOFS || "").trim()
             : "";
         const normalizedCanonicalOfsDate = (!canonicalOfsDate || canonicalOfsDate === '-' || canonicalOfsDate === 'Unknown')
             ? ""
             : canonicalOfsDate;

         if (_shouldHideStaleOfsQueueItem(
             stageIdx > -1 ? data[i][stageIdx] : "",
             statusIdx > -1 ? data[i][statusIdx] : "",
             flags,
             normalizedCanonicalOfsDate,
             rawMirrorOfsDate,
             dateIdx > -1 ? data[i][dateIdx] : ""
         )) {
             continue;
         }

         actionItems.push({
             fdh: fdhIdx > -1 ? String(data[i][fdhIdx] || "") : "",
             vendor: vendorName,
             city: cityIdx > -1 ? String(data[i][cityIdx] || "") : "",
             stage: stageIdx > -1 ? String(data[i][stageIdx] || "") : "",
             status: statusIdx > -1 ? String(data[i][statusIdx] || "") : "",
             bsls: bslsIdx > -1 ? String(data[i][bslsIdx] || "-") : "-",
             isLight: lightIdx > -1 ? (data[i][lightIdx] === true || String(data[i][lightIdx]).toLowerCase() === 'true') : false,
             canonicalOfsDate: normalizedCanonicalOfsDate,
             ofsDate: normalizedCanonicalOfsDate,
             rawMirrorOfsDate: rawMirrorOfsDate,
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
             rawReferenceOfsDate: refData ? String(refData.canonicalOfsDate || refData.forecastedOFS || "").trim() : "",
             ofsDateMismatch: !!(rawMirrorOfsDate && normalizedCanonicalOfsDate && rawMirrorOfsDate !== normalizedCanonicalOfsDate),
             qbRef: refData ? (refData.qbRef || {}) : {},
             fiberTotalMiles: vStats.lifetime.miles,
             vel: {                 ug: { tot: parseNum(data[i][ugTotIdx]), bom: parseNum(data[i][ugBomIdx]), daily: parseNum(data[i][ugDailyIdx]) },
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
    allFdhIds: Object.keys(refDict),
    fiberStats: fiberStats
  };
  const serializedPayload = JSON.stringify(payload);
  try { putChunkedCache(cache, CACHE_KEY, serializedPayload, 1800); } catch(e) {}
  return JSON.parse(serializedPayload);
}

function getVendorDailyGoals() {
  const GOALS_CACHE_KEY = 'vendor_daily_goals_v1';
  const cache = CacheService.getScriptCache();
  const cachedGoals = cache.get(GOALS_CACHE_KEY);
  if (cachedGoals) { try { return JSON.parse(cachedGoals); } catch(e) {} }

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

  try { cache.put(GOALS_CACHE_KEY, JSON.stringify(goalDict), 21600); } catch(e) {}
  return goalDict;
}

function getCityCoordinates() {
  const COORDS_CACHE_KEY = 'city_coords_v1';
  const cache = CacheService.getScriptCache();
  const cachedCoords = cache.get(COORDS_CACHE_KEY);
  if (cachedCoords) { try { return JSON.parse(cachedCoords); } catch(e) {} }

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

  try { cache.put(COORDS_CACHE_KEY, JSON.stringify(cityDict), 21600); } catch(e) {}
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

function promptLoadSpecificDateToQB() { showDatePickerDialog("LoadQB", "Load QuickBase Tab"); }
function promptGenerateDailyReview() { showDatePickerDialog("RunReview", "Generate Daily Review"); }

function promptLoadVendorRangeToQB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  let vendors = [];
  if (histSheet && histSheet.getLastRow() > 1) {
      const data = histSheet.getDataRange().getValues();
      const headers = data[0];
      const contractorIdx = headers.indexOf("Contractor");
      if (contractorIdx > -1) {
          let vSet = new Set();
          for (let i = 1; i < data.length; i++) {
              let v = data[i][contractorIdx];
              if (v) vSet.add(String(v).trim());
          }
          vendors = Array.from(vSet).sort();
      }
  }

  let tmpl = HtmlService.createTemplateFromFile("VendorDateRangePicker");
  tmpl.vendors = vendors;
  let html = tmpl.evaluate().setWidth(350).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, "📅 Load Vendor Range to QB Tab");
}

function processVendorRangeSelection(vendor, startDateStr, endDateStr) {
  if (!startDateStr) return;
  let targetDates = [];
  let currentD = new Date(startDateStr + "T12:00:00");
  let endD = endDateStr ? new Date(endDateStr + "T12:00:00") : new Date(currentD);
  
  while (currentD <= endD) {
      targetDates.push(currentD.toISOString().split('T')[0]);
      currentD.setDate(currentD.getDate() + 1);
  }
  
  populateQuickBaseTabCore(targetDates, vendor);
}

function promptExportQuickBaseCSV() { exportQuickBaseCSVCore(false); }

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
function setupDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);
  
  // 5 Data Sync Windows (12am, 8am, 12pm, 4pm, 8pm)
  [0, 8, 12, 16, 20].forEach(hour => {
    ScriptApp.newTrigger('runMiddayAutomation').timeBased().atHour(hour).everyDays(1).create();
  });
  
  // Final EOD Compilation & Review: 4:30 PM (Special handling)
  ScriptApp.newTrigger('runEveningAutomation').timeBased().atHour(16).nearMinute(30).everyDays(1).create();
  
  // Cleanup at Midnight
  ScriptApp.newTrigger('moveIncomingFoldersToArchive').timeBased().atHour(0).everyDays(1).create();
  
  logMsg("✅ SIGNAL: Automatic sync triggers programmed for 12am, 8am, 12pm, 4pm, 8pm.");
  SpreadsheetApp.getUi().alert("✅ Daily Automations Updated: Syncs at 12AM, 8AM, 12PM, 4PM, 8PM.");
}

function runMiddayAutomation() {
  logMsg("🤖 STARTING MIDDAY AUTOMATION...");
  executeDailyAutomationPipeline();
  logMsg("✅ MIDDAY AUTOMATION COMPLETE.");
}

function runEveningAutomation() {
  logMsg("🤖 STARTING EVENING EOD AUTOMATION...");
  executeDailyAutomationPipeline();
  logMsg("✅ EVENING AUTOMATION COMPLETE.");
}

function executeDailyAutomationPipeline() {
  setupSheets();
  
  // 1. Run the resumable ingestion
  processIncomingForQuickBase(true); // Silent run
  
  // 2. Identify the target date for review (latest date in archive for today)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const histData = histSheet.getRange("A:A").getValues();
  let latestDate = new Date(0);
  let targetDateStr = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");

  for (let i = histData.length - 1; i >= Math.max(0, histData.length - 100); i--) {
    let d = histData[i][0];
    if (d instanceof Date && d > latestDate) {
      latestDate = d;
      targetDateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd");
    }
  }

  // 3. Finalize automation steps
  const refDict = getReferenceDictionary();
  generateDailyReviewCore(targetDateStr, refDict, true);
  
  // 🧠 Populate Export tab and generate the Daily Production CSV compilation
  populateQuickBaseTabCore(targetDateStr);
  exportQuickBaseCSVCore(true);
  
  // 🔍 Run Gap Scan to backfill any missing reports for the last 7 days
  backfillMissingReports();
}
function moveIncomingFoldersToArchive() { 
  logMsg("🧹 STARTING MIDNIGHT SWEEP..."); 
  let incIds = [INCOMING_FOLDER_ID, REFERENCE_FOLDER_ID];
  let arch = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);
  let count = 0;
  
  incIds.forEach(id => {
    let folders = DriveApp.getFolderById(id).getFolders();
    while (folders.hasNext()) {
      folders.next().moveTo(arch);
      count++;
    }
  });
  logMsg(`✅ MIDNIGHT SWEEP COMPLETE: Moved ${count} folders.`); 
}
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

  function removeDuplicatesFromArchive() {
 const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET); const data = sh.getDataRange().getValues(); const trueLastRow = getTrueLastDataRow(sh); if (trueLastRow < 2) return; const keys = new Set(); let rowsToDelete = []; for (let i = 1; i < trueLastRow; i++) { let cellDate = data[i][0]; let fdhId = String(data[i][2]).toUpperCase().trim(); let dateStr = ""; if (cellDate) { if (cellDate instanceof Date) { dateStr = Utilities.formatDate(cellDate, "GMT-5", "yyyy-MM-dd"); } else { let d = new Date(cellDate); if (!isNaN(d.getTime())) dateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd"); else dateStr = String(cellDate).trim(); } } let key = dateStr + "_" + fdhId; if (keys.has(key)) rowsToDelete.push(i + 1); else keys.add(key); } rowsToDelete.reverse(); let deleted = 0; rowsToDelete.forEach(r => { sh.deleteRow(r); deleted++; }); SpreadsheetApp.getUi().alert(`✅ Cleaned up ${deleted} duplicate rows from the Archive.`); }
function resetFileTags() { const resetFolder = (folderId) => { let folder = DriveApp.getFolderById(folderId); let files = folder.getFiles(); while (files.hasNext()) files.next().setDescription(""); let subs = folder.getFolders(); while (subs.hasNext()) resetFolder(subs.next().getId()); }; [ARCHIVE_FOLDER_ID, INCOMING_FOLDER_ID, REFERENCE_FOLDER_ID].forEach(id => resetFolder(id)); SpreadsheetApp.getUi().alert("Tags cleared for Archive, Incoming, and Production Incoming."); }
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
    return getDashboardDataV2();
  } catch (e) {
    logFrontendError("webAppTrigger3a Error: " + e.message);
    throw e;
  }
}

// 🧠 WEB APP BRIDGE: Logs the Admin Check permanently and cleans the Daily Review sheet instantly
function markAdminCheckComplete(fdhId) {
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v11_meta', 'dashboard_data_cache_v11', 'SIGNAL_FAST_current', 'dashboard_data_cache_v2_blob']);
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
                  
                  // 🚀 PATCH V2 PAYLOAD
                  patchDashboardPayloadV2(fdhId, { flags: newFlags, gaps: newGaps });
                  break;
              }
          }
      }
  }
  return dateStr;
}

function verifySpecialCrossings(fdhId) {
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v11_meta', 'dashboard_data_cache_v11', 'SIGNAL_FAST_current']);
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
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v11_meta', 'dashboard_data_cache_v11', 'SIGNAL_FAST_current', 'dashboard_data_cache_v2_blob']);
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

                  let newDraft = `QB marked as updated on ${dateStr}. Import new Reference Data to clear this flag.`;
                  if (draftIdx > -1) {
                      mirror.getRange(i+1, draftIdx+1).setValue(newDraft);
                  }
                  
                  // 🚀 PATCH V2 PAYLOAD
                  patchDashboardPayloadV2(fdhId, { flags: newFlags, draft: newDraft });
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

// ── SIGNAL CONSOLE DATA ──────────────────────────────────────

// Keep only meaningful field changes; drop noise like Engineering ID, Phase, Design-stage updates.
// Status/Stage/Stage Status rows must match an allowed pipeline value.
const SIGNAL_TRACKED_TYPES = ['status', 'stage', 'stage status', 'ofs date', 'cx start date', 'cx end date'];
const SIGNAL_ALLOWED_STAGE_VALUES = ['permitting', 'vendor assignment', 'cx', 'ofs'];
function _isSignalMilestone(type, newVal) {
  const t = (type || '').toLowerCase().trim();
  if (!SIGNAL_TRACKED_TYPES.includes(t)) return false;
  if (t === 'status' || t === 'stage' || t === 'stage status') {
    const v = (newVal || '').toLowerCase().trim();
    return SIGNAL_ALLOWED_STAGE_VALUES.some(k => v.includes(k));
  }
  return true;
}

function _normalizeSignalTimeframe(tf) {
  const raw = String(tf || '').toLowerCase().trim();
  if (raw === 'today') return 'current';
  if (raw === 'week' || raw === 'month' || raw === 'current') return raw;
  return 'week';
}

function _getCurrentSignalSnapshotStart(ss, now) {
  const currentNow = now instanceof Date ? new Date(now.getTime()) : new Date();
  let latestDate = null;

  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  if (histSheet && histSheet.getLastRow() > 1) {
    const startRow = Math.max(2, histSheet.getLastRow() - 99);
    const histData = histSheet.getRange(startRow, 1, histSheet.getLastRow() - startRow + 1, 1).getValues();
    for (let i = histData.length - 1; i >= 0; i--) {
      const cell = histData[i][0];
      if (cell instanceof Date && !isNaN(cell.getTime())) {
        latestDate = new Date(cell.getTime());
        break;
      }
    }
  }

  if (!latestDate) {
    const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
    if (mirrorSheet) {
      const mirrorDate = mirrorSheet.getRange("A2").getValue();
      if (mirrorDate instanceof Date && !isNaN(mirrorDate.getTime())) latestDate = new Date(mirrorDate.getTime());
    }
  }

  if (!latestDate) latestDate = currentNow;
  latestDate.setHours(0, 0, 0, 0);
  return latestDate;
}

function _getSignalCutoff(tf, ss, now) {
  const currentNow = now instanceof Date ? new Date(now.getTime()) : new Date();
  const timeframe = _normalizeSignalTimeframe(tf);
  
  // CURRENT: 24 hour rolling window from exactly now.
  if (timeframe === 'current') return new Date(currentNow.getTime() - 24 * 60 * 60 * 1000);
  
  if (timeframe === 'week') return new Date(currentNow.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (timeframe === 'month') return new Date(currentNow.getTime() - 30 * 24 * 60 * 60 * 1000);
  return new Date(0);
}

// Fast path: sheet reads only (~1-2s). Called first so QB + Log render immediately.
function getSignalFast(tf) {
  const timeframe = _normalizeSignalTimeframe(tf);
  const TTL_MAP = { current: 300, week: 900, month: 1800 };
  const cacheKey = 'SIGNAL_FAST_V2_' + timeframe;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const result = { qbChanges: [], systemLogs: [], topMovers: [] };
  const cutoff = _getSignalCutoff(tf, ss, now);

  const userStats = {}; // { userName: { count: 0, types: { type: count } } }

  // QB Changes from 10-Change_Log
  const changeSheet = ss.getSheetByName(CHANGE_LOG_SHEET);
  if (changeSheet && changeSheet.getLastRow() > 1) {
    const data = changeSheet.getDataRange().getValues();
    const headers = (data[0] || []).map(h => String(h || '').trim());
    const getIdxByAliases = (aliases) => headers.findIndex(function(h) {
      const normalized = String(h || '').trim().toUpperCase();
      return aliases.some(function(alias) { return normalized === alias; });
    });
    const resolveIdx = (aliases, fallbackIdx) => {
      const idx = getIdxByAliases(aliases);
      return idx > -1 ? idx : fallbackIdx;
    };
    const fdhIdx = resolveIdx(['FDH ENGINEERING ID', 'FDH ID', 'FDH'], 0);
    const typeIdx = resolveIdx(['TYPE OF CHANGE', 'CHANGE TYPE', 'TYPE'], 1);
    const valueIdx = resolveIdx(['NEW VALUE', 'VALUE'], 2);
    const userIdx = resolveIdx(['UPDATED BY', 'USER', 'USER NAME'], 3);
    const tsIdx = resolveIdx(['DATE & TIME UPDATED', 'TIMESTAMP', 'UPDATED AT', 'DATE UPDATED'], 4);
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const fdh = fdhIdx > -1 ? String(row[fdhIdx] || '').trim() : '';
      const changeType = typeIdx > -1 ? String(row[typeIdx] || '') : '';
      const rawVal = valueIdx > -1 ? row[valueIdx] : '';
      const userName = userIdx > -1 ? String(row[userIdx] || 'Unknown') : 'Unknown';
      let ts = tsIdx > -1 ? row[tsIdx] : '';
      
      // Robust timestamp handling: Support Date objects and strings
      if (!(ts instanceof Date) && ts) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) ts = d;
      }

      if (fdh && ts instanceof Date && ts >= cutoff && _isSignalMilestone(changeType, String(rawVal || ''))) {
        const isDateField = changeType.toLowerCase().trim().includes('date');
        
        const formattedVal = isDateField && rawVal instanceof Date
          ? Utilities.formatDate(rawVal, "GMT-5", "MM/dd/yyyy")
          : String(rawVal || '');

        result.qbChanges.push({
          fdh: fdh,
          type: changeType,
          newVal: formattedVal,
          updatedBy: userName,
          timestamp: Utilities.formatDate(ts, "GMT-5", "MM/dd/yy HH:mm")
        });

        // Collect stats for Top Movers
        if (!userStats[userName]) userStats[userName] = { count: 0, types: {} };
        userStats[userName].count++;
        userStats[userName].types[changeType] = (userStats[userName].types[changeType] || 0) + 1;
      }
    }
    result.qbChanges.reverse();

    // Calculate Top Movers (top 3)
    const sortedUsers = Object.keys(userStats).map(name => {
      const stats = userStats[name];
      const mostCommonType = Object.keys(stats.types).reduce((a, b) => stats.types[a] > stats.types[b] ? a : b);
      return { name, count: stats.count, primary: mostCommonType };
    }).sort((a, b) => b.count - a.count).slice(0, 3);
    
    result.topMovers = sortedUsers;
  }

  // System Logs from 4-System_Logs (last 50, newest first)
  const logSheet = ss.getSheetByName(LOG_SHEET);
  if (logSheet && logSheet.getLastRow() > 1) {
    const logData = logSheet.getDataRange().getValues();
    const rows = logData.slice(1).slice(-50).reverse();
    rows.forEach(row => {
      let ts = row[0];
      if (!(ts instanceof Date) && ts) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) ts = d;
      }
      result.systemLogs.push({
        timestamp: ts instanceof Date ? Utilities.formatDate(ts, "GMT-5", "MM/dd/yy HH:mm") : String(ts),
        message: String(row[1] || '')
      });
    });
  }

  try { cache.put(cacheKey, JSON.stringify(result), TTL_MAP[timeframe] || 300); } catch(e) {}
  return result;
}

// 📡 High-Resolution Portfolio Monitoring: Drive traversal with 10-min CacheService layer.
// CORE FEATURE: Provides real-time visibility into field documentation and changes.
function getSignalDrive(tf) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeframe = _normalizeSignalTimeframe(tf);
  const cacheKey = 'SIGNAL_DRIVE_' + timeframe;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  const now = new Date();
  const cutoff = _getSignalCutoff(timeframe, ss, now);

  const driveActivity = [];
  
  // HIGH-SIGNAL FOLDERS: BOMs and CDs/Permits
  const targetFolderIds = [
    { id: BOMS_FOLDER_ID, name: 'BOMs' },
    { id: CDS_PERMITS_FOLDER_ID, name: 'CDs_and_Permits' }
  ];

  targetFolderIds.forEach(target => {
    try {
      const folder = DriveApp.getFolderById(target.id);
      _collectDriveChanges(folder, target.name, cutoff, driveActivity, { count: 0 }, 0);
    } catch(e) { 
      logMsg('SIGNAL: Failed to scan ' + target.name + ' — ' + e.message); 
    }
  });

  try { cache.put(cacheKey, JSON.stringify(driveActivity), 600); } catch(e) {}
  return driveActivity;
}

// Recursive helper: walks folder tree depth-first, collecting files modified since cutoff.
// Caps at 150 results and depth 5 to prevent GAS timeout on large trees.
function _collectDriveChanges(folder, path, cutoff, out, counter, depth) {
  if (counter.count >= 150 || (depth || 0) > 5) return;

  // Since we start at the target folders, we descend into all subfolders
  // We only prune if the folder itself hasn't been updated since cutoff
  try {
    if (folder.getLastUpdated() < cutoff) {
      // In these specific folders, we STILL descend because sub-folder dates 
      // aren't always reliable for child file updates in real-time.
    }
  } catch(e) {}

  // Files in this folder
  const files = folder.getFiles();
  const found = [];
  while (files.hasNext() && counter.count < 150) {
    const file = files.next();
    if (file.getName().charAt(0) === '.') continue; // skip hidden/system files
    const lastUpdated = file.getLastUpdated();
    if (lastUpdated >= cutoff) {
      found.push({
        name: file.getName(),
        url: file.getUrl(),
        modified: Utilities.formatDate(lastUpdated, "GMT-5", "MM/dd/yy HH:mm")
      });
      counter.count++;
    }
  }
  if (found.length > 0) {
    out.push({ folder: path, folderUrl: folder.getUrl(), files: found });
  }

  // Recurse into subfolders — skip hidden folders (names starting with '.')
  const subs = folder.getFolders();
  while (subs.hasNext() && counter.count < 150) {
    const sub = subs.next();
    if (sub.getName().charAt(0) === '.') continue; // skip hidden folders (.playwright-mcp, .git, etc.)
    _collectDriveChanges(sub, path + ' / ' + sub.getName(), cutoff, out, counter, (depth || 0) + 1);
  }
}

/**
 * EMERGENCY TOOL: Ignores the "PROCESSED" tag and re-evaluates every file in the incoming folders.
 * Safe to run: The deduplication engine prevents duplicate rows in the Master Archive.
 */
function forceRescanIncoming() {
  logMsg("🆘 EMERGENCY: Starting Force Re-scan of Incoming folders...");
  setupSheets();
  const keys = getExistingKeys();
  const refDict = getReferenceDictionary();
  let newRowsAppended = [];
  let allProcessedDates = [];
  let allParsedRowsForQB = [];
  const startTime = new Date().getTime();

  const targetFolders = [REFERENCE_FOLDER_ID, INCOMING_FOLDER_ID];
  
  targetFolders.forEach(folderId => {
    try {
      let folder = DriveApp.getFolderById(folderId);
      // Pass 'false' for recursive to keep the emergency scan targeted
      processFolderRecursive(folder, keys, refDict, "", false, newRowsAppended, allProcessedDates, true, allParsedRowsForQB, startTime, false);
    } catch (e) {
      logMsg("⚠️ Emergency scan failed for folder " + folderId + ": " + e.message);
    }
  });

  // Cleanup
  populateQuickBaseTabDirectly(allParsedRowsForQB);
  autoArchiveProcessedFiles();
  
  logMsg("✅ EMERGENCY SCAN COMPLETE: Recovered " + newRowsAppended.length + " new rows.");
  SpreadsheetApp.getUi().alert("Emergency Scan Complete.\n\nRecovered " + newRowsAppended.length + " rows that were previously skipped.\nFiles have been archived.");
}

/**
 * Resets the INGESTION_IN_PROGRESS flag to allow new runs after a crash or cancellation.
 */
function resetIngestionLock() {
  PropertiesService.getScriptProperties().setProperty("INGESTION_IN_PROGRESS", "false");
  logMsg("🔓 MANUAL RESET: Ingestion lock has been cleared.");
  SpreadsheetApp.getUi().alert("🔓 Ingestion Lock Cleared.\n\nYou can now run 'Process Incoming' again.");
}

/**
 * 🔍 GAP SCAN: Compares Archive dates against existing reports in Drive.
 * Generates any missing Daily Production Reports for the last 7 days.
 */
function backfillMissingReports() {
  logMsg("🔍 STARTING: Missing Reports Gap Scan (7-Day Lookback)");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  if (!histSheet) return;

  // 1. Calculate 7-day cutoff
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  // 2. Get all unique dates from the Master Archive within the window
  const histData = histSheet.getRange("A:A").getValues();
  const archiveDates = new Set();
  histData.forEach((row, i) => {
    if (i === 0 || !row[0]) return;
    let dObj = (row[0] instanceof Date) ? row[0] : new Date(row[0]);
    if (isNaN(dObj.getTime())) return;
    
    if (dObj >= cutoffDate) {
      let dStr = Utilities.formatDate(dObj, "GMT-5", "M.d.yy");
      archiveDates.add(dStr);
    }
  });

  if (archiveDates.size === 0) {
    logMsg("✅ GAP SCAN: No archive data found in the last 7 days.");
    SpreadsheetApp.getUi().alert("Gap Scan Complete.\n\nNo production data found in the Master Archive for the last 7 days.");
    return;
  }

  // 3. Get existing reports from Pending and Uploaded folders
  const existingReports = new Set();
  const checkFolders = [COMPILED_FOLDER_ID, UPLOADED_FOLDER_ID];
  
  checkFolders.forEach(id => {
    try {
      let folder = DriveApp.getFolderById(id);
      let files = folder.getFiles();
      while (files.hasNext()) {
        let name = files.next().getName();
        // Match Daily_Production_Report_M.d.yy.csv or Daily_Production_Report_MM.dd.yy.csv
        let match = name.match(/Daily_Production_Report_(\d{1,2}\.\d{1,2}\.\d{2})\.csv/);
        if (match) existingReports.add(match[1]);
      }
    } catch(e) { logMsg(`⚠️ Gap Scan folder check failed (${id}): ${e.message}`); }
  });

  // 4. Identify gaps
  const missingDates = [...archiveDates].filter(d => !existingReports.has(d));

  if (missingDates.length === 0) {
    logMsg("✅ GAP SCAN COMPLETE: No missing reports found in the 7-day window.");
    SpreadsheetApp.getUi().alert("Gap Scan Complete.\n\nAll dates in the last 7 days already have a corresponding compiled report.");
    return;
  }

  logMsg(`🛠️ BACKFILL: Found ${missingDates.length} missing reports. Generating...`);

  // 5. Batch generate missing reports into 01_Pending_Upload
  missingDates.forEach(dStr => {
    try {
      // dStr is M.d.yy -> convert to yyyy-MM-dd for engine
      let parts = dStr.split('.');
      let isoDate = `20${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      
      populateQuickBaseTabCore(isoDate);
      exportQuickBaseCSVCore(true); // Silent run
      logMsg(`✅ Backfilled report for: ${dStr}`);
    } catch(e) {
      logMsg(`❌ Backfill failed for ${dStr}: ${e.message}`);
    }
  });

  logMsg(`✅ BACKFILL COMPLETE: Generated ${missingDates.length} reports.`);
  SpreadsheetApp.getUi().alert(`Backfill Complete.\n\nGenerated ${missingDates.length} missing reports into the 01_Pending_Upload folder.`);
}

/**
 * 🚀 V2 DECOUPLED PAYLOAD ENGINE
 * These functions allow the frontend to fetch its data directly from a JSON blob in Google Drive,
 * bypassing the slow SpreadsheetApp read cycle.
 */

/**
 * Returns the V2 dashboard payload from Google Drive.
 * @return {Object} The full dashboard payload JSON.
 */
function getDashboardDataV2() {
  const CACHE_KEY = 'dashboard_data_cache_v2_blob';
  const cache = CacheService.getScriptCache();
  
  // Try Cache First
  const cached = getChunkedCache(cache, CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      logMsg("⚠️ V2 Cache Parse Error: " + e.message);
    }
  }

  // Fallback to Drive
  try {
    const file = _getPayloadFileV2(false);
    if (!file) {
      logMsg("⚠️ V2 Payload File Not Found. Falling back to V1.");
      return getDashboardData();
    }

    const payloadStr = file.getBlob().getDataAsString();
    // Re-cache for future fast loads (30 mins)
    try { putChunkedCache(cache, CACHE_KEY, payloadStr, 1800); } catch(e) {}
    
    return JSON.parse(payloadStr);
  } catch (e) {
    logMsg("❌ V2 Payload Fetch Error: " + e.message);
    return getDashboardData(); // Ultimate fallback
  }
}

/**
 * Builds the V2 dashboard payload from in-memory engine data and saves it to Drive.
 * Called at the end of generateDailyReviewCore.
 */
function buildAndSaveDashboardPayloadV2(reviewData, headers, highlightsData) {
  try {
    logMsg("🔄 V2 PAYLOAD: Building JSON Blob from Engine Data...");
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const refDict = getReferenceDictionary();
    const vendorGoals = getVendorDailyGoals();
    const cityCoordinates = getCityCoordinates();
    const fiberStats = getVendorHybridStats();
    const logSheet = ss.getSheetByName(CHANGE_LOG_SHEET);
    
    const getIdx = name => headers.indexOf(name);
    const fdhIdx = getIdx("FDH Engineering ID"), flagsIdx = getIdx("Health Flags"), draftIdx = getIdx("Action Required");
    const vendorIdx = getIdx("Contractor"), statusIdx = getIdx("Status"), cityIdx = getIdx("City"), stageIdx = getIdx("Stage");
    const ofsIdx = headers.findIndex(h => ["OFS DATE", "BUDGET OFS"].includes(String(h || '').trim().toUpperCase()));
    const benchIdx = getIdx("Historical Milestones"), dateIdx = getIdx("Date");
    const targetIdx = getIdx("Target Completion Date"), cxStartIdx = getIdx("CX Start"), cxEndIdx = getIdx("CX Complete");
    const summaryIdx = getIdx("Field Production"), gapsIdx = getIdx("QB Context & Gaps");
    const bslsIdx = getIdx("BSLs"), lightIdx = getIdx("Light to Cabinets");
    const cdIntelIdx = getIdx("CD Intelligence"), geminiInsightIdx = getIdx("Gemini Insight"), geminiDateIdx = getIdx("Gemini Insight Date");
    const specXIdx = getIdx("Special Crossings?"), specXDetIdx = headers.indexOf("Special Crossing Details") > -1 ? headers.indexOf("Special Crossing Details") : headers.indexOf("Sepcial Crossings Details");
    const vcIdx = getIdx("Vendor Comment") > -1 ? getIdx("Vendor Comment") : getIdx("Construction Comments");
    const drgIdx = headers.findIndex(h => ["DRG", "DIRECT VENDOR"].includes(String(h || '').trim().toUpperCase()));
    const drgUrlIdx = headers.findIndex(h => ["DRG TRACKER URL", "TRACKER URL"].includes(String(h || '').trim().toUpperCase()));

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
        return ['true', '1', 'yes', 'y', 'checked', 'x', 'drg', 'direct vendor'].includes(normalized);
    };
    const parseDate = (val) => val ? ((val instanceof Date) ? Utilities.formatDate(val, "GMT-5", "MM-dd-yyyy") : String(val).split('T')[0]) : "";

    let globalLogs = [];
    if (logSheet && logSheet.getLastRow() > 1) {
      const logData = logSheet.getDataRange().getValues();
      for (let j = 1; j < logData.length; j++) {
        let timeVal = logData[j][4];
        let timeDisplay = (timeVal instanceof Date) ? Utilities.formatDate(timeVal, "GMT-6", "MM/dd/yyyy HH:mm") : String(timeVal || "");
        globalLogs.push({ fdh: String(logData[j][0] || ""), type: String(logData[j][1] || ""), val: String(logData[j][2] || ""), user: String(logData[j][3] || "System"), time: timeDisplay });
      }
    }

    let actionItems = [];
    reviewData.forEach((row, i) => {
      let hData = highlightsData[i];
      let fdhKey = String(row[fdhIdx] || "").trim().toUpperCase();
      let refData = refDict[fdhKey] || null;

      actionItems.push({
        fdh: fdhKey,
        vendor: String(row[vendorIdx] || ""),
        city: String(row[cityIdx] || ""),
        stage: String(row[stageIdx] || ""),
        status: String(row[statusIdx] || ""),
        bsls: String(row[bslsIdx] || "-"),
        isLight: isChecked(row[lightIdx]),
        canonicalOfsDate: String(row[ofsIdx] || ""),
        ofsDate: String(row[ofsIdx] || ""),
        reportDate: parseDate(row[dateIdx]),
        targetDate: parseDate(row[targetIdx]),
        cxStart: parseDate(row[cxStartIdx]),
        cxEnd: parseDate(row[cxEndIdx]),
        isXing: String(row[gapsIdx]).includes("X-ING YES"),
        gaps: String(row[gapsIdx] || ""),
        flags: String(row[flagsIdx] || ""),
        draft: String(row[draftIdx] || ""),
        fieldProduction: String(row[summaryIdx] || ""),
        bench: String(row[benchIdx] || ""),
        vendorComment: String(row[vcIdx] || ""),
        cdIntel: String(row[cdIntelIdx] || "").trim(),
        geminiInsight: String(row[geminiInsightIdx] || "").trim(),
        geminiDate: String(row[geminiDateIdx] || "").trim(),
        rawSpecialX: String(row[specXIdx] || "").trim(),
        specXDetails: String(row[specXDetIdx] || "").trim(),
        isTrackerLinked: String(row[summaryIdx]).includes("[📡 Tracker Linked]"),
        isDrgTracked: isChecked(row[drgIdx]) || (refData ? !!refData.isDrgTracked : false),
        rid: refData ? String(refData.rid || "") : "",
        qbRef: refData ? (refData.qbRef || {}) : {},
        vel: {
            ug: { tot: parseNum(row[ugTotIdx]), bom: parseNum(row[ugBomIdx]), daily: parseNum(row[ugDailyIdx]) },
            ae: { tot: parseNum(row[aeTotIdx]), bom: parseNum(row[aeBomIdx]), daily: parseNum(row[aeDailyIdx]) },
            fib: { tot: parseNum(row[fibTotIdx]), bom: parseNum(row[fibBomIdx]), daily: parseNum(row[fibDailyIdx]) },
            nap: { tot: parseNum(row[napTotIdx]), bom: parseNum(row[napBomIdx]), daily: parseNum(row[napDailyIdx]) }
        },
        rowNum: i + 2
      });
    });

    const payload = {
      actionItems: actionItems,
      globalLogs: globalLogs,
      vendorGoals: vendorGoals,
      vendorCities: buildVendorCityCoordinateRecords(actionItems, cityCoordinates),
      totalRows: reviewData.length,
      headers: headers,
      refDataDate: String(PropertiesService.getScriptProperties().getProperty('refDataImportDate') || ""),
      allFdhIds: Object.keys(refDict),
      fiberStats: fiberStats,
      generatedAt: new Date().toISOString()
    };

    const file = _getPayloadFileV2(true);
    file.setContent(JSON.stringify(payload));
    
    // Clear Cache to force fresh load
    CacheService.getScriptCache().remove('dashboard_data_cache_v2_blob');
    logMsg("✅ V2 PAYLOAD: Successfully saved to Drive.");
    return true;
  } catch (e) {
    logMsg("❌ V2 PAYLOAD ERROR: " + e.message);
    return false;
  }
}

/**
 * Patches a single record in the V2 payload.
 * Useful for fast UI updates (e.g., mark complete) without full engine run.
 */
function patchDashboardPayloadV2(fdhId, updates) {
  try {
    const file = _getPayloadFileV2(false);
    if (!file) return false;

    const payload = JSON.parse(file.getBlob().getDataAsString());
    const idx = payload.actionItems.findIndex(item => item.fdh.toUpperCase() === fdhId.toUpperCase());
    
    if (idx > -1) {
      Object.assign(payload.actionItems[idx], updates);
      file.setContent(JSON.stringify(payload));
      CacheService.getScriptCache().remove('dashboard_data_cache_v2_blob');
      return true;
    }
    return false;
  } catch (e) {
    logMsg("❌ V2 PATCH ERROR: " + e.message);
    return false;
  }
}

/**
 * Internal helper to find or create the payload file in App_Datastore.
 */
function _getPayloadFileV2(createIfMissing) {
  try {
    const folder = DriveApp.getFolderById(PAYLOAD_FOLDER_ID);
    const files = folder.getFilesByName(PAYLOAD_FILENAME);
    
    if (files.hasNext()) return files.next();
    
    if (createIfMissing) {
      return folder.createFile(PAYLOAD_FILENAME, "{}", MimeType.PLAIN_TEXT);
    }
    return null;
  } catch (e) {
    logMsg("❌ V2 FILE HELPER ERROR: " + e.message);
    return null;
  }
}

