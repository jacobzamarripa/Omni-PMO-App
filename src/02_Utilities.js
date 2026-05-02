/**
 * FILE: 02_Utilities.gs
 */

/**
 * Run from the GAS editor to audit how many history FDHs resolve to reference entries.
 * Forces a fresh refDict build (bypasses cache) before comparing.
 */
function runReferenceDiagnostic() {
  bumpEngineDictionaryCacheVersion();
  var refDict = getReferenceDictionary();
  var refKeys = Object.keys(refDict);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var histSheet = ss.getSheetByName(HISTORY_SHEET);
  if (!histSheet || histSheet.getLastRow() < 2) {
    Logger.log("REFERENCE DIAGNOSTIC: History sheet '" + HISTORY_SHEET + "' not found or empty.");
    return;
  }

  var histHeaders = histSheet.getRange(1, 1, 1, histSheet.getLastColumn()).getValues()[0];
  var fdhColIdx = histHeaders.indexOf("FDH Engineering ID");
  if (fdhColIdx < 0) {
    Logger.log("REFERENCE DIAGNOSTIC: 'FDH Engineering ID' column not found in history sheet.");
    return;
  }

  var histData = histSheet.getRange(2, 1, histSheet.getLastRow() - 1, histSheet.getLastColumn()).getValues();
  var formatRe = /^[A-Z]{3}\d{2,3}[a-z]?-F\d{2,4}$/i;

  var counts = { matched: 0, notInRef: 0, formatError: 0, empty: 0 };
  var notInRefIds = [];
  var formatErrorIds = [];

  histData.forEach(function(row) {
    var raw = row[fdhColIdx];
    if (!raw) { counts.empty++; return; }
    var id = _normalizeFdhId(raw);
    if (!id || id === "NAN" || id === "0") { counts.empty++; return; }
    if (!formatRe.test(id)) {
      counts.formatError++;
      if (formatErrorIds.indexOf(id) === -1) formatErrorIds.push(id);
      return;
    }
    if (refDict[id]) {
      counts.matched++;
    } else {
      counts.notInRef++;
      if (notInRefIds.indexOf(id) === -1) notInRefIds.push(id);
    }
  });

  var total = counts.matched + counts.notInRef + counts.formatError + counts.empty;
  var pct = function(n) { return total > 0 ? Math.round(n / total * 100) + "%" : "0%"; };

  var lines = [
    "=== REFERENCE DIAGNOSTIC ===",
    "RefDict size: " + refKeys.length + " keys",
    "RefDict sample: " + refKeys.slice(0, 8).join(", "),
    "History rows scanned: " + total,
    "MATCHED:          " + counts.matched     + " (" + pct(counts.matched)     + ")",
    "NOT_IN_REFERENCE: " + counts.notInRef    + " (" + pct(counts.notInRef)    + ")",
    "FORMAT_ERROR:     " + counts.formatError + " (" + pct(counts.formatError) + ")",
    "EMPTY:            " + counts.empty       + " (" + pct(counts.empty)       + ")",
    "",
    "NOT_IN_REFERENCE unique IDs (" + notInRefIds.length + "): " + notInRefIds.join(", "),
    "FORMAT_ERROR unique IDs (" + formatErrorIds.length + "): " + formatErrorIds.join(", "),
    "==========================="
  ];

  // Write to GAS execution log (visible in editor after running)
  lines.forEach(function(l) { Logger.log(l); });

  // Also append a summary row to the system log sheet for persistence
  logMsg("REFERENCE DIAGNOSTIC: matched=" + counts.matched + "/" + total +
    " | notInRef=" + counts.notInRef + " | formatErr=" + counts.formatError +
    " | unmatched IDs: " + notInRefIds.slice(0, 20).join(", "));
}

function getVendorHybridStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let stats = {};

  // 1. LIFETIME PASS (Authoritative Reference Data)
  const refSheet = ss.getSheetByName(REF_SHEET);
  if (refSheet && refSheet.getLastRow() > 1) {
    const data = refSheet.getDataRange().getValues();
    const headers = data[0];
    const contractorIdx = headers.findIndex(h => h && ["CX VENDOR", "CONTRACTOR", "VENDOR"].includes(h.trim().toUpperCase()));
    const fiberTotIdx = headers.findIndex(h => h && ["FIBER FOOTAGE", "TOTAL FIBER FOOTAGE COMPLETE", "FIBER FOOTAGE COMPLETE", "FIBER BOM QUANTITY"].includes(h.trim().toUpperCase()));
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
      .addItem('Process Incoming + Rebuild Dashboard', 'webAppProcessIncomingAndRebuild')
      .addItem('Load Specific Date to QB Tab', 'promptLoadSpecificDateToQB')
      .addItem('Load Vendor Range to QB Tab', 'promptLoadVendorRangeToQB')
      .addSeparator()
      .addItem('Sync QB + Rebuild Dashboard', 'syncAndRebuildDashboard')
      .addItem('Emergency: Force Re-scan All Files', 'forceRescanIncoming')
      .addItem('Force Re-scan + Rebuild Dashboard', 'webAppForceRescanAndRebuild')
      .addItem('Unlock Ingestion', 'resetIngestionLock')
    );

    main.addSubMenu(ui.createMenu('Review Engine')
      .addItem('Generate Daily Review', 'promptGenerateDailyReview')
      .addItem('Refresh Dashboard Payload', 'getDashboardDataV2')
      .addItem('Commit Review to Archive & QB', 'commitReviewToArchiveAndQB')
    );

    main.addSubMenu(ui.createMenu('Quickbase Hub')
      .addItem('1. Import Reference Data (CSV/Drive)', 'importReferenceData')
      .addItem('2. Sync Projects from Quickbase (API)', 'importFDHProjects')
      .addItem('Discover Dependency Fields', 'discoverDependencyFields')
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
      .addItem('Heal Master Archive Alignment', 'healMasterArchiveAlignment')
      .addItem('Audit Master Archive (vs Backup)', 'promptAuditArchive')
      .addItem('Backup Master Archive (CSV)', 'backupMasterArchiveToCSV')
      .addSeparator()
      .addItem('Configure Daily Automations', 'setupDailyTrigger')
      .addItem('Refresh Styles & Checkboxes', 'applyFormatting')
      .addItem('Clear Processed File Tags', 'resetFileTags')
      .addItem('Clean Archive Duplicates', 'removeDuplicatesFromArchive')
      .addItem('Clean Archive Duplicates + Refresh Dashboard', 'webAppRemoveDuplicatesAndRefresh')
      .addItem('Repair Legacy Auto-Fixed FDHs', 'webAppRepairLegacyAutoFixedFdhs')
      .addItem('Report Blocked Auto-Matches', 'reportLegacyBlockedAutoMatches')
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
      let cellStr = (cell instanceof Date) ? Utilities.formatDate(cell, "GMT-5", "MM/dd/yy HH:mm") : cell.toString();
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

function _getPortfolioVisibilityMeta(input) {
  return VisibilityEngine.getPortfolioStatus(input);
}

function _isStaleOfsItem(stage, status, vendor, flags, primaryOfsDate, fallbackOfsDate, reportDate) {
  const meta = VisibilityEngine.getPortfolioStatus({
    stage: stage,
    status: status,
    vendor: vendor,
    flags: flags,
    primaryOfsDate: primaryOfsDate,
    fallbackOfsDate: fallbackOfsDate,
    reportDate: reportDate
  });
  return meta.isTerminalGraceOnly && !meta.includeInPortfolio;
}

function _buildReferenceConfidenceMeta(input) {
  const flagsStr = String((input && input.flags) || '').toUpperCase();
  const hasReferencePresence = !!(input && input.hasReferencePresence) && !flagsStr.includes('NOT IN QB REFERENCE');
  const hasCurrentStatus = !flagsStr.includes('MISSING QB STATUS');
  const hasFreshReferenceState = !flagsStr.includes('STATUS MISMATCH') && !flagsStr.includes('ADMIN: REFRESH REF DATA');
  const hasRid = !!String((input && input.rid) || '').trim();
  const hasSow = !!(input && input.hasSOW);
  const hasCd = !!(input && ((input.hasCDDel) || (input.hasCDDist)));
  const hasBom = !!(input && ((input.hasBOMDel) || (input.hasBOMPo)));
  const hasInferredState = flagsStr.includes('INFERRED:') || flagsStr.includes('LIKELY OFS');
  const hasInferredDates = !!String((input && input.cxInferred) || '').trim();

  let score = 0;
  if (hasReferencePresence) score += 50;
  if (hasCurrentStatus) score += 20;
  if (hasFreshReferenceState) score += 10;
  if (hasRid) score += 8;
  if (hasSow) score += 4;
  if (hasCd) score += 4;
  if (hasBom) score += 4;
  if (hasInferredState) score -= 12;
  if (hasInferredDates) score -= 6;

  let tier = 'weak';
  if (score >= 75) tier = 'strong';
  else if (score >= 40) tier = 'partial';

  return { score: score, tier: tier };
}

function _createDashboardPayloadFieldAccessors(headers) {
  const adapter = createSchemaAdapter(headers);
  const getIdx = (name, opts) => adapter.getIdx(name, opts);

  return {
    headers: headers,
    getIdx: getIdx,
    fdhIdx: getIdx("FDH"),
    flagsIdx: getIdx("Health Flags"),
    draftIdx: getIdx("Action Required"),
    vendorIdx: getIdx("CONTRACTOR"),
    statusIdx: getIdx("Status"),
    cityIdx: getIdx("CITY"),
    stageIdx: getIdx("STAGE"),
    ofsIdx: getIdx("OFS"),
    benchIdx: getIdx("Historical Milestones"),
    dateIdx: getIdx("DATE"),
    targetIdx: getIdx("Target Completion Date"),
    cxStartIdx: getIdx("CX Start"),
    cxEndIdx: getIdx("CX_COMPLETE"),
    cxInferredIdx: getIdx("CX Inferred"),
    summaryIdx: getIdx("Field Production"),
    gapsIdx: getIdx("QB Context & Gaps"),
    bslsIdx: getIdx("BSL"),
    lightIdx: getIdx("Light to Cabinets"),
    cdIntelIdx: getIdx("CD Intelligence"),
    geminiInsightIdx: getIdx("Gemini Insight"),
    geminiDateIdx: getIdx("Gemini Insight Date"),
    specXIdx: getIdx("Special Crossings?", { aliases: ["Xing?"] }),
    specXDetIdx: getIdx("Special Crossing Details", { aliases: ["Sepcial Crossings Details", "Xing Details"] }),
    vcIdx: getIdx("COMMENT"),
    drgIdx: getIdx("DRG"),
    drgUrlIdx: getIdx("DRG_URL"),
    allVendorsIdx: getIdx("AllVendors"),
    ugTotIdx: getIdx("Total UG Footage Completed"),
    ugBomIdx: getIdx("BOM_UG"),
    ugDailyIdx: getIdx("Daily UG Footage"),
    aeTotIdx: getIdx("Total Strand Footage Complete?"),
    aeBomIdx: getIdx("BOM_AE"),
    aeDailyIdx: getIdx("Daily Strand Footage"),
    fibTotIdx: getIdx("Total Fiber Footage Complete"),
    fibBomIdx: getIdx("BOM_FIB"),
    fibDailyIdx: getIdx("Daily Fiber Footage"),
    napTotIdx: getIdx("Total NAPs Completed"),
    napBomIdx: getIdx("BOM_NAP"),
    napDailyIdx: getIdx("Daily NAPs/Encl. Completed")
  };
}

function _dashboardParseNumber(val) {
  if (val == null || val === "") return 0;
  if (typeof val === 'number') return val;
  let match = String(val).split('(')[0].replace(/,/g, '').trim().match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function _dashboardIsChecked(val) {
  if (val === true) return true;
  let normalized = String(val || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'checked', 'x', 'drg', 'direct vendor', 'tracked'].includes(normalized);
}

function _dashboardParseDate(val) {
  if (!val || val === "" || val === "-") return "";
  if (val instanceof Date) return Utilities.formatDate(val, "GMT-5", "MM/dd/yy");
  let s = String(val).trim();
  let mIso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (mIso) return `${mIso[2].padStart(2,'0')}/${mIso[3].padStart(2,'0')}/${mIso[1].substring(2)}`;
  let mUs = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if (mUs) {
    let yr = mUs[3].length === 4 ? mUs[3].substring(2) : mUs[3];
    return `${mUs[1].padStart(2,'0')}/${mUs[2].padStart(2,'0')}/${yr}`;
  }
  let d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, "GMT-5", "MM/dd/yy");
  return s;
}

function _buildSyntheticAdminGaps(refData) {
  refData = refData || {};
  let xingString = "X-ING UNCHECKED";
  const xingVal = String(refData.rawSpecialX || "").trim().toLowerCase();
  if (xingVal === "yes" || xingVal === "true") xingString = "X-ING YES";
  else if (xingVal === "no" || xingVal === "false") xingString = "X-ING CLEAR";
  let hasBeenChecked = refData.adminDate && refData.adminDate !== "";
  let adminDateStr = hasBeenChecked ? `[Chk: ${refData.adminDate}]` : `[Chk: NEVER]`;
  return `${adminDateStr}  |  ${refData.hasSOW ? "SOW" : "SOW"}  ${refData.hasCD ? "CD" : "CD"}  ${refData.hasBOM ? "BOM" : "BOM"}  |  ${xingString}`;
}

function _buildDashboardOverlayIndex(rows, fieldMap) {
  const overlayMap = {};
  (rows || []).forEach(function(row, idx) {
    const fdh = fieldMap.fdhIdx > -1 ? String(row[fieldMap.fdhIdx] || "").trim().toUpperCase() : "";
    if (!fdh) return;
    overlayMap[fdh] = {
      row: row,
      rowNum: idx + 2
    };
  });
  return overlayMap;
}

function _stripReportingFlags(flags, preserveUpcoming) {
  const lines = String(flags || "")
    .split("\n")
    .map(function(line) { return String(line || "").trim(); })
    .filter(Boolean);

  return lines.filter(function(line) {
    const up = line.toUpperCase();
    if (preserveUpcoming && up === "UPCOMING START WINDOW") return true;
    return (
      up !== "MISSING DAILY REPORT" &&
      up !== "REPORT PENDING" &&
      up !== "WEEKEND CARRY" &&
      !up.includes("STALE REPORT")
    );
  }).join("\n").trim();
}

function _deriveReportingStatusFromFlags(flags) {
  const up = String(flags || "").toUpperCase();
  if (up.includes("UPCOMING START WINDOW")) return "upcoming";
  if (up.includes("MISSING DAILY REPORT")) return "missing";
  if (up.includes("REPORT PENDING") || up.includes("WEEKEND CARRY")) return "pending";
  if (up.includes("STALE REPORT")) return "stale";
  return "current";
}

function _buildProjectSearchCatalog(options) {
  options = options || {};
  const headers = options.headers || [];
  const rows = options.rows || [];
  const refDict = options.refDict || {};
  const fieldMap = _createDashboardPayloadFieldAccessors(headers);
  const overlayMap = _buildDashboardOverlayIndex(rows, fieldMap);
  const searchProjects = [];

  Object.keys(refDict).forEach(function(fdhKey) {
    const refData = refDict[fdhKey] || {};
    const overlay = overlayMap[fdhKey] || null;
    const row = overlay ? overlay.row : [];
    const getRowVal = function(idx, fallback) {
      if (idx > -1 && row && row.length > idx) {
        const val = row[idx];
        if (val !== "" && val != null) return val;
      }
      return fallback;
    };

    const rawStage = String(getRowVal(fieldMap.stageIdx, refData.stage || "") || "");
    const rawStatus = String(getRowVal(fieldMap.statusIdx, refData.status || "") || "");
    const rawFlags = String(getRowVal(fieldMap.flagsIdx, "") || "");
    const vendorName = String(getRowVal(fieldMap.vendorIdx, refData.vendor || "") || "").trim();
    const cityName = String(getRowVal(fieldMap.cityIdx, refData.city || "") || "").trim();
    const rawTargetDate = getRowVal(fieldMap.targetIdx, refData.canonicalOfsDate || refData.forecastedOFS || "");
    const rawCxStart = getRowVal(fieldMap.cxStartIdx, refData.cxStart || "");
    const rawCxEnd = getRowVal(fieldMap.cxEndIdx, refData.cxComplete || "");
    const rawReportDate = getRowVal(fieldMap.dateIdx, "");
    const rawMirrorOfsDate = getRowVal(fieldMap.ofsIdx, "");
    const milestonesRaw = String(getRowVal(fieldMap.benchIdx, "") || "");
    const portfolioMeta = _getPortfolioVisibilityMeta({
      stage: rawStage,
      status: rawStatus,
      vendor: vendorName,
      flags: rawFlags,
      primaryOfsDate: refData.canonicalOfsDate || refData.forecastedOFS || "",
      fallbackOfsDate: rawMirrorOfsDate,
      targetDate: rawTargetDate,
      cxStart: rawCxStart,
      reportDate: rawReportDate,
      hasHistory: !!overlay
    });
    const hasHandoff = milestonesRaw.includes("HANDOFF");
    const visibleInPortfolio = portfolioMeta.includeInPortfolio || hasHandoff;

    searchProjects.push({
      fdh: fdhKey,
      vendor: vendorName,
      city: cityName,
      stage: rawStage,
      status: rawStatus,
      flags: rawFlags,
      draft: String(getRowVal(fieldMap.draftIdx, "") || ""),
      vendorComment: String(getRowVal(fieldMap.vcIdx, "") || ""),
      fieldProduction: String(getRowVal(fieldMap.summaryIdx, "") || ""),
      reportDate: _dashboardParseDate(rawReportDate),
      targetDate: _dashboardParseDate(rawTargetDate),
      cxStart: _dashboardParseDate(rawCxStart),
      cxEnd: _dashboardParseDate(rawCxEnd),
      ofsDate: _dashboardParseDate(rawMirrorOfsDate || refData.canonicalOfsDate || refData.forecastedOFS || ""),
      rawReferenceOfsDate: String(refData.canonicalOfsDate || refData.forecastedOFS || "").trim(),
      portfolioEligibilityReason: portfolioMeta.reason,
      searchOnlySuppressed: !visibleInPortfolio
    });
  });

  return searchProjects;
}

function _buildPortfolioActionItems(options) {
  options = options || {};
  const headers = options.headers || [];
  const rows = options.rows || [];
  const refDict = options.refDict || {};
  const fiberStats = options.fiberStats || {};
  const defaultDrgTrackerUrl = options.defaultDrgTrackerUrl || "";
  const includeSuppressed = !!options.includeSuppressed;
  const requestedFdh = String(options.fdhFilter || "").trim().toUpperCase();
  const fieldMap = _createDashboardPayloadFieldAccessors(headers);
  const overlayMap = _buildDashboardOverlayIndex(rows, fieldMap);
  const actionItems = [];

  Object.keys(refDict).forEach(function(fdhKey) {
    if (requestedFdh && fdhKey !== requestedFdh) return;
    const refData = refDict[fdhKey] || {};
    const overlay = overlayMap[fdhKey] || null;
    const row = overlay ? overlay.row : [];
    const getRowVal = function(idx, fallback) {
      if (idx > -1 && row && row.length > idx) {
        const val = row[idx];
        if (val !== "" && val != null) return val;
      }
      return fallback;
    };

    const rawFlags = String(getRowVal(fieldMap.flagsIdx, "") || "");
    const rawStage = String(getRowVal(fieldMap.stageIdx, refData.stage || "") || "");
    const rawStatus = String(getRowVal(fieldMap.statusIdx, refData.status || "") || "");
    const rawTargetDate = getRowVal(fieldMap.targetIdx, refData.canonicalOfsDate || refData.forecastedOFS || "");
    const rawCxStart = getRowVal(fieldMap.cxStartIdx, refData.cxStart || "");
    const rawReportDate = getRowVal(fieldMap.dateIdx, "");
    const vendorName = String(getRowVal(fieldMap.vendorIdx, refData.vendor || "") || "").trim();
    const portfolioMeta = _getPortfolioVisibilityMeta({
      stage: rawStage,
      status: rawStatus,
      vendor: vendorName,
      flags: rawFlags,
      primaryOfsDate: refData.canonicalOfsDate || refData.forecastedOFS || "",
      fallbackOfsDate: getRowVal(fieldMap.ofsIdx, refData.canonicalOfsDate || refData.forecastedOFS || ""),
      targetDate: rawTargetDate,
      cxStart: rawCxStart,
      reportDate: rawReportDate,
      hasHistory: !!overlay
    });
    const milestonesRaw = String(getRowVal(fieldMap.benchIdx, "") || "");
    const hasHandoff = milestonesRaw.includes("HANDOFF");
    const visibleInPortfolio = portfolioMeta.includeInPortfolio || hasHandoff;
    if (!visibleInPortfolio && !includeSuppressed) return;

    const rawMirrorOfsDate = _dashboardParseDate(getRowVal(fieldMap.ofsIdx, ""));
    const rawReferenceOfsDate = String(refData.canonicalOfsDate || refData.forecastedOFS || "").trim();
    const normalizedCanonicalOfsDate = _dashboardParseDate(rawReferenceOfsDate);

    let currentFlags = rawFlags;
    let draft = String(getRowVal(fieldMap.draftIdx, "") || "");
    let fieldProduction = String(getRowVal(fieldMap.summaryIdx, "") || "");
    let vendorComment = String(getRowVal(fieldMap.vcIdx, "") || "");
    let reportingStatus = _deriveReportingStatusFromFlags(currentFlags);

    if (portfolioMeta.reason === 'approved-upcoming-60d' || portfolioMeta.reason === 'active-upcoming-start') {
      currentFlags = _stripReportingFlags(currentFlags, true);
      currentFlags = currentFlags ? ("UPCOMING START WINDOW\n" + currentFlags) : "UPCOMING START WINDOW";
      draft = "Action: Monitor schedule. Approved project is inside the rolling 60-day horizon and not expected to report yet.";
      fieldProduction = fieldProduction || "No reporting history yet. Upcoming within the 60-day planning window.";
      vendorComment = vendorComment || "Approved upcoming project inside the 60-day planning window.";
      reportingStatus = "upcoming";
    } else if (portfolioMeta.reason === 'active-start-grace' || portfolioMeta.reason === 'reported-start-grace') {
      currentFlags = _stripReportingFlags(currentFlags, false);
      currentFlags = currentFlags ? ("REPORT PENDING\n" + currentFlags) : "REPORT PENDING";
      draft = "Action: Monitor start. First daily report is expected on the next business day after CX Start.";
      fieldProduction = fieldProduction || "Start-day grace window active. First daily report is not due until the next business day.";
      vendorComment = vendorComment || "First daily report is due on the next business day after CX Start.";
      reportingStatus = "pending";
    } else if (!portfolioMeta.expectDailyReport) {
      currentFlags = _stripReportingFlags(currentFlags, false);
      if (!overlay && portfolioMeta.isTerminalGraceOnly) {
        if (visibleInPortfolio) {
          fieldProduction = fieldProduction || "Terminal project remains visible during the portfolio grace window.";
          vendorComment = vendorComment || "Visible in Active Portfolio through grace window.";
        } else {
          fieldProduction = fieldProduction || "Terminal project is excluded from Active Portfolio but remains available through explicit search.";
          vendorComment = vendorComment || "Search-only project outside the Active Portfolio grace window.";
        }
      }
      reportingStatus = "current";
    } else if (!overlay) {
      currentFlags = "MISSING DAILY REPORT";
      draft = "Action: Contact Vendor. Active project with no submission history. Verify if Field CX has started.";
      fieldProduction = "No daily report history found.";
      vendorComment = "Missing daily report.";
      reportingStatus = "missing";
    }

    // 🧠 HANDOFF PERSISTENCE: Ensure dated flags and diagnostic notes survive the overrides above
    if (hasHandoff) {
        let handoffMatch = milestonesRaw.match(/(\d{2}\/\d{2}\/\d{2}): HANDOFF: (.*)/);
        if (handoffMatch) {
            let fullDate = handoffMatch[1];
            let dateParts = fullDate.split('/');
            let mmDd = (dateParts.length >= 2) ? (dateParts[0] + '/' + dateParts[1]) : fullDate;
            let handoffDetail = handoffMatch[2];
            let handoffFlag = `HANDOFF (${mmDd})`;
            let handoffNote = `Project handoff detected on ${mmDd} (${handoffDetail}).`;

            // Ensure flag is in currentFlags and has the date
            if (!currentFlags.includes("HANDOFF")) {
                currentFlags = (currentFlags && currentFlags !== "No Anomalies") ? (currentFlags + "\n" + handoffFlag) : handoffFlag;
            } else if (!currentFlags.includes("(")) {
                // If generic HANDOFF exists, swap it for the dated one
                currentFlags = currentFlags.split("\n").map(function(f) { return f.trim() === "HANDOFF" ? handoffFlag : f; }).join("\n");
            }
            
            // Ensure note is in draft
            if (!draft.includes("handoff detected")) {
                draft = (draft ? draft + "\n" : "") + handoffNote;
            }
        }
    }

    const stageStr = rawStage.toUpperCase();
    const statusStr = rawStatus.toUpperCase();

    // 🧠 HOLD OVERRIDE: If the project is on hold, it suppresses all other flags
    const isHold = statusStr.includes('HOLD') || stageStr.includes('HOLD');
    if (isHold) {
      currentFlags = "ON HOLD";
      draft = "Project is currently on hold.";
    }

    const qbFinished = !!(
      String(refData.status || "").toUpperCase().includes("COMPLETE") ||
      String(refData.stage || "").toUpperCase().includes("OFS")
    );
    const isFinished = qbFinished || stageStr.includes("OFS") || stageStr.includes("COMPLETE") || statusStr.includes("OOS") || currentFlags.includes("LIKELY OFS");
    if (isFinished) {
      currentFlags = ReconciliationEngine.filterIrrelevantRisks(currentFlags, rawStage, rawStatus);
    }


    let safeRawRow = [];
    if (overlay && row) {
      safeRawRow = row.map(function(cell, idx) {
        let val = cell;
        if (cell instanceof Date) {
          val = !isNaN(cell.getTime()) ? cell.toISOString() : "";
        } else {
          val = String(cell || "");
        }
        return { h: headers[idx], v: val };
      }).filter(function(entry) { return entry.v !== ""; });
    }

    const vStats = fiberStats[vendorName] || { lifetime: { miles: 0 } };
    const fieldProductionText = fieldProduction || "";
    const mirrorTrackerLinked = fieldProductionText.includes("[📡 Tracker Linked]") || fieldProductionText.includes("[Tracker Linked]");
    const mirrorDrgTracked = _dashboardIsChecked(getRowVal(fieldMap.drgIdx, false));
    const mirrorDrgTrackerUrl = String(getRowVal(fieldMap.drgUrlIdx, "") || "").trim();
    const lastReportDate = _dashboardParseDate(rawReportDate);
    const referenceMeta = _buildReferenceConfidenceMeta({
      flags: currentFlags,
      hasReferencePresence: !!refData,
      rid: refData.rid || "",
      hasSOW: refData.hasSOW,
      hasCDDel: refData.hasCDDel,
      hasCDDist: refData.hasCDDist,
      hasBOMDel: refData.hasBOMDel,
      hasBOMPo: refData.hasBOMPo,
      cxInferred: getRowVal(fieldMap.cxInferredIdx, "")
    });

    const rawAllVendors = String(getRowVal(fieldMap.allVendorsIdx, "") || "").split(",").map(function(v) { return v.trim(); }).filter(Boolean);
    let allVendors = (rawAllVendors.length > 0) ? rawAllVendors : [vendorName];
    
    // Safety check: ensure current vendor is always in the list
    if (vendorName && !allVendors.includes(vendorName)) allVendors.unshift(vendorName);

    actionItems.push({
      fdh: fdhKey,
      vendor: vendorName,
      allVendors: allVendors,
      city: String(getRowVal(fieldMap.cityIdx, refData.city || "") || ""),
      stage: rawStage,
      status: rawStatus,
      bsls: String(getRowVal(fieldMap.bslsIdx, refData.bsls || "-") || "-"),
      isLight: _dashboardIsChecked(getRowVal(fieldMap.lightIdx, false)),
      canonicalOfsDate: normalizedCanonicalOfsDate,
      ofsDate: normalizedCanonicalOfsDate,
      isStaleOfs: _isStaleOfsItem(rawStage, rawStatus, vendorName, currentFlags, normalizedCanonicalOfsDate, rawMirrorOfsDate, rawReportDate),
      rawMirrorOfsDate: rawMirrorOfsDate,
      reportDate: lastReportDate,
      targetDate: _dashboardParseDate(rawTargetDate),
      cxStart: _dashboardParseDate(rawCxStart),
      cxEnd: _dashboardParseDate(getRowVal(fieldMap.cxEndIdx, refData.cxComplete || "")),
      cxInferred: String(getRowVal(fieldMap.cxInferredIdx, "") || ""),
      isXing: String(getRowVal(fieldMap.gapsIdx, refData.isSpecialX ? "X-ING YES" : "") || "").includes("X-ING YES") || !!refData.isSpecialX || currentFlags.includes("CD: MAJOR CROSSING RISK") || String(getRowVal(fieldMap.cdIntelIdx, "") || "").trim() !== "",
      gaps: String(getRowVal(fieldMap.gapsIdx, _buildSyntheticAdminGaps(refData)) || ""),
      flags: currentFlags,
      draft: draft,
      fieldProduction: fieldProductionText,
      bench: String(getRowVal(fieldMap.benchIdx, "No history logged.") || ""),
      vendorComment: vendorComment,
      cdIntel: String(getRowVal(fieldMap.cdIntelIdx, "") || "").trim(),
      geminiInsight: String(getRowVal(fieldMap.geminiInsightIdx, refData.geminiInsight || "") || "").trim(),
      geminiDate: String(getRowVal(fieldMap.geminiDateIdx, refData.geminiDate || "") || "").trim(),
      rawSpecialX: String(getRowVal(fieldMap.specXIdx, refData.rawSpecialX || "") || "").trim(),
      specXDetails: String(getRowVal(fieldMap.specXDetIdx, refData.specXDetails || "") || "").trim(),
      isTrackerLinked: mirrorTrackerLinked,
      isDrgTracked: mirrorDrgTracked || !!refData.isDrgTracked,
      drgTrackerUrl: mirrorDrgTrackerUrl || String(refData.drgTrackerUrl || "") || defaultDrgTrackerUrl,
      rid: String(refData.rid || ""),
      hasBOMDel: !!refData.hasBOMDel,
      hasSpliceDel: !!refData.hasSpliceDel,
      hasStandDel: !!refData.hasStandDel,
      hasCDDel: !!refData.hasCDDel,
      hasSpliceDist: !!refData.hasSpliceDist,
      hasStrandDist: !!refData.hasStrandDist,
      hasCDDist: !!refData.hasCDDist,
      hasBOMPo: !!refData.hasBOMPo,
      hasSOW: !!refData.hasSOW,
      rawReferenceOfsDate: rawReferenceOfsDate,
      ofsDateMismatch: !!(rawMirrorOfsDate && normalizedCanonicalOfsDate && rawMirrorOfsDate !== normalizedCanonicalOfsDate),
      referenceConfidenceScore: referenceMeta.score,
      referenceConfidenceTier: referenceMeta.tier,
      portfolioEligibilityReason: portfolioMeta.reason,
      portfolioGraceUntil: portfolioMeta.graceUntil ? portfolioMeta.graceUntil.toISOString() : "",
      reportingStatus: reportingStatus,
      lastReportDate: lastReportDate,
      searchOnlySuppressed: !visibleInPortfolio,
      qbRef: refData.qbRef || {},
      fiberTotalMiles: Number(Number((vStats.lifetime && vStats.lifetime.miles) || 0).toFixed(2)),
      vel: {
        ug: { tot: _dashboardParseNumber(getRowVal(fieldMap.ugTotIdx, 0)), bom: refData.ugBOM > 0 ? refData.ugBOM : _dashboardParseNumber(getRowVal(fieldMap.ugBomIdx, 0)), daily: _dashboardParseNumber(getRowVal(fieldMap.ugDailyIdx, 0)) },
        ae: { tot: _dashboardParseNumber(getRowVal(fieldMap.aeTotIdx, 0)), bom: refData.aeBOM > 0 ? refData.aeBOM : _dashboardParseNumber(getRowVal(fieldMap.aeBomIdx, 0)), daily: _dashboardParseNumber(getRowVal(fieldMap.aeDailyIdx, 0)) },
        fib: { tot: _dashboardParseNumber(getRowVal(fieldMap.fibTotIdx, 0)), bom: refData.fibBOM > 0 ? refData.fibBOM : _dashboardParseNumber(getRowVal(fieldMap.fibBomIdx, 0)), daily: _dashboardParseNumber(getRowVal(fieldMap.fibDailyIdx, 0)) },
        nap: { tot: _dashboardParseNumber(getRowVal(fieldMap.napTotIdx, 0)), bom: refData.napBOM > 0 ? refData.napBOM : _dashboardParseNumber(getRowVal(fieldMap.napBomIdx, 0)), daily: _dashboardParseNumber(getRowVal(fieldMap.napDailyIdx, 0)) }
      },
      rawRow: safeRawRow,
      rowNum: overlay ? overlay.rowNum : 0
    });
  });

  return actionItems;
}

/**
 * Injects an external finding (e.g. from CD Ingestion) into the Committed Reviews queue.
 * @param {Object} data - { fdh, xing, xingDetails, verifiedDate }
 */
function stageExternalFinding(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let commitSheet = ss.getSheetByName(REVIEW_LOG_SHEET);
  if (!commitSheet) {
    commitSheet = ss.insertSheet(REVIEW_LOG_SHEET);
    commitSheet.appendRow(["FDH Engineering ID", "Special Crossings?", "Special Crossing Details", "Verified Date", "Committed Date", "Committed By", "QB Sync Status", "QB Sync Date"]);
    commitSheet.getRange("1:1").setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
    commitSheet.setFrozenRows(1);
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
  const userEmail = Session.getActiveUser().getEmail();

  commitSheet.appendRow([
    data.fdh,
    data.xing || "",
    data.xingDetails || "",
    data.verifiedDate || "",
    timestamp,
    userEmail,
    "Pending",
    ""
  ]);

  logMsg(`External finding staged for ${data.fdh} by ${userEmail}`);
  return { success: true };
}
function getDashboardData() {
  const CACHE_KEY = 'dashboard_data_cache_v13';
  const cache = CacheService.getScriptCache();
  const cached = getChunkedCache(cache, CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  const refDict = getReferenceDictionary();
  const vendorGoals = getVendorDailyGoals();
  const cityCoordinates = getCityCoordinates();
  const fiberStats = getVendorHybridStats();
  const data = (mirrorSheet && mirrorSheet.getLastRow() > 0) ? mirrorSheet.getDataRange().getValues() : [];
  const headers = data.length > 0 ? data[0].map(String) : [];
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
          const dm = Utilities.formatDate(timeVal, "GMT-6", "MM/dd/yy");
          if (hm === "00:00") {
              // QB date-only field (midnight CST) → normalize to UTC midnight so
              // the frontend isMidnightUTC check suppresses the time display.
              const p = dm.split('/');
              let yr = p[2].length === 2 ? parseInt('20' + p[2], 10) : parseInt(p[2], 10);
              logTime = new Date(Date.UTC(yr, parseInt(p[0]) - 1, parseInt(p[1])));
              timeDisplay = dm;
          } else {
              logTime = new Date(timeVal.getTime());
              timeDisplay = dm + " " + hm;
          }
      } else {
          const s = String(timeVal || '').trim();
          // Date-only strings (MM/dd/yy or MM/dd/yy) are parsed as UTC midnight to prevent TZ drift.
          const dateOnly = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
          if (dateOnly) {
              let yr = dateOnly[3].length === 2 ? parseInt('20' + dateOnly[3], 10) : parseInt(dateOnly[3], 10);
              logTime = new Date(Date.UTC(yr, parseInt(dateOnly[1]) - 1, parseInt(dateOnly[2])));
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

  let actionItems = _buildPortfolioActionItems({
    headers: headers,
    rows: data.length > 1 ? data.slice(1) : [],
    refDict: refDict,
    fiberStats: fiberStats,
    defaultDrgTrackerUrl: defaultDrgTrackerUrl
  });
  const searchProjects = _buildProjectSearchCatalog({
    headers: headers,
    rows: data.length > 1 ? data.slice(1) : [],
    refDict: refDict
  });

  let refDataDate = String(PropertiesService.getScriptProperties().getProperty('refDataImportDate') || "");
  let vendorCities = buildVendorCityCoordinateRecords(actionItems, cityCoordinates);

  let payload = {
    actionItems: actionItems,
    hasRecentChanges: hasRecentGlobalChange,
    globalLogs: globalLogs,
    vendorGoals: vendorGoals,
    vendorCities: vendorCities,
    totalRows: actionItems.length,
    headers: headers,
    refDataDate: refDataDate,
    lastIngestionTime: String(PropertiesService.getScriptProperties().getProperty('LAST_INGESTION_DATETIME') || ""),
    allFdhIds: Object.keys(refDict),
    searchProjects: searchProjects,
    fiberStats: fiberStats
  };
  const serializedPayload = JSON.stringify(payload);
  try { putChunkedCache(cache, CACHE_KEY, serializedPayload, 1800); } catch(e) {}
  return JSON.parse(serializedPayload);
}

function _ensureDashboardSearchCatalog(payload) {
  payload = payload || {};
  if (Array.isArray(payload.searchProjects) && payload.searchProjects.length > 0) return payload;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  const data = (mirrorSheet && mirrorSheet.getLastRow() > 0) ? mirrorSheet.getDataRange().getValues() : [];
  const headers = data.length > 0 ? data[0].map(String) : [];
  payload.searchProjects = _buildProjectSearchCatalog({
    headers: headers,
    rows: data.length > 1 ? data.slice(1) : [],
    refDict: getReferenceDictionary()
  });
  return payload;
}

function getProjectSearchHydration(fdh) {
  const requestedFdh = String(fdh || "").trim().toUpperCase();
  if (!requestedFdh) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  const data = (mirrorSheet && mirrorSheet.getLastRow() > 0) ? mirrorSheet.getDataRange().getValues() : [];
  const headers = data.length > 0 ? data[0].map(String) : [];
  const refDict = getReferenceDictionary();
  const fiberStats = getVendorHybridStats();
  const defaultDrgTrackerUrl = VENDOR_TRACKER_ID ? `https://docs.google.com/spreadsheets/d/${VENDOR_TRACKER_ID}/edit` : "";

  const items = _buildPortfolioActionItems({
    headers: headers,
    rows: data.length > 1 ? data.slice(1) : [],
    refDict: refDict,
    fiberStats: fiberStats,
    defaultDrgTrackerUrl: defaultDrgTrackerUrl,
    fdhFilter: requestedFdh,
    includeSuppressed: true
  });

  return items.length ? items[0] : null;
}

// ─── Vendor Alias CRUD ────────────────────────────────────────────────────────

function getVendorAliasData() {
  var builtin = Object.keys(VENDOR_ALIASES).map(function(raw) {
    return { raw: raw, canonical: VENDOR_ALIASES[raw], source: 'builtin' };
  });
  var custom = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ALIAS_SHEET);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function(row) {
        var raw = (row[0] || "").toString().trim();
        var canonical = (row[1] || "").toString().trim();
        if (raw && canonical) custom.push({ raw: raw, canonical: canonical, source: 'custom' });
      });
    }
  } catch(e) {}
  return { builtin: builtin, custom: custom };
}

function saveVendorAlias(raw, canonical) {
  raw = raw.toString().trim().toLowerCase();
  canonical = canonical.toString().trim();
  if (!raw || !canonical) throw new Error("Both raw and canonical name are required.");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ALIAS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ALIAS_SHEET);
    sheet.getRange(1, 1, 1, 2).setValues([["Raw Name", "Canonical Name"]]);
  }
  var data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  var found = -1;
  data.forEach(function(r, i) { if ((r[0] || "").toString().trim().toLowerCase() === raw) found = i; });
  if (found >= 0) {
    sheet.getRange(found + 2, 2).setValue(canonical);
  } else {
    sheet.appendRow([raw, canonical]);
  }
  return { ok: true };
}

function deleteVendorAlias(raw) {
  raw = raw.toString().trim().toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ALIAS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true };
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if ((data[i][0] || "").toString().trim().toLowerCase() === raw) {
      sheet.deleteRow(i + 2);
    }
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────

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

function promptExportQuickBaseCSV() { exportQuickBaseCSVCore(false, "MANUAL"); }

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
function importArchiveFolder() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  let stateStr = props.getProperty("ARCHIVE_IMPORT_STATE");
  
  if (stateStr) {
    const folderIds = JSON.parse(stateStr);
    if (folderIds.length > 0) {
      let response = ui.alert(
        "⏸️ IMPORT IN PROGRESS",
        `An interrupted import was found with ${folderIds.length} folders remaining.\n\nClick YES to Resume where it left off.\nClick NO to Cancel the current run so you can start a fresh one.`,
        ui.ButtonSet.YES_NO_CANCEL
      );
      
      if (response === ui.Button.YES) {
        _runArchiveImportBatch_(folderIds);
        return;
      } else if (response === ui.Button.NO) {
        props.deleteProperty("ARCHIVE_IMPORT_STATE");
        _deleteProjectTriggersByHandler_("importArchiveFolderResume");
        ui.alert("🛑 PROGRESS CLEARED", "Saved progress has been wiped. You can now click 'Import Historical Archive' again to start from the beginning.", ui.ButtonSet.OK);
        return;
      } else {
        return; // Cancel
      }
    }
  }

  // 🧠 FIRST RUN: Gather ALL subfolders recursively in the Archive
  let folderIds = [ARCHIVE_FOLDER_ID];
  const gatherFoldersRecursive = (parentFolderId) => {
    try {
      let parent = DriveApp.getFolderById(parentFolderId);
      let subfolders = parent.getFolders();
      while (subfolders.hasNext()) {
        let sub = subfolders.next();
        folderIds.push(sub.getId());
        gatherFoldersRecursive(sub.getId());
      }
    } catch (e) {
      logMsg("WARN", "gatherFoldersRecursive", `Failed to scan folder ${parentFolderId}: ${e.message}`);
    }
  };

  ui.showModelessDialog(HtmlService.createHtmlOutput("<p>Gathering all subfolders in archive... please wait.</p>").setHeight(100).setWidth(300), "📂 Scanning Archive");
  gatherFoldersRecursive(ARCHIVE_FOLDER_ID);
  
  props.setProperty("ARCHIVE_IMPORT_STATE", JSON.stringify(folderIds));
  ui.alert("🚀 ARCHIVE REBUILD STARTED", `The script identified ${folderIds.length} folders to process.\n\nIt will now work in 4.5-minute batches and automatically resume every 60 seconds. You can close this window and walk away.`, ui.ButtonSet.OK);

  _runArchiveImportBatch_(folderIds);
}

/**
 * ⚡ Trigger-facing resumption stub
 */
function importArchiveFolderResume() {
  _deleteProjectTriggersByHandler_("importArchiveFolderResume");
  const props = PropertiesService.getScriptProperties();
  const stateStr = props.getProperty("ARCHIVE_IMPORT_STATE");
  if (!stateStr) return;

  const folderIds = JSON.parse(stateStr);
  if (folderIds.length === 0) {
    props.deleteProperty("ARCHIVE_IMPORT_STATE");
    logMsg("✅ Master Archive Rebuild finished in background.");
    return;
  }

  _runArchiveImportBatch_(folderIds);
}

/**
 * 🧠 Core batch logic shared by menu and trigger
 */
function _runArchiveImportBatch_(folderIds) {
  const startTime = new Date().getTime();
  const keys = getExistingKeys();
  const totals = getExistingTotals();
  const refDict = getReferenceDictionary();
  const props = PropertiesService.getScriptProperties();
  let completedBatch = true;

  while (folderIds.length > 0) {
    // ⏰ Time Check: Leave buffer for cleanup (270s = 4.5 mins)
    if (new Date().getTime() - startTime > 270000) {
      completedBatch = false;
      break;
    }

    let currentFolderId = folderIds.shift();
    try {
      let folder = DriveApp.getFolderById(currentFolderId);
      // Process files in this folder only (recursive = false)
      let result = processFolderRecursive(folder, keys, refDict, "", true, null, null, false, null, startTime, false, totals);
      
      if (result && result.completed === false) {
        // Folder was only partially processed due to timeout
        folderIds.unshift(currentFolderId);
        completedBatch = false;
        break;
      }
    } catch (e) {
      logMsg(`❌ Error processing archive folder ${currentFolderId}: ${e.message}`);
    }

    // Save state after each folder
    props.setProperty("ARCHIVE_IMPORT_STATE", JSON.stringify(folderIds));
  }

  if (!completedBatch) {
    props.setProperty("ARCHIVE_IMPORT_STATE", JSON.stringify(folderIds));
    _deleteProjectTriggersByHandler_("importArchiveFolderResume");
    ScriptApp.newTrigger("importArchiveFolderResume").timeBased().after(60000).create();
    logMsg(`⌛ ARCHIVE REBUILD PAUSED: ${folderIds.length} folders remaining. Automatically resuming in 60s...`);
  } else {
    props.deleteProperty("ARCHIVE_IMPORT_STATE");
    logMsg("✅ ARCHIVE REBUILD FINISHED: All folders processed.");
    try { SpreadsheetApp.getUi().alert("✅ Master Archive Rebuild is 100% Complete!"); } catch(e) {}
  }
}
function _listProjectTriggersByHandler_(handlerName) {
  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === handlerName;
  });
}

function _deleteProjectTriggersByHandler_(handlerName) {
  return _listProjectTriggersByHandler_(handlerName).reduce(function(count, trigger) {
    ScriptApp.deleteTrigger(trigger);
    return count + 1;
  }, 0);
}

function _readJsonScriptProperty_(props, key) {
  try {
    return JSON.parse(props.getProperty(key) || 'null');
  } catch (err) {
    return null;
  }
}

function _buildAutomationHealthSummary_(health) {
  const daily = health && health.dailyAutomation ? health.dailyAutomation : {};
  const qb = health && health.qbSync ? health.qbSync : {};
  const archive = health && health.archiveIngestion ? health.archiveIngestion : {};
  const cd = health && health.cdIngestion ? health.cdIngestion : {};
  const cdQueue = cd.queue || {};

  return [
    'daily=' + (daily.lastStatus || 'unknown'),
    'dailyTriggers=' + String(daily.triggerCount == null ? '?' : daily.triggerCount) + '/' + String(daily.expectedTriggerCount == null ? '?' : daily.expectedTriggerCount),
    'qbActive=' + (qb.activeStatus || 'idle'),
    'qbLast=' + (qb.lastStatus || 'none'),
    'resume=' + String(archive.resumeTriggerCount == null ? '?' : archive.resumeTriggerCount),
    'archive=' + (archive.status || 'unknown'),
    'cdTriggers=' + String(cd.triggerCount == null ? '?' : cd.triggerCount) + '/' + String(cd.expectedTriggerCount == null ? '?' : cd.expectedTriggerCount),
    'cdPending=' + String(cdQueue.pendingCount == null ? '?' : cdQueue.pendingCount)
  ].join(', ');
}

function logAutomationHealthSummary(contextLabel) {
  const health = getAutomationHealth();
  const label = contextLabel || 'Automation health snapshot';
  const summary = _buildAutomationHealthSummary_(health);
  logMsg(label + ' — ' + summary);
  return summary;
}

function setupDailyTrigger() {
  const props = PropertiesService.getScriptProperties();
  const deletedTriggerCount = _deleteProjectTriggersByHandler_('runMiddayAutomation');
  const scheduleHours = [7, 12, 16];

  // 3 Data Sync Windows (7am, 12pm, 4pm)
  scheduleHours.forEach(hour => {
    ScriptApp.newTrigger('runMiddayAutomation').timeBased().atHour(hour).everyDays(1).create();
  });

  const createdTriggerCount = _listProjectTriggersByHandler_('runMiddayAutomation').length;
  props.setProperties({
    'DAILY_AUTOMATION_TRIGGER_INSTALLED_AT': String(Date.now()),
    'DAILY_AUTOMATION_TRIGGER_HOURS': scheduleHours.join(','),
    'DAILY_AUTOMATION_TRIGGER_COUNT': String(createdTriggerCount)
  });

  logMsg("✅ SIGNAL: Automatic sync triggers programmed for 7am, 12pm, 4pm. deleted=" + deletedTriggerCount + ", active=" + createdTriggerCount);
  SpreadsheetApp.getUi().alert("✅ Daily Automations Updated: Syncs at 7AM, 12PM, 4PM.");
}

function runMiddayAutomation() {
  const props = PropertiesService.getScriptProperties();
  const startedAt = Date.now();
  props.setProperties({
    'DAILY_AUTOMATION_LAST_STARTED_AT': String(startedAt),
    'DAILY_AUTOMATION_LAST_STATUS': 'running',
    'DAILY_AUTOMATION_LAST_ERROR': ''
  });

  logMsg("🤖 STARTING MIDDAY AUTOMATION...");
  try {
    const summary = executeDailyAutomationPipeline();
    props.setProperties({
      'DAILY_AUTOMATION_LAST_STATUS': 'done',
      'DAILY_AUTOMATION_LAST_COMPLETED_AT': String(Date.now()),
      'DAILY_AUTOMATION_LAST_SUMMARY': JSON.stringify(summary || {})
    });
    logMsg("✅ MIDDAY AUTOMATION COMPLETE. summary=" + JSON.stringify(summary || {}));
    logAutomationHealthSummary('Automation health after midday run');
  } catch (err) {
    props.setProperties({
      'DAILY_AUTOMATION_LAST_STATUS': 'error',
      'DAILY_AUTOMATION_LAST_COMPLETED_AT': String(Date.now()),
      'DAILY_AUTOMATION_LAST_ERROR': err.message || 'Unknown error'
    });
    logMsg("❌ MIDDAY AUTOMATION ERROR: " + (err.message || err));
    logAutomationHealthSummary('Automation health after midday error');
    throw err;
  }
}

function executeDailyAutomationPipeline() {
  logMsg("🤖 QB SYNC: Pulling latest reference data...");
  const syncResult = syncFromQBWebApp();
  if (syncResult && syncResult.success) {
    logMsg(`✅ QB SYNC SUCCESS: Pulled ${syncResult.count} records.`);
  } else {
    logMsg(`⚠️ QB SYNC SKIP/FAIL: ${syncResult ? syncResult.error : "Unknown Error"}`);
  }

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
  
  // 🔍 Run Gap Scan to backfill any missing reports for the last 7 days
  backfillMissingReports(true);

  const resumeTriggerCount = _listProjectTriggersByHandler_('processIncomingResume').length;
  return {
    targetDate: targetDateStr,
    qbSyncSuccess: !!(syncResult && syncResult.success),
    qbSyncCount: syncResult && syncResult.success ? syncResult.count : 0,
    resumeTriggerCount: resumeTriggerCount
  };
}

function getAutomationHealth() {
  const props = PropertiesService.getScriptProperties();
  const cdStatus = typeof getCDIngestionStatus === 'function' ? getCDIngestionStatus() : null;
  const qbLastResult = _readJsonScriptProperty_(props, 'QB_SYNC_LAST_RESULT');
  const dailyLastSummary = _readJsonScriptProperty_(props, 'DAILY_AUTOMATION_LAST_SUMMARY');

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    dailyAutomation: {
      triggerCount: _listProjectTriggersByHandler_('runMiddayAutomation').length,
      expectedTriggerCount: 3,
      installedAt: props.getProperty('DAILY_AUTOMATION_TRIGGER_INSTALLED_AT') || '',
      scheduleHours: props.getProperty('DAILY_AUTOMATION_TRIGGER_HOURS') || '7,12,16',
      lastStartedAt: props.getProperty('DAILY_AUTOMATION_LAST_STARTED_AT') || '',
      lastCompletedAt: props.getProperty('DAILY_AUTOMATION_LAST_COMPLETED_AT') || '',
      lastStatus: props.getProperty('DAILY_AUTOMATION_LAST_STATUS') || 'unknown',
      lastError: props.getProperty('DAILY_AUTOMATION_LAST_ERROR') || '',
      lastSummary: dailyLastSummary
    },
    qbSync: {
      activeStatus: props.getProperty('QB_SYNC_STATUS') || 'idle',
      activePhase: props.getProperty('QB_SYNC_PHASE') || '',
      activeStartedAt: props.getProperty('QB_SYNC_STARTED') || '',
      lastStatus: props.getProperty('QB_SYNC_LAST_STATUS') || '',
      lastStartedAt: props.getProperty('QB_SYNC_LAST_STARTED') || '',
      lastCompletedAt: props.getProperty('QB_SYNC_LAST_COMPLETED') || '',
      lastRunId: props.getProperty('QB_SYNC_LAST_RUN_ID') || '',
      lastError: props.getProperty('QB_SYNC_LAST_ERROR') || '',
      lastResult: qbLastResult
    },
    archiveIngestion: {
      inProgress: props.getProperty('INGESTION_IN_PROGRESS') === 'true',
      status: props.getProperty('INGESTION_STATUS') || '',
      lastStartedAt: props.getProperty('INGESTION_LAST_STARTED_AT') || '',
      lastCompletedAt: props.getProperty('INGESTION_LAST_COMPLETED_AT') || '',
      lastResumeScheduledAt: props.getProperty('INGESTION_LAST_RESUME_SCHEDULED_AT') || '',
      lastResumeStartedAt: props.getProperty('INGESTION_LAST_RESUME_STARTED_AT') || '',
      resumeTriggerCount: _listProjectTriggersByHandler_('processIncomingResume').length
    },
    cdIngestion: {
      triggerCount: _listProjectTriggersByHandler_('processCDQueue').length,
      expectedTriggerCount: 11,
      lastInstalledAt: props.getProperty('CD_TRIGGER_LAST_INSTALLED_AT') || '',
      lastRemovedAt: props.getProperty('CD_TRIGGER_LAST_REMOVED_AT') || '',
      queue: cdStatus
    }
  };
}

function getAutomationHealthJson() {
  return JSON.stringify(getAutomationHealth(), null, 2);
}

function saveAutomationHealthSnapshot() {
  const snapshot = getAutomationHealthJson();
  PropertiesService.getScriptProperties().setProperty('AUTOMATION_HEALTH_SNAPSHOT', snapshot);
  logAutomationHealthSummary('Automation health snapshot saved');
  return snapshot;
}

function readAutomationHealthSnapshot() {
  return PropertiesService.getScriptProperties().getProperty('AUTOMATION_HEALTH_SNAPSHOT') || '';
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

  const now = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yy HH:mm");
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
      case "Phase ID": return safeAnswers.q_phase || "";
      case "Stage ID": return safeAnswers.q_stage || "";
      case "Status ID": return safeAnswers.q_status || "";
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
function syncReviewToArchive() { logMsg("🔄 SYNC START: Review to Archive"); const ss = SpreadsheetApp.getActiveSpreadsheet(); const mirrorSheet = ss.getSheetByName(MIRROR_SHEET); const archiveSheet = ss.getSheetByName(HISTORY_SHEET); if (getTrueLastDataRow(mirrorSheet) < 2) return; let mirrorHeaders = mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0]; let archiveHeaders = archiveSheet.getRange(1, 1, 1, archiveSheet.getLastColumn()).getValues()[0]; let rowPtrIdx = mirrorHeaders.indexOf("Archive_Row"); if (rowPtrIdx === -1) { logMsg("⚠️ Sync Skipped: 'Archive_Row' column not found."); return; } let mirrorData = mirrorSheet.getRange(2, 1, getTrueLastDataRow(mirrorSheet) - 1, mirrorSheet.getLastColumn()).getValues(); let archiveData = archiveSheet.getDataRange().getValues(); let updateCount = 0; mirrorData.forEach(row => { let archiveRowIndex = row[rowPtrIdx]; if (archiveRowIndex && typeof archiveRowIndex === 'number' && archiveRowIndex <= archiveData.length) { mirrorHeaders.forEach((header, colIdx) => { if (!["BSLs", "Budget OFS", "CX Start", "CX Complete"].includes(header) && (ANALYTICS_QUADRANT.includes(header) || REVIEW_EXTRA_HEADERS.includes(header) || header === "Archive_Row")) return; let archiveColIdx = archiveHeaders.indexOf(header); if (archiveColIdx > -1) { let newValue = row[colIdx]; if (typeof newValue === 'string' && newValue.includes('(BOM:')) { let cleanString = newValue.split('\n')[0].trim(); let cleanNum = Number(cleanString.replace(/,/g, '')); if (!isNaN(cleanNum)) newValue = cleanNum; else newValue = cleanString; } archiveSheet.getRange(archiveRowIndex, archiveColIdx + 1).setValue(newValue); } }); updateCount++; } }); SpreadsheetApp.flush(); logMsg(`✅ SYNC COMPLETE: Updated ${updateCount} rows in Master Archive.`); }
function exportSpreadsheetToXLSX(ssId, fileName) { let url = "https://docs.google.com/spreadsheets/export?id=" + ssId + "&exportFormat=xlsx"; let params = { method: "get", headers: {"Authorization": "Bearer " + ScriptApp.getOAuthToken()}, muteHttpExceptions: true }; let response = UrlFetchApp.fetch(url, params); if (response.getResponseCode() !== 200) { logMsg(`❌ EXPORT FAILED: ${response.getContentText()}`); return false; } let blob = response.getBlob(); blob.setName(fileName + ".xlsx"); DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(blob); return true; }
function exportDirectorReviewXLSX(isSilent = false) { logMsg("⚡ STARTING: Director Review XLSX Export"); const ss = SpreadsheetApp.getActiveSpreadsheet(); const mirrorSheet = ss.getSheetByName(MIRROR_SHEET); if (getTrueLastDataRow(mirrorSheet) < 2) { if(!isSilent) SpreadsheetApp.getUi().alert("No data available to export."); return; } let targetDateStr = mirrorSheet.getRange("A2").getValue(); let dateFormatted = (targetDateStr instanceof Date) ? Utilities.formatDate(targetDateStr, "GMT-5", "M.d.yy") : String(targetDateStr); let fileName = `Daily_Production_Analysis_${dateFormatted}`; let tempSS = SpreadsheetApp.create(fileName); let copiedSheet = mirrorSheet.copyTo(tempSS); copiedSheet.setName("Executive_Summary"); tempSS.deleteSheet(tempSS.getSheets()[0]); try { let maxRows = copiedSheet.getMaxRows(); let maxCols = copiedSheet.getMaxColumns(); copiedSheet.showRows(1, maxRows); copiedSheet.showColumns(1, maxCols); copiedSheet.getRange(1, 1, 1, maxCols).shiftColumnGroupDepth(-10); copiedSheet.getDataRange().setFontFamily("Arial").setFontSize(12); for (let c = 1; c <= maxCols; c++) { let w = copiedSheet.getColumnWidth(c); copiedSheet.setColumnWidth(c, w * 1.4); } copiedSheet.setFrozenColumns(7); } catch(e){} SpreadsheetApp.flush(); let success = exportSpreadsheetToXLSX(tempSS.getId(), fileName); DriveApp.getFileById(tempSS.getId()).setTrashed(true); if (success && !isSilent) { logMsg(`✅ FINISHED: Exported ${fileName}.xlsx`); SpreadsheetApp.getUi().alert(`✅ Daily Production Analysis exported as:\n${fileName}.xlsx`); } }
function exportVendorCorrectionsXLSX(isSilent = false) { logMsg("⚡ STARTING: Vendor Corrections XLSX Export"); const ss = SpreadsheetApp.getActiveSpreadsheet(); const mirrorSheet = ss.getSheetByName(MIRROR_SHEET); const styleSheet = ss.getSheetByName(STYLE_MASTER); if (getTrueLastDataRow(mirrorSheet) < 2) { if(!isSilent) SpreadsheetApp.getUi().alert("No data available to export."); return; } let targetDateStr = mirrorSheet.getRange("A2").getValue(); let dateFormatted = (targetDateStr instanceof Date) ? Utilities.formatDate(targetDateStr, "GMT-5", "M.d.yy") : String(targetDateStr); let currentHeaders = mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0]; let trueLastRow = getTrueLastDataRow(mirrorSheet); let mirrorData = mirrorSheet.getRange(2, 1, trueLastRow - 1, currentHeaders.length).getValues(); let contractorIdx = currentHeaders.indexOf("Contractor"); if (contractorIdx === -1) { logMsg("❌ ERROR: Contractor column not found."); return; } let vendors = [...new Set(mirrorData.map(row => row[contractorIdx]).filter(v => v !== ""))]; let exportedCount = 0; vendors.forEach(vendor => { let safeVendorName = vendor.toString().replace(/[\\/:*?"<>|]/g, "_").trim(); let fileName = `Daily_Production_Report_(CORRECTION)_${dateFormatted} (${safeVendorName})`; let vendorData = mirrorData.filter(row => row[contractorIdx] === vendor); let strippedData = vendorData.map(row => QB_HEADERS.map(h => { let lookupH = h === "Construction Comments" ? "Vendor Comment" : h; let cIdx = currentHeaders.indexOf(lookupH); return cIdx > -1 ? row[cIdx] : ""; })); let tempSS = SpreadsheetApp.create(fileName); let tempSheet = tempSS.getSheets()[0]; tempSheet.setName("Daily Report"); styleSheet.copyTo(tempSS).setName(STYLE_MASTER); tempSheet.getRange(1, 1, 1, QB_HEADERS.length).setValues([QB_HEADERS]); if (strippedData.length > 0) tempSheet.getRange(2, 1, strippedData.length, QB_HEADERS.length).setValues(strippedData); let styleHeaders = tempSS.getSheetByName(STYLE_MASTER).getRange(1, 1, 1, tempSS.getSheetByName(STYLE_MASTER).getLastColumn()).getValues()[0]; QB_HEADERS.forEach((header, index) => { let lookupHeader = header.trim() === "Construction Comments" ? "Vendor Comment" : header.trim(); let styleCol = styleHeaders.indexOf(lookupHeader) + 1; if (styleCol > 0) { tempSS.getSheetByName(STYLE_MASTER).getRange(1, styleCol).copyTo(tempSheet.getRange(1, index + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT); let origWidth = tempSS.getSheetByName(STYLE_MASTER).getColumnWidth(styleCol); tempSheet.setColumnWidth(index + 1, origWidth * 1.4); } }); tempSheet.setFrozenRows(1); tempSheet.setFrozenColumns(7); if (strippedData.length > 0) { let dataRange = tempSheet.getRange(2, 1, strippedData.length, QB_HEADERS.length); dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false); dataRange.setWrap(true).setVerticalAlignment("middle"); QB_HEADERS.forEach((header, index) => { if (isBooleanColumn(header)) { tempSheet.getRange(2, index + 1, strippedData.length, 1).insertCheckboxes(); tempSheet.getRange(2, index + 1, strippedData.length, 1).setHorizontalAlignment("center"); } if (isNumericColumn(header) || header.includes("BOM")) tempSheet.getRange(2, index + 1, strippedData.length, 1).setHorizontalAlignment("right"); }); } tempSheet.getDataRange().setFontFamily("Arial").setFontSize(12); try { tempSheet.showRows(1, tempSheet.getMaxRows()); tempSheet.showColumns(1, tempSheet.getMaxColumns()); } catch(e) {} SpreadsheetApp.flush(); let success = exportSpreadsheetToXLSX(tempSS.getId(), fileName); DriveApp.getFileById(tempSS.getId()).setTrashed(true); if (success) exportedCount++; }); if (!isSilent) SpreadsheetApp.getUi().alert(`✅ Exported ${exportedCount} separate Vendor Correction file(s)!`); }

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

function webAppProcessIncomingAndRebuild() {
  try {
    logMsg("🌐 WebApp triggered Process Incoming + Rebuild");
    processIncomingForQuickBase(true, false);
    const latestDate = _getLatestArchiveDate();
    generateDailyReviewCore(latestDate, null, false);
    const payload = getDashboardDataV2();
    payload._actionMeta = {
      action: "processIncomingAndRebuild",
      date: latestDate,
      message: "Processed incoming reports and rebuilt dashboard."
    };
    return payload;
  } catch (e) {
    logFrontendError("webAppProcessIncomingAndRebuild Error: " + e.message);
    throw e;
  }
}

function webAppForceRescanAndRebuild() {
  try {
    logMsg("🌐 WebApp triggered Force Re-scan + Rebuild");
    forceRescanIncoming();
    const latestDate = _getLatestArchiveDate();
    generateDailyReviewCore(latestDate, null, false);
    const payload = getDashboardDataV2();
    payload._actionMeta = {
      action: "forceRescanAndRebuild",
      date: latestDate,
      message: "Force re-scan completed and dashboard rebuilt."
    };
    return payload;
  } catch (e) {
    logFrontendError("webAppForceRescanAndRebuild Error: " + e.message);
    throw e;
  }
}

function webAppResetIngestionLock() {
  try {
    logMsg("🌐 WebApp triggered Reset Ingestion Lock");
    PropertiesService.getScriptProperties().setProperty("INGESTION_IN_PROGRESS", "false");
    return { success: true, message: "Ingestion lock cleared." };
  } catch (e) {
    logFrontendError("webAppResetIngestionLock Error: " + e.message);
    throw e;
  }
}

function webAppRemoveDuplicatesAndRefresh() {
  try {
    logMsg("🌐 WebApp triggered Clean Archive Duplicates + Refresh");
    removeDuplicatesFromArchive();
    const latestDate = _getLatestArchiveDate();
    generateDailyReviewCore(latestDate, null, false);
    const payload = getDashboardDataV2();
    payload._actionMeta = {
      action: "removeDuplicatesAndRefresh",
      date: latestDate,
      message: "Archive duplicates cleaned and dashboard rebuilt."
    };
    return payload;
  } catch (e) {
    logFrontendError("webAppRemoveDuplicatesAndRefresh Error: " + e.message);
    throw e;
  }
}

function webAppRepairLegacyAutoFixedFdhs() {
  try {
    logMsg("🌐 WebApp triggered Repair Legacy Auto-Fixed FDHs");
    const repairStats = repairLegacyAutoFixedFdhs();
    const latestDate = _getLatestArchiveDate();
    generateDailyReviewCore(latestDate, null, false);
    const payload = getDashboardDataV2();
    payload._actionMeta = {
      action: "repairLegacyAutoFixedFdhs",
      date: latestDate,
      scanned: repairStats.scanned,
      repaired: repairStats.repaired,
      unresolved: repairStats.unresolved,
      unchanged: repairStats.unchanged,
      message: repairStats.message
    };
    return payload;
  } catch (e) {
    logFrontendError("webAppRepairLegacyAutoFixedFdhs Error: " + e.message);
    throw e;
  }
}

function reportLegacyBlockedAutoMatches() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const archiveSheet = ss.getSheetByName(HISTORY_SHEET);
  if (!archiveSheet || archiveSheet.getLastRow() < 2) {
    return { count: 0, sheetName: 'Blocked_Auto_Matches_Report', message: 'No archive rows found.' };
  }

  const reportName = 'Blocked_Auto_Matches_Report';
  let reportSheet = ss.getSheetByName(reportName);
  if (!reportSheet) reportSheet = ss.insertSheet(reportName);
  reportSheet.clear();

  const rows = archiveSheet.getDataRange().getValues();
  const fdhIdx = HISTORY_HEADERS.indexOf("FDH Engineering ID");
  const dateIdx = HISTORY_HEADERS.indexOf("Date");
  const vendorIdx = HISTORY_HEADERS.indexOf("Contractor");
  const commentIdx = HISTORY_HEADERS.indexOf("Vendor Comment");

  const output = [[
    "Archive Row",
    "Date",
    "Current FDH",
    "Original Submitted FDH",
    "Blocked Target",
    "Vendor",
    "Vendor Comment"
  ]];

  for (let i = 1; i < rows.length; i++) {
    let comment = String(rows[i][commentIdx] || "");
    let blockedTarget = extractBlockedAutoMatchTarget(comment);
    if (!blockedTarget) continue;
    output.push([
      i + 1,
      rows[i][dateIdx] || "",
      rows[i][fdhIdx] || "",
      extractAutoFixedFdhFromComment(comment),
      blockedTarget,
      rows[i][vendorIdx] || "",
      comment
    ]);
  }

  reportSheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  reportSheet.getRange(1, 1, 1, output[0].length).setBackground("#7f1d1d").setFontColor("#ffffff").setFontWeight("bold");
  reportSheet.setFrozenRows(1);
  SpreadsheetApp.flush();

  let message = `Blocked auto-match report generated with ${output.length - 1} row(s).`;
  logMsg("📋 " + message);
  return { count: output.length - 1, sheetName: reportName, message: message };
}

function webAppReportLegacyBlockedAutoMatches() {
  try {
    const result = reportLegacyBlockedAutoMatches();
    return { success: true, count: result.count, sheetName: result.sheetName, message: result.message };
  } catch (e) {
    logFrontendError("webAppReportLegacyBlockedAutoMatches Error: " + e.message);
    throw e;
  }
}

// 🧠 WEB APP BRIDGE: Logs the Admin Check permanently and cleans the Daily Review sheet instantly
function markAdminCheckComplete(fdhId) {
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12', 'SIGNAL_FAST_current', 'dashboard_data_cache_v2_blob']);
  bumpEngineDictionaryCacheVersion();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if(!adminSheet) return false;

  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");

  let data = adminSheet.getDataRange().getValues();
  let found = false;
  let dateStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yy");

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
                  let newFlags = currentFlags.replace("ADMIN: CHECK CROSSINGS", "").trim().replace(/\n+/g, '\n');
                  if(newFlags === "") newFlags = "No Anomalies";

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
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12', 'SIGNAL_FAST_current']);
  bumpEngineDictionaryCacheVersion();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if (!adminSheet) return false;

  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");
  if (adminSheet.getLastColumn() < 4) adminSheet.getRange(1, 4).setValue("Crossings Verified Date");
  if (adminSheet.getLastColumn() < 5) adminSheet.getRange(1, 5).setValue("Committed Date");

  let data = adminSheet.getDataRange().getValues();
  let found = false;
  let dateStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yy");

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
          let newFlags = currentFlags.replace("ADMIN: CHECK CROSSINGS", "").trim().replace(/\n+/g, '\n');
          if (newFlags === "") newFlags = "No Anomalies";
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
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12', 'SIGNAL_FAST_current', 'dashboard_data_cache_v2_blob']);
  bumpEngineDictionaryCacheVersion();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if(!adminSheet) return false;

  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");

  let data = adminSheet.getDataRange().getValues();
  let found = false;
  let dateStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yy");

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
  let now = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yy HH:mm");

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
          ? Utilities.formatDate(rawVal, "GMT-5", "MM/dd/yy")
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

// 📡 High-Resolution Portfolio Monitoring: Robust Drive Scanning via Advanced Service.
// Uses Drive API v2 (Advanced Service) for better performance and Shared Drive support.
// This handles the "Service error: Drive" that standard DriveApp throws on large accounts.
function getSignalDrive(tf) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeframe = _normalizeSignalTimeframe(tf);
  const cacheKey = 'SIGNAL_DRIVE_V2_' + timeframe;
  const failureKey = 'SIGNAL_DRIVE_FAIL_V2';
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  if (cache.get(failureKey)) return [];

  const now = new Date();
  const cutoff = _getSignalCutoff(timeframe, ss, now);
  // Format for Drive API: YYYY-MM-DDTHH:mm:ssZ
  const cutoffStr = Utilities.formatDate(cutoff, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");

  const driveActivity = [];
  const targetFolders = [
    { id: BOMS_FOLDER_ID, name: 'BOMs' },
    { id: CDS_PERMITS_FOLDER_ID, name: 'CDs_and_Permits' }
  ];
  
  const targetIdMap = {};
  targetFolders.forEach(t => targetIdMap[t.id] = t.name);

  try {
    // 🧠 ADVANCED SEARCH: Use Drive.Files.list (API v2) for better stability in corporate drives.
    // Supports Shared Drives (Team Drives) which often causes 'Service error' in standard DriveApp.
    const query = "modifiedDate >= '" + cutoffStr + "' and trashed = false and mimeType != 'application/vnd.google-apps.folder'";
    
    const response = Drive.Files.list({
      q: query,
      maxResults: 150,
      orderBy: "modifiedDate desc",
      supportsTeamDrives: true,
      includeItemsFromTeamDrives: true,
      fields: "items(id,title,alternateLink,modifiedDate,parents)"
    });

    if (!response.items || response.items.length === 0) {
      try { cache.put(cacheKey, JSON.stringify([]), 600); } catch(e) {}
      return [];
    }

    const ancestryCache = {};
    const itemsByRoot = {};
    targetFolders.forEach(t => itemsByRoot[t.id] = []);

    response.items.forEach(item => {
      if (item.title.charAt(0) === '.') return;

      let targetRootId = null;
      let pathParts = [];
      
      // Determine ancestry
      if (item.parents && item.parents.length > 0) {
        let currentParentId = item.parents[0].id;
        let walkLimit = 6; // User said ~2 levels deep, 6 is plenty.
        
        while (currentParentId && walkLimit > 0) {
          if (targetIdMap[currentParentId]) {
            targetRootId = currentParentId;
            break;
          }
          
          if (ancestryCache[currentParentId]) {
            targetRootId = ancestryCache[currentParentId].rootId;
            if (targetRootId) pathParts = ancestryCache[currentParentId].path.concat(pathParts);
            break;
          }

          try {
            // Using Drive.Files.get is faster than DriveApp
            const parent = Drive.Files.get(currentParentId, { supportsTeamDrives: true });
            pathParts.unshift(parent.title);
            
            if (parent.parents && parent.parents.length > 0) {
              currentParentId = parent.parents[0].id;
            } else {
              currentParentId = null;
            }
          } catch(e) {
            currentParentId = null;
          }
          walkLimit--;
        }

        // Cache this branch's root for subsequent siblings
        ancestryCache[item.parents[0].id] = {
          rootId: targetRootId,
          path: pathParts
        };
      }

      if (targetRootId) {
        const modDate = new Date(item.modifiedDate);
        itemsByRoot[targetRootId].push({
          folderPath: targetIdMap[targetRootId] + " / " + pathParts.join(" / "),
          folderUrl: "https://drive.google.com/drive/folders/" + targetRootId,
          file: {
            name: item.title,
            url: item.alternateLink,
            modified: Utilities.formatDate(modDate, "GMT-5", "MM/dd/yy HH:mm")
          }
        });
      }
    });

    // Group and format for UI
    for (const rootId in itemsByRoot) {
      const foldersMap = {};
      itemsByRoot[rootId].forEach(item => {
        if (!foldersMap[item.folderPath]) {
          foldersMap[item.folderPath] = { folder: item.folderPath, folderUrl: item.folderUrl, files: [] };
          driveActivity.push(foldersMap[item.folderPath]);
        }
        foldersMap[item.folderPath].files.push(item.file);
      });
    }

  } catch (e) {
    const msg = String(e);
    logMsg('SIGNAL: Failed Advanced Drive Scan — ' + msg);
    if (msg.indexOf('Service error') > -1) {
      try { cache.put(failureKey, '1', 300); } catch(ex) {}
    }
  }

  try { cache.put(cacheKey, JSON.stringify(driveActivity), 600); } catch(e) {}
  return driveActivity;
}

// Optimized helper: walks folder tree using Drive Search for performance.
// (Keeping signature for compatibility but delegating to getSignalDrive logic)
function _collectDriveChanges(folder, path, cutoff, out, counter, depth) {
  // Logic migrated to getSignalDrive for global search performance.
}

/**
 * EMERGENCY TOOL: Ignores the "PROCESSED" tag and re-evaluates every file in the incoming folders.
 * Safe to run: The deduplication engine prevents duplicate rows in the Master Archive.
 */
function forceRescanIncoming() {
  logMsg("🆘 EMERGENCY: Starting Force Re-scan of Incoming folders...");
  setupSheets();
  const keys = getExistingKeys();
  const totals = getExistingTotals();
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
      processFolderRecursive(folder, keys, refDict, "", false, newRowsAppended, allProcessedDates, true, allParsedRowsForQB, startTime, false, totals);
    } catch (e) {
      logMsg("⚠️ Emergency scan failed for folder " + folderId + ": " + e.message);
    }
  });

  // Cleanup
  populateQuickBaseTabDirectly(allParsedRowsForQB);
  
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
function backfillMissingReports(isSilent) {
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
    if (!isSilent) SpreadsheetApp.getUi().alert("Gap Scan Complete.\n\nNo production data found in the Master Archive for the last 7 days.");
    return;
  }

  // 3. Get existing reports from Compiled_Daily_Production_Reports (Recursive Scan)
  const existingReports = new Set();
  
  /**
   * Internal helper to recursively find existing report filenames.
   * @param {string} folderId 
   */
  function scanFolderRecursive(folderId) {
    try {
      let folder = DriveApp.getFolderById(folderId);
      
      // 3a. Check files in current level
      let files = folder.getFiles();
      while (files.hasNext()) {
        let name = files.next().getName();
        // Match Daily_Production_Report_M.d.yy or Daily_Production_Report_MM.dd.yy with optional extension
        let match = name.match(/Daily_Production_Report_(\d{1,2}\.\d{1,2}\.\d{2})(?:-(\d{1,2}\.\d{1,2}\.\d{2}))?/);
        if (match) {
          let pStart = match[1].split('.');
          let startD = new Date(`20${pStart[2]}`, parseInt(pStart[0])-1, parseInt(pStart[1]));
          
          if (match[2]) {
            let pEnd = match[2].split('.');
            let endD = new Date(`20${pEnd[2]}`, parseInt(pEnd[0])-1, parseInt(pEnd[1]));
            
            let currentD = new Date(startD);
            while (currentD <= endD) {
              existingReports.add(Utilities.formatDate(currentD, "GMT-5", "M.d.yy"));
              currentD.setDate(currentD.getDate() + 1);
              if (currentD.getFullYear() > 2030) break; // Safety
            }
          } else {
            existingReports.add(Utilities.formatDate(startD, "GMT-5", "M.d.yy"));
          }
        }
      }
      
      // 3b. Recurse into all subfolders (e.g., 02_Uploaded month/year folders)
      let subfolders = folder.getFolders();
      while (subfolders.hasNext()) {
        scanFolderRecursive(subfolders.next().getId());
      }
    } catch (e) {
      logMsg(`⚠️ Gap Scan folder check failed (${folderId}): ${e.message}`);
    }
  }

  // Start recursion from the root parent folder
  scanFolderRecursive(COMPILED_PARENT_FOLDER_ID);

  // 4. Identify gaps
  const missingDates = [...archiveDates].filter(d => !existingReports.has(d));

  if (missingDates.length === 0) {
    logMsg("✅ GAP SCAN COMPLETE: No missing reports found in the 7-day window.");
    if (!isSilent) SpreadsheetApp.getUi().alert("Gap Scan Complete.\n\nAll dates in the last 7 days already have a corresponding compiled report.");
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
      exportQuickBaseCSVCore(true, "ROUTINE"); // Silent run
      logMsg(`✅ Backfilled report for: ${dStr}`);    } catch(e) {
      logMsg(`❌ Backfill failed for ${dStr}: ${e.message}`);
    }
  });

  logMsg(`✅ BACKFILL COMPLETE: Generated ${missingDates.length} reports.`);
  if (!isSilent) SpreadsheetApp.getUi().alert(`Backfill Complete.\n\nGenerated ${missingDates.length} missing reports into the 01_Pending_Upload folder.`);
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
      return _decoratePayloadMeta(_ensureDashboardSearchCatalog(JSON.parse(cached)), { source: 'cache' });
    } catch (e) {
      logMsg("⚠️ V2 Cache Parse Error: " + e.message);
    }
  }

  // Fallback to Drive
  try {
    const file = _getPayloadFileV2(false);
    if (!file) {
      logMsg("⚠️ V2 Payload File Not Found. Falling back to V1.");
      return _decoratePayloadMeta(getDashboardData(), {
        source: 'v1-fallback',
        fallback: true,
        reason: 'missing-v2-payload'
      });
    }

    const payloadStr = file.getBlob().getDataAsString();
    // Re-cache for future fast loads (30 mins)
    try { putChunkedCache(cache, CACHE_KEY, payloadStr, 1800); } catch(e) {}
    
    return _decoratePayloadMeta(_ensureDashboardSearchCatalog(JSON.parse(payloadStr)), {
      source: 'drive',
      payloadFileId: file.getId(),
      payloadUpdatedAt: file.getLastUpdated().toISOString()
    });
  } catch (e) {
    logMsg("❌ V2 Payload Fetch Error: " + e.message);
    return _decoratePayloadMeta(getDashboardData(), {
      source: 'v1-fallback',
      fallback: true,
      reason: 'v2-fetch-error'
    }); // Ultimate fallback
  }
}

/**
 * Builds the V2 dashboard payload from in-memory engine data and saves it to Drive.
 * Called at the end of generateDailyReviewCore.
 */
function buildAndSaveDashboardPayloadV2(reviewData, headers, highlightsData, optionalRefDict) {
  try {
    const buildStartMs = Date.now();
    const payloadTimings = {};
    logMsg("🔄 V2 PAYLOAD: Building JSON Blob from Engine Data...");
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let refDict = optionalRefDict || null;
    const refDictStartMs = Date.now();
    if (!refDict) refDict = getReferenceDictionary();
    payloadTimings.referenceDictMs = Date.now() - refDictStartMs;
    const vendorGoalsStartMs = Date.now();
    const vendorGoals = getVendorDailyGoals();
    payloadTimings.vendorGoalsMs = Date.now() - vendorGoalsStartMs;
    const cityCoordsStartMs = Date.now();
    const cityCoordinates = getCityCoordinates();
    payloadTimings.cityCoordinatesMs = Date.now() - cityCoordsStartMs;
    const fiberStatsStartMs = Date.now();
    const fiberStats = getVendorHybridStats();
    payloadTimings.vendorHybridStatsMs = Date.now() - fiberStatsStartMs;
    const logSheet = ss.getSheetByName(CHANGE_LOG_SHEET);
    
    const changeLogReadStartMs = Date.now();
    let globalLogs = [];
    if (logSheet && logSheet.getLastRow() > 1) {
      const logData = logSheet.getDataRange().getValues();
      for (let j = 1; j < logData.length; j++) {
        let timeVal = logData[j][4];
        let timeDisplay = (timeVal instanceof Date) ? Utilities.formatDate(timeVal, "GMT-6", "MM/dd/yy HH:mm") : String(timeVal || "");
        globalLogs.push({ fdh: String(logData[j][0] || ""), type: String(logData[j][1] || ""), val: String(logData[j][2] || ""), user: String(logData[j][3] || "System"), time: timeDisplay });
      }
    }
    payloadTimings.changeLogReadMs = Date.now() - changeLogReadStartMs;

    const actionItemsStartMs = Date.now();
    const defaultDrgTrackerUrl = VENDOR_TRACKER_ID ? `https://docs.google.com/spreadsheets/d/${VENDOR_TRACKER_ID}/edit` : "";
    let actionItems = _buildPortfolioActionItems({
      headers: headers,
      rows: reviewData,
      refDict: refDict,
      fiberStats: fiberStats,
      defaultDrgTrackerUrl: defaultDrgTrackerUrl
    });
    payloadTimings.actionItemsAssemblyMs = Date.now() - actionItemsStartMs;
    const searchProjects = _buildProjectSearchCatalog({
      headers: headers,
      rows: reviewData,
      refDict: refDict
    });

    const vendorCityRecordsStartMs = Date.now();
    const vendorCityRecords = buildVendorCityCoordinateRecords(actionItems, cityCoordinates);
    payloadTimings.vendorCityRecordsMs = Date.now() - vendorCityRecordsStartMs;
    const payload = {
      actionItems: actionItems,
      globalLogs: globalLogs,
      vendorGoals: vendorGoals,
      vendorCities: vendorCityRecords,
      totalRows: actionItems.length,
      headers: headers,
      refDataDate: String(PropertiesService.getScriptProperties().getProperty('refDataImportDate') || ""),
      allFdhIds: Object.keys(refDict),
      searchProjects: searchProjects,
      fiberStats: fiberStats,
      generatedAt: new Date().toISOString()
    };

    _decoratePayloadMeta(payload, {
      source: 'builder',
      startupContractVersion: 2
    });

    const payloadWriteStartMs = Date.now();
    const file = _getPayloadFileV2(true);
    file.setContent(JSON.stringify(payload));
    payloadTimings.fileWriteMs = Date.now() - payloadWriteStartMs;
    payloadTimings.totalMs = Date.now() - buildStartMs;
    
    // Clear Cache to force fresh load
    CacheService.getScriptCache().remove('dashboard_data_cache_v2_blob');
    PropertiesService.getScriptProperties().setProperty('QB_LAST_PAYLOAD_TIMINGS', JSON.stringify(payloadTimings));
    logMsg("V2 PAYLOAD timings: " + JSON.stringify(payloadTimings));
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
      _decoratePayloadMeta(payload, {
        source: 'patch',
        lastPatchedAt: new Date().toISOString()
      });
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

function _decoratePayloadMeta(payload, overrides) {
  if (!payload || typeof payload !== 'object') return payload;

  const nextMeta = Object.assign({}, payload._payloadMeta || {}, overrides || {});
  const actionItems = Array.isArray(payload.actionItems) ? payload.actionItems : [];
  const globalLogs = Array.isArray(payload.globalLogs) ? payload.globalLogs : [];

  nextMeta.startupContractVersion = Number(nextMeta.startupContractVersion || 2);
  nextMeta.generatedAt = nextMeta.generatedAt || payload.generatedAt || new Date().toISOString();
  nextMeta.actionItemCount = actionItems.length;
  nextMeta.globalLogCount = globalLogs.length;
  nextMeta.hasFallback = !!nextMeta.fallback;

  payload._payloadMeta = nextMeta;
  return payload;
}

/**
 * 📡 Lightweight polling endpoint to detect if the Signal popup should be triggered.
 * Compares client's last seen time with the server's latest signal event.
 */
function checkSignalUpdates(lastClientTimeMs) {
  const latestEvent = Number(PropertiesService.getScriptProperties().getProperty("LATEST_SIGNAL_EVENT_MS") || 0);
  const lastClient = Number(lastClientTimeMs || 0);

  return {
    hasUpdates: latestEvent > lastClient,
    latestEvent: latestEvent
  };
}

// ============================================================
// TOP OFFENDERS — PM Email Config (Script Properties)
// ============================================================

function getVendorPmEmailMap() {
  var raw = PropertiesService.getScriptProperties().getProperty('VENDOR_PM_EMAILS');
  try { return raw ? JSON.parse(raw) : {}; } catch(e) { return {}; }
}

function saveVendorPmEmailMap(mapObj) {
  PropertiesService.getScriptProperties().setProperty('VENDOR_PM_EMAILS', JSON.stringify(mapObj || {}));
}

function getVendorPmEmailsForUI() {
  return getVendorPmEmailMap();
}

function saveVendorPmEmailsFromUI(mapObj) {
  if (!mapObj || typeof mapObj !== 'object') throw new Error('Invalid email map.');
  saveVendorPmEmailMap(mapObj);
  return 'Saved';
}

// ============================================================
// TOP OFFENDERS — CSV Export
// ============================================================

function exportOffendersCsv(vendorList, recipientEmail) {
  if (!recipientEmail) throw new Error('No recipient email provided.');

  var payload = getDashboardDataV2();
  var items = (payload && payload.actionItems) ? payload.actionItems : [];

  var filterSet = (vendorList && vendorList.length > 0)
    ? vendorList.reduce(function(acc, v) { acc[v] = true; return acc; }, {})
    : null;

  var rows = items.filter(function(item) {
    if (!item.vendor || !item.flags) return false;
    if (filterSet && !filterSet[item.vendor]) return false;
    // Mirror the frontend active-only gate: exclude Complete and On Hold
    var stat = (item.status || '').toLowerCase();
    var st   = (item.stage  || '').toLowerCase();
    if (stat.includes('complete') || stat.includes('hold')) return false;
    return true;
  });

  // Collect all unique flag types across the selected rows
  var flagSet = {};
  rows.forEach(function(item) {
    (item.flags || '').split('\n').forEach(function(f) {
      f = f.trim();
      if (f) flagSet[f] = true;
    });
  });
  var flagCols = Object.keys(flagSet).sort();

  // Build CSV
  var META_COLS = ['Vendor', 'FDH', 'City', 'Stage', 'Status'];
  var allCols = META_COLS.concat(flagCols);

  function csvCell(val) {
    var s = String(val == null ? '' : val);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  var lines = [allCols.map(csvCell).join(',')];
  rows.forEach(function(item) {
    var itemFlags = {};
    (item.flags || '').split('\n').forEach(function(f) {
      f = f.trim();
      if (f) itemFlags[f] = true;
    });
    var row = [
      item.vendor || '',
      item.fdh || '',
      item.city || '',
      item.stage || '',
      item.status || ''
    ].concat(flagCols.map(function(f) { return itemFlags[f] ? '1' : ''; }));
    lines.push(row.map(csvCell).join(','));
  });

  var csvContent = lines.join('\r\n');
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM.dd.yy');
  var fileName = 'Top_Offenders_Export_' + dateStr + '.csv';
  var blob = Utilities.newBlob(csvContent, MimeType.CSV, fileName);

  var vendorLabel = filterSet
    ? vendorList.join(', ')
    : 'All Vendors';

  MailApp.sendEmail({
    to: recipientEmail,
    subject: 'PMO Top Offenders Export — ' + dateStr,
    body: 'Top Offenders CSV export attached.\n\nVendors: ' + vendorLabel + '\nProjects: ' + rows.length + '\nGenerated: ' + new Date().toLocaleString(),
    attachments: [blob]
  });

  return 'CSV emailed to ' + recipientEmail + ' (' + rows.length + ' projects, ' + flagCols.length + ' flag types)';
}

// ============================================================
// TOP OFFENDERS — Weekly PMO Bot Report
// ============================================================

function sendWeeklyOffendersReport() {
  var pmEmailMap = getVendorPmEmailMap();
  var payload = getDashboardDataV2();
  var items = (payload && payload.actionItems) ? payload.actionItems : [];

  // Group flagged items by vendor
  var vendorMap = {};
  items.forEach(function(item) {
    if (!item.vendor || !item.flags) return;
    var flags = item.flags.split('\n').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
    if (!flags.length) return;
    if (!vendorMap[item.vendor]) vendorMap[item.vendor] = [];
    vendorMap[item.vendor].push({ fdh: item.fdh, city: item.city, stage: item.stage, status: item.status, flags: flags });
  });

  // Group vendors by PM email
  var pmGroups = {};
  Object.keys(vendorMap).forEach(function(vendor) {
    var email = pmEmailMap[vendor];
    if (!email) {
      logMsg('WARN', 'sendWeeklyOffendersReport', 'No PM email configured for vendor: ' + vendor);
      return;
    }
    if (!pmGroups[email]) pmGroups[email] = {};
    pmGroups[email][vendor] = vendorMap[vendor];
  });

  var weekOf = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');

  Object.keys(pmGroups).forEach(function(pmEmail) {
    var vendorSections = pmGroups[pmEmail];
    var totalFlags = 0;
    var htmlParts = [
      '<div style="font-family:Arial,sans-serif;max-width:700px">',
      '<h2 style="color:#1e293b">PMO Weekly Flag Summary — Week of ' + weekOf + '</h2>',
      '<p>Vendor flag summary for your assigned projects:</p>'
    ];

    Object.keys(vendorSections).sort().forEach(function(vendor) {
      var projects = vendorSections[vendor];
      var flagCounts = {};
      projects.forEach(function(p) {
        p.flags.forEach(function(f) { flagCounts[f] = (flagCounts[f] || 0) + 1; });
        totalFlags += p.flags.length;
      });

      htmlParts.push('<hr style="border:1px solid #e2e8f0">');
      htmlParts.push('<h3 style="color:#0f172a;margin-bottom:4px">' + vendor + ' <span style="font-size:13px;color:#64748b">(' + projects.length + ' flagged projects)</span></h3>');

      var flagSummary = Object.keys(flagCounts).sort().map(function(f) {
        return '<li>' + f + ' &times;' + flagCounts[f] + '</li>';
      }).join('');
      htmlParts.push('<ul style="margin:4px 0 8px 16px;color:#475569">' + flagSummary + '</ul>');

      var tableRows = projects.map(function(p) {
        return '<tr><td style="padding:3px 8px">' + (p.fdh || '') + '</td>'
          + '<td style="padding:3px 8px">' + (p.city || '') + '</td>'
          + '<td style="padding:3px 8px">' + (p.stage || '') + '</td>'
          + '<td style="padding:3px 8px">' + (p.status || '') + '</td>'
          + '<td style="padding:3px 8px;color:#dc2626;font-size:12px">' + p.flags.join(', ') + '</td></tr>';
      }).join('');
      htmlParts.push('<table style="border-collapse:collapse;width:100%;font-size:13px">');
      htmlParts.push('<tr style="background:#f1f5f9;font-weight:bold"><th style="padding:4px 8px;text-align:left">FDH</th><th style="padding:4px 8px;text-align:left">City</th><th style="padding:4px 8px;text-align:left">Stage</th><th style="padding:4px 8px;text-align:left">Status</th><th style="padding:4px 8px;text-align:left">Flags</th></tr>');
      htmlParts.push(tableRows);
      htmlParts.push('</table>');
    });

    htmlParts.push('<hr style="border:1px solid #e2e8f0">');
    htmlParts.push('<p style="color:#64748b;font-size:12px">Total portfolio flags across your vendors: <strong>' + totalFlags + '</strong><br>Auto-generated by PMO Bot each Monday. Open the Omni PMO App for details.</p>');
    htmlParts.push('</div>');

    GmailApp.sendEmail(pmEmail, '[PMO Bot] Weekly Flag Summary — Week of ' + weekOf, '', {
      htmlBody: htmlParts.join('')
    });
    logMsg('sendWeeklyOffendersReport: emailed ' + pmEmail + ' (' + Object.keys(vendorSections).length + ' vendors)');
  });
}

function setupWeeklyOffendersTrigger() {
  var allTriggers = ScriptApp.getProjectTriggers();
  if (allTriggers.length >= 15) {
    logMsg('WARN', 'setupWeeklyOffendersTrigger', 'Trigger quota near limit (' + allTriggers.length + '/20). Aborting.');
    SpreadsheetApp.getUi().alert('Trigger quota near limit. Delete unused triggers first.');
    return;
  }
  var deleted = _deleteProjectTriggersByHandler_('sendWeeklyOffendersReport');
  ScriptApp.newTrigger('sendWeeklyOffendersReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  var count = _listProjectTriggersByHandler_('sendWeeklyOffendersReport').length;
  logMsg('setupWeeklyOffendersTrigger: deleted=' + deleted + ', active=' + count + ', fires=Monday@7am');
  SpreadsheetApp.getUi().alert('Weekly Offenders Report scheduled for Monday at 7am.');
}

// ============================================================
// WORK LOG AUDIT — Reconciliation & Export
// ============================================================

/**
 * Fetches data for the Work Log Audit.
 * Groups by Vendor > City > FDH.
 */
function getWorkLogAuditData(startDate, endDate, vendorFilter) {
  try {
    logMsg("INFO", "getWorkLogAuditData", "Starting audit fetch for " + startDate + " to " + endDate);
    const qbRecords = _fetchQBWorkLogRange(startDate, endDate, vendorFilter);
    const archiveRecords = _fetchArchiveWorkLogRange(startDate, endDate, vendorFilter);
    const refDict = getReferenceDictionary(); // For City info
    
    return _reconcileWorkLogAudit(qbRecords, archiveRecords, refDict, startDate, endDate);
  } catch (e) {
    logMsg("ERROR", "getWorkLogAuditData", e.message);
    throw e;
  }
}

/**
 * Fetches records from QB Work Log table for a date range.
 */
function _fetchQBWorkLogRange(startDate, endDate, vendorFilter) {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) throw new Error("QB_USER_TOKEN not found.");

  const dateFid = QB_DAILY_LOG_FID_MAP["Date"];
  const vendorFid = QB_DAILY_LOG_FID_MAP["Contractor"];
  
  // QuickBase Date Operators: OAF (On or After), OBF (On or Before)
  let where = `{${dateFid}.OAF.'${startDate}'} AND {${dateFid}.OBF.'${endDate}'}`;
  if (vendorFilter && vendorFilter !== "ALL") {
    const escapedVendor = vendorFilter.replace(/'/g, "\\'");
    where += ` AND {${vendorFid}.EX.'${escapedVendor}'}`;
  }

  const fids = Object.values(QB_DAILY_LOG_FID_MAP);
  if (!fids.includes(3)) fids.push(3);

  logMsg("INFO", "_fetchQBWorkLogRange", "Querying QB Table " + QB_DAILY_LOG_TABLE_ID + " with where: " + where);
  const rawRecords = _fetchTableAllFids(token, QB_DAILY_LOG_TABLE_ID, fids, where);
  logMsg("INFO", "_fetchQBWorkLogRange", "Found " + rawRecords.length + " QB records");
  
  const fidToLabel = {};
  Object.keys(QB_DAILY_LOG_FID_MAP).forEach(label => {
    fidToLabel[QB_DAILY_LOG_FID_MAP[label]] = label;
  });
  fidToLabel[3] = "Record ID#";

  return rawRecords.map(rec => {
    const obj = {};
    Object.keys(rec).forEach(fid => {
      const label = fidToLabel[fid];
      if (label) obj[label] = _extractValue(rec[fid].value);
    });
    return obj;
  });
}

function _fetchArchiveWorkLogRange(startDate, endDate, vendorFilter) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  if (!histSheet || histSheet.getLastRow() < 2) return [];

  const dateArr = _getDatesInRange(startDate, endDate);
  const data = histSheet.getDataRange().getValues();
  const headers = data[0];
  const vendorColIdx = HISTORY_HEADERS.indexOf("Contractor");

  logMsg("INFO", "_fetchArchiveWorkLogRange", "Filtering Master Archive for " + dateArr.length + " days...");

  const filteredRows = data.filter((row, idx) => {
    if (idx === 0) return false;
    
    if (vendorFilter && vendorFilter !== "ALL") {
        let rowVendor = String(row[vendorColIdx] || "").trim();
        if (rowVendor.toUpperCase() !== vendorFilter.toUpperCase()) return false;
    }

    let rowDate = (row[0] instanceof Date) ? Utilities.formatDate(row[0], "GMT-5", "yyyy-MM-dd") : normalizeDateString(row[0]);
    return dateArr.includes(rowDate);
  });

  logMsg("INFO", "_fetchArchiveWorkLogRange", "Found " + filteredRows.length + " Archive records");
  if (filteredRows.length === 0) return [];

  const prevTotals = _buildPrevTotalsLookup(histSheet, dateArr);
  const qbData = _mapHistoryRowsWithCorrections(filteredRows, prevTotals);
  
  return qbData.map(row => {
    const obj = {};
    QB_HEADERS.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    return obj;
  });
}

/**
 * Generates an array of ISO date strings between start and end (inclusive).
 */
function _getDatesInRange(startStr, endStr) {
  const dates = [];
  let curr = new Date(startStr.replace(/-/g, '/') + " 12:00:00");
  const end = new Date(endStr.replace(/-/g, '/') + " 12:00:00");
  
  while (curr <= end) {
    dates.push(Utilities.formatDate(curr, "GMT-5", "yyyy-MM-dd"));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/**
 * Reconciles Archive vs QB and groups into hierarchy: Vendor > City > FDH > Date.
 */
function _reconcileWorkLogAudit(qbRecords, archiveRecords, refDict, startDate, endDate) {
  const auditMap = {}; 
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Get Lifetime Archive Totals (from the entire Master Archive)
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const histData = histSheet ? histSheet.getDataRange().getValues() : [];
  const histHeaders = histData.length > 0 ? histData[0].map(h => String(h).trim()) : [];
  const fdhIdxH = histHeaders.indexOf("FDH Engineering ID");
  const totUgIdxH = histHeaders.indexOf("Total UG Footage Completed");
  const totAeIdxH = histHeaders.indexOf("Total Strand Footage Completed"); // Note: Verify exact header in src
  const totFbIdxH = histHeaders.indexOf("Total Fiber Footage Completed");
  const totNpIdxH = histHeaders.indexOf("Total NAPs Completed");

  const latestArchiveTotals = {};
  if (fdhIdxH > -1) {
    // Master Archive is oldest-to-newest, so later rows overwrite earlier ones
    for (let i = 1; i < histData.length; i++) {
        const row = histData[i];
        const fdh = String(row[fdhIdxH] || "").trim().toUpperCase();
        if (!fdh) continue;
        latestArchiveTotals[fdh] = {
            ug: totUgIdxH > -1 ? (Number(row[totUgIdxH]) || 0) : 0,
            ae: totAeIdxH > -1 ? (Number(row[totAeIdxH]) || 0) : 0,
            fib: totFbIdxH > -1 ? (Number(row[totFbIdxH]) || 0) : 0,
            nap: totNpIdxH > -1 ? (Number(row[totNpIdxH]) || 0) : 0
        };
    }
  }

  // 2. Get Lifetime QB Totals (from Reference Data)
  const refSheet = ss.getSheetByName(REF_SHEET);
  const refDataRows = refSheet ? refSheet.getDataRange().getValues() : [];
  const refHeaders = refDataRows.length > 0 ? refDataRows[0].map(h => String(h).trim()) : [];
  const fdhIdxR = refHeaders.indexOf("FDH Engineering ID");
  const totUgIdxR = refHeaders.indexOf("Total UG Completed");
  const totAeIdxR = refHeaders.indexOf("Total Strand Completed");
  const totFbIdxR = refHeaders.indexOf("Total Fiber Completed");
  const totNpIdxR = refHeaders.indexOf("Total NAPs Completed");

  const qbReferenceTotals = {};
  if (fdhIdxR > -1) {
    for (let i = 1; i < refDataRows.length; i++) {
        const row = refDataRows[i];
        const fdh = String(row[fdhIdxR] || "").trim().toUpperCase();
        if (!fdh) continue;
        qbReferenceTotals[fdh] = {
            ug: totUgIdxR > -1 ? (Number(row[totUgIdxR]) || 0) : 0,
            ae: totAeIdxR > -1 ? (Number(row[totAeIdxR]) || 0) : 0,
            fib: totFbIdxR > -1 ? (Number(row[totFbIdxR]) || 0) : 0,
            nap: totNpIdxR > -1 ? (Number(row[totNpIdxR]) || 0) : 0
        };
    }
  }

  const getTargetBucket = (rec) => {
    const fdh = String(rec["FDH Engineering ID"] || "").trim().toUpperCase();
    const vendor = String(rec["Contractor"] || "Unknown Vendor").trim();
    const refData = refDict[fdh] || {};
    const city = String(refData.city || "Unknown City").trim();

    if (!auditMap[vendor]) auditMap[vendor] = { _totals: _emptyAuditTotals(), _cities: {} };
    if (!auditMap[vendor]._cities[city]) auditMap[vendor]._cities[city] = { _totals: _emptyAuditTotals(), _fdhs: {} };
    if (!auditMap[vendor]._cities[city]._fdhs[fdh]) auditMap[vendor]._cities[city]._fdhs[fdh] = { _totals: _emptyAuditTotals(), _dates: {} };

    return auditMap[vendor]._cities[city]._fdhs[fdh];
  };

  const processRecord = (rec, type) => {
    const rawDate = rec["Date"];
    const dateStr = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "GMT-5", "yyyy-MM-dd") : normalizeDateString(rawDate);
    if (!dateStr) return;

    const bucket = getTargetBucket(rec);
    if (!bucket._dates[dateStr]) bucket._dates[dateStr] = { archive: null, qb: null };
    bucket._dates[dateStr][type] = rec;
  };

  archiveRecords.forEach(rec => processRecord(rec, 'archive'));
  qbRecords.forEach(rec => processRecord(rec, 'qb'));

  const shortStart = startDate.substring(5).replace("-", "/"); 
  const shortEnd = endDate.substring(5).replace("-", "/");

  // Final pass to calculate totals and identify discrepancies
  Object.keys(auditMap).forEach(v => {
    const vendor = auditMap[v];
    Object.keys(vendor._cities).forEach(c => {
      const city = vendor._cities[c];
      Object.keys(city._fdhs).forEach(f => {
        const fdhKey = f;
        const fdh = city._fdhs[f];
        Object.keys(fdh._dates).forEach(d => {
          const pair = fdh._dates[d];
          const diff = _calculateWorkLogDiff(pair.archive, pair.qb);
          pair.diff = diff;
          
          _accumulateAuditTotals(fdh._totals, diff);
          _accumulateAuditTotals(city._totals, diff);
          _accumulateAuditTotals(vendor._totals, diff);
        });

        // 3. Inject RECONCILE row based on LIFETIME Database vs QB Alignment
        const archTotal = latestArchiveTotals[fdhKey] || { ug: 0, ae: 0, fib: 0, nap: 0 };
        const qbTotal   = qbReferenceTotals[fdhKey]   || { ug: 0, ae: 0, fib: 0, nap: 0 };

        // Adjustment needed: Archive - QB
        const adjustUG = archTotal.ug - qbTotal.ug;
        const adjustAE = archTotal.ae - qbTotal.ae;
        const adjustFB = archTotal.fib - qbTotal.fib;
        const adjustNP = archTotal.nap - qbTotal.nap;

        if (adjustUG !== 0 || adjustAE !== 0 || adjustFB !== 0 || adjustNP !== 0) {
            fdh._dates['RECONCILE'] = {
                archive: {
                    "Daily UG Footage": adjustUG,
                    "Daily Strand Footage": adjustAE,
                    "Daily Fiber Footage": adjustFB,
                    "Daily NAPs/Encl. Completed": adjustNP,
                    "Construction Comments": `[LIFETIME RECONCILE] Master adjustment to align QuickBase Rollups (${qbTotal.ug}ft) with Archive Running Totals (${archTotal.ug}ft).`
                },
                qb: {},
                diff: {
                    archive: { ug: adjustUG, ae: adjustAE, fib: adjustFB, nap: adjustNP },
                    qb: { ug: 0, ae: 0, fib: 0, nap: 0 },
                    delta: { ug: -adjustUG, ae: -adjustAE, fib: -adjustFB, nap: -adjustNP }, // diff is QB-Archive
                    hasDiscrepancy: true
                }
            };
        }
      });
    });
  });

  return JSON.parse(JSON.stringify(auditMap));
}



function _emptyAuditTotals() {
  return { ug: 0, ae: 0, fib: 0, nap: 0, ugDiff: 0, aeDiff: 0, fibDiff: 0, napDiff: 0 };
}

function _accumulateAuditTotals(totalObj, diff) {
  totalObj.ug += diff.archive.ug;
  totalObj.ae += diff.archive.ae;
  totalObj.fib += diff.archive.fib;
  totalObj.nap += diff.archive.nap;
  totalObj.ugDiff += diff.delta.ug;
  totalObj.aeDiff += diff.delta.ae;
  totalObj.fibDiff += diff.delta.fib;
  totalObj.napDiff += diff.delta.nap;
}

function _calculateWorkLogDiff(archive, qb) {
  const getVal = (obj, key) => Number(obj && obj[key]) || 0;
  
  const aVals = {
    ug: getVal(archive, "Daily UG Footage"),
    ae: getVal(archive, "Daily Strand Footage"),
    fib: getVal(archive, "Daily Fiber Footage"),
    nap: getVal(archive, "Daily NAPs/Encl. Completed")
  };
  
  const qVals = {
    ug: getVal(qb, "Daily UG Footage"),
    ae: getVal(qb, "Daily Strand Footage"),
    fib: getVal(qb, "Daily Fiber Footage"),
    nap: getVal(qb, "Daily NAPs/Encl. Completed")
  };

  return {
    archive: aVals,
    qb: qVals,
    delta: {
      ug: qVals.ug - aVals.ug,
      ae: qVals.ae - aVals.ae,
      fib: qVals.fib - aVals.fib,
      nap: qVals.nap - aVals.nap
    },
    hasDiscrepancy: (qVals.ug !== aVals.ug || qVals.ae !== aVals.ae || qVals.fib !== aVals.fib || qVals.nap !== aVals.nap)
  };
}

function exportBOMCSVForRows(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = ["FDH", "Vendor", "QB UG", "Archive UG", "QB ST", "Archive ST", "QB FB", "Archive FB", "QB NP", "Archive NP", "Has Diff"];
  let csv = headers.join(",") + "\n";
  rows.forEach(r => {
    csv += [
      r.fdh,
      `"${(r.vendor || '').replace(/\"/g, '\"\"')}"`,
      r.qbUG, r.vendorUG,
      r.qbAE, r.vendorAE,
      r.qbFib, r.vendorFib,
      r.qbNAP, r.vendorNAP,
      r.hasDiff
    ].join(",") + "\n";
  });
  return csv;
}

/**
 * Generates a multi-tab Google Sheet export of the Work Log Audit.
 */
function exportWorkLogAuditToSheet(auditData, startDate, endDate) {
  try {
    const ss = SpreadsheetApp.create(`Work_Log_Audit_${startDate}_to_${endDate}`);
    const summarySheet = ss.getSheets()[0];
    summarySheet.setName("Executive Summary");
    
    const summaryHeaders = ["Vendor", "City", "UG Archive", "UG QB", "UG Delta", "ST Archive", "ST QB", "ST Delta", "FB Archive", "FB QB", "FB Delta", "NP Archive", "NP QB", "NP Delta"];
    const summaryRows = [];

    const detailSheet = ss.insertSheet("Audit Detail");
    const detailHeaders = ["Vendor", "City", "FDH ID", "Date", "Metric", "Archive Value", "QuickBase Value", "Delta", "Comments"];
    const detailRows = [];

    Object.keys(auditData).sort().forEach(vName => {
      const vData = auditData[vName];
      Object.keys(vData._cities).sort().forEach(cName => {
        const cData = vData._cities[cName];
        
        summaryRows.push([
          vName, cName,
          cData._totals.ug, cData._totals.ug + cData._totals.ugDiff, cData._totals.ugDiff,
          cData._totals.ae, cData._totals.ae + cData._totals.aeDiff, cData._totals.aeDiff,
          cData._totals.fib, cData._totals.fib + cData._totals.fibDiff, cData._totals.fibDiff,
          cData._totals.nap, cData._totals.nap + cData._totals.napDiff, cData._totals.napDiff
        ]);

        Object.keys(cData._fdhs).sort().forEach(fId => {
          const fData = cData._fdhs[fId];
          Object.keys(fData._dates).sort().reverse().forEach(date => {
            const pair = fData._dates[date];
            const metrics = [
              { label: 'UG Footage', key: 'ug' },
              { label: 'Strand Footage', key: 'ae' },
              { label: 'Fiber Footage', key: 'fib' },
              { label: 'NAPs/Encl', key: 'nap' }
            ];
            
            const comment = (pair.archive && pair.archive["Construction Comments"]) || (pair.qb && pair.qb["Construction Comments"]) || "";

            metrics.forEach(m => {
              detailRows.push([
                vName, cName, fId, date, m.label,
                pair.diff.archive[m.key], pair.diff.qb[m.key], pair.diff.delta[m.key],
                comment
              ]);
            });
          });
        });
      });
    });

    // Write Summary
    summarySheet.getRange(1, 1, 1, summaryHeaders.length).setValues([summaryHeaders]).setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
    if (summaryRows.length > 0) summarySheet.getRange(2, 1, summaryRows.length, summaryHeaders.length).setValues(summaryRows);
    summarySheet.setFrozenRows(1);
    summarySheet.autoResizeColumns(1, summaryHeaders.length);

    // Write Detail
    detailSheet.getRange(1, 1, 1, detailHeaders.length).setValues([detailHeaders]).setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
    if (detailRows.length > 0) {
        ensureCapacity(detailSheet, detailRows.length + 1, detailHeaders.length);
        detailSheet.getRange(2, 1, detailRows.length, detailHeaders.length).setValues(detailRows);
    }
    detailSheet.setFrozenRows(1);
    detailSheet.autoResizeColumns(1, detailHeaders.length);

    // Apply conditional formatting
    const applyDeltaFormatting = (sheet, colIndex, rowCount) => {
        if (rowCount === 0) return;
        const range = sheet.getRange(2, colIndex, rowCount, 1);
        sheet.setConditionalFormatRules([
            SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor("#16a34a").setRanges([range]).build(),
            SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor("#dc2626").setRanges([range]).build()
        ]);
    };

    [5, 8, 11, 14].forEach(col => applyDeltaFormatting(summarySheet, col, summaryRows.length));
    applyDeltaFormatting(detailSheet, 8, detailRows.length);

    logMsg("INFO", "exportWorkLogAuditToSheet", `Exported audit to ${ss.getUrl()}`);
    return ss.getUrl();
  } catch (e) {
    logMsg("ERROR", "exportWorkLogAuditToSheet", e.message);
    throw e;
  }
}

