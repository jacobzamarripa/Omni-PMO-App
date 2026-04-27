/**
 * FILE: 08_BulkActions.js
 * PURPOSE: Bulk PMO operations for the Action Center bulk surface.
 *   - Bulk write Manager Comments (FID 188) and Status (FID 746) to QB
 *   - BOM comparison data (QB vs archive vendor)
 *   - Crossings CSV parse / stage
 *   - Report CSV exports to Drive
 *   - Change log extension for quick peek panel
 */

// ── QB write constants (FID 188, 746) ────────────────────
const BULK_COMMENT_FID = "188"; // Manager Note
const BULK_STATUS_FID  = "746"; // Status ID

// ── Folder resolver — falls back to COMPILED_FOLDER_ID ───
function _baReportFolder(specificId) {
  if (specificId) {
    try { return DriveApp.getFolderById(specificId); } catch(e) {}
  }
  return DriveApp.getFolderById(COMPILED_FOLDER_ID);
}

// ── CSV escape helper ─────────────────────────────────────
function _baCsvEsc(v) {
  var s = String(v == null ? '' : v).replace(/"/g, '""').replace(/\n/g, ' ');
  return '"' + s + '"';
}

// ── Date stamp string ─────────────────────────────────────
function _baNow() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
}

// ════════════════════════════════════════════════════════════
// BULK COMMENTS — PATCH FID 188 to QuickBase
// ════════════════════════════════════════════════════════════
/**
 * Writes Manager Notes in bulk to QuickBase.
 * @param {Array<{fdh:string, rid:string, comment:string}>} payload
 */
function bulkWriteManagerComments(payload) {
  if (!payload || !payload.length) return { written: 0 };
  const refDict = getReferenceDictionary();
  const records = [];
  payload.forEach(function(item) {
    var ref = refDict[(item.fdh || '').toString().toUpperCase()];
    var rid = (ref && ref.rid) ? ref.rid : item.rid;
    if (!rid || !item.comment) return;
    records.push({ id: Number(rid), fields: { [BULK_COMMENT_FID]: item.comment } });
  });
  if (!records.length) return { written: 0 };
  var chunks = _baChunk(records, 100);
  chunks.forEach(function(chunk) { writebackQBDirect(QB_TABLE_ID, chunk); });
  logMsg('bulkWriteManagerComments: wrote ' + records.length + ' Manager Notes to QB');
  return { written: records.length };
}

// ════════════════════════════════════════════════════════════
// BULK STATUS — PATCH FID 746 to QuickBase
// ════════════════════════════════════════════════════════════
/**
 * Writes Status in bulk to QuickBase.
 * @param {Array<{fdh:string, rid:string, status:string}>} payload
 */
function bulkWriteStatus(payload) {
  if (!payload || !payload.length) return { written: 0 };
  const refDict = getReferenceDictionary();
  const records = [];
  payload.forEach(function(item) {
    var ref = refDict[(item.fdh || '').toString().toUpperCase()];
    var rid = (ref && ref.rid) ? ref.rid : item.rid;
    if (!rid || !item.status) return;
    records.push({ id: Number(rid), fields: { [BULK_STATUS_FID]: item.status } });
  });
  if (!records.length) return { written: 0 };
  var chunks = _baChunk(records, 100);
  chunks.forEach(function(chunk) { writebackQBDirect(QB_TABLE_ID, chunk); });
  logMsg('bulkWriteStatus: wrote ' + records.length + ' status updates to QB');
  return { written: records.length };
}

// ════════════════════════════════════════════════════════════
// BOM COMPARISON DATA
// ════════════════════════════════════════════════════════════
/**
 * Returns per-FDH BOM data: QB values (from Reference Data) vs
 * vendor-reported values (from Mirror / archive rows).
 * @returns {Array<Object>}
 */
function getBOMComparisonData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read QB BOM from Reference Data sheet
  const refSheet = ss.getSheetByName(REF_SHEET);
  if (!refSheet || refSheet.getLastRow() < 2) return [];
  const refData = refSheet.getDataRange().getValues();
  const refHeaders = refData[0].map(function(h){ return String(h).trim(); });
  const fdhColR    = refHeaders.indexOf('FDH Engineering ID');
  const vendorColR = refHeaders.indexOf('CX Vendor');
  const ugColR     = refHeaders.indexOf('UG BOM Quantity');
  const aeColR     = refHeaders.indexOf('Strand BOM Quantity');
  const fibColR    = refHeaders.indexOf('Fiber BOM Quantity');
  const napColR    = refHeaders.indexOf('NAP/Encl. BOM Qty.');

  // Build QB BOM map keyed by uppercase FDH
  var qbBomMap = {};
  for (var i = 1; i < refData.length; i++) {
    var row = refData[i];
    var fdh = fdhColR > -1 ? String(row[fdhColR] || '').trim().toUpperCase() : '';
    if (!fdh) continue;
    qbBomMap[fdh] = {
      vendor: vendorColR > -1 ? String(row[vendorColR] || '') : '',
      qbUG:   ugColR  > -1 ? (Number(row[ugColR])  || 0) : 0,
      qbAE:   aeColR  > -1 ? (Number(row[aeColR])  || 0) : 0,
      qbFib:  fibColR > -1 ? (Number(row[fibColR]) || 0) : 0,
      qbNAP:  napColR > -1 ? (Number(row[napColR]) || 0) : 0
    };
  }

  // Read vendor BOM from Mirror sheet (archive data)
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  var vendorBomMap = {};
  if (mirrorSheet && mirrorSheet.getLastRow() > 1) {
    const mirrorData = mirrorSheet.getDataRange().getValues();
    const mHeaders   = mirrorData[0].map(function(h){ return String(h).trim(); });
    const fdhColM    = mHeaders.indexOf('FDH Engineering ID');
    const ugColM     = mHeaders.indexOf('UG BOM Quantity');
    const aeColM     = mHeaders.indexOf('Strand BOM Quantity');
    const fibColM    = mHeaders.indexOf('Fiber BOM Quantity');
    const napColM    = mHeaders.indexOf('NAP/Encl. BOM Qty.');
    // Use the most recent row per FDH (mirror is ordered newest-first or last-row-wins)
    for (var j = 1; j < mirrorData.length; j++) {
      var mRow = mirrorData[j];
      var mFdh = fdhColM > -1 ? String(mRow[fdhColM] || '').trim().toUpperCase() : '';
      if (!mFdh) continue;
      if (vendorBomMap[mFdh]) continue; // first occurrence = most recent
      vendorBomMap[mFdh] = {
        vendorUG:  ugColM  > -1 ? (Number(mRow[ugColM])  || 0) : 0,
        vendorAE:  aeColM  > -1 ? (Number(mRow[aeColM])  || 0) : 0,
        vendorFib: fibColM > -1 ? (Number(mRow[fibColM]) || 0) : 0,
        vendorNAP: napColM > -1 ? (Number(mRow[napColM]) || 0) : 0
      };
    }
  }

  // Merge and compute diffs
  var results = [];
  Object.keys(qbBomMap).forEach(function(fdh) {
    var qb = qbBomMap[fdh];
    var v  = vendorBomMap[fdh] || { vendorUG: 0, vendorAE: 0, vendorFib: 0, vendorNAP: 0 };
    var hasDiff =
      (qb.qbUG  > 0 && v.vendorUG  > 0 && qb.qbUG  !== v.vendorUG)  ||
      (qb.qbAE  > 0 && v.vendorAE  > 0 && qb.qbAE  !== v.vendorAE)  ||
      (qb.qbFib > 0 && v.vendorFib > 0 && qb.qbFib !== v.vendorFib) ||
      (qb.qbNAP > 0 && v.vendorNAP > 0 && qb.qbNAP !== v.vendorNAP);
    results.push({
      fdh:       fdh,
      vendor:    qb.vendor,
      qbUG:      qb.qbUG,
      qbAE:      qb.qbAE,
      qbFib:     qb.qbFib,
      qbNAP:     qb.qbNAP,
      vendorUG:  v.vendorUG,
      vendorAE:  v.vendorAE,
      vendorFib: v.vendorFib,
      vendorNAP: v.vendorNAP,
      hasDiff:   hasDiff
    });
  });

  // Diffs first
  results.sort(function(a, b) {
    if (a.hasDiff !== b.hasDiff) return a.hasDiff ? -1 : 1;
    return (a.fdh || '').localeCompare(b.fdh || '');
  });

  return results;
}

// ════════════════════════════════════════════════════════════
// CROSSINGS CSV PARSE
// ════════════════════════════════════════════════════════════
/**
 * Accepts a base64-encoded CSV/TSV from the browser, parses it,
 * validates FDHs against Reference Data, and returns a preview.
 * Expected columns (case-insensitive): FDH, Xing/Crossing, Details
 * @param {string} base64Csv
 * @returns {{valid:Array, skipped:Array, errors:Array}}
 */
function parseCrossingsCSV(base64Csv) {
  var raw = Utilities.newBlob(Utilities.base64Decode(base64Csv)).getDataAsString();
  var rows = Utilities.parseCsv(raw);
  if (!rows || rows.length < 2) return { valid: [], skipped: [], errors: ['File appears empty or has no data rows.'] };

  var headers = rows[0].map(function(h){ return String(h).trim().toLowerCase(); });
  var fdhIdx  = _baFindCol(headers, ['fdh', 'fdh engineering id', 'fdh id', 'engineering id']);
  var xingIdx = _baFindCol(headers, ['xing', 'crossing', 'special crossings', 'special crossings?', 'crossing status']);
  var detIdx  = _baFindCol(headers, ['details', 'crossing details', 'special crossing details', 'notes', 'sheet names']);

  if (fdhIdx < 0) return { valid: [], skipped: [], errors: ['Could not find FDH column. Expected header: "FDH" or "FDH Engineering ID".'] };
  if (xingIdx < 0) return { valid: [], skipped: [], errors: ['Could not find Crossing column. Expected header: "Xing" or "Crossing Status".'] };

  const refDict = getReferenceDictionary();
  var valid   = [];
  var skipped = [];
  var errors  = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.every(function(c){ return !c.trim(); })) continue; // blank row

    var fdh  = String(row[fdhIdx]  || '').trim();
    var xing = String(row[xingIdx] || '').trim().toUpperCase();
    var det  = detIdx >= 0 ? String(row[detIdx] || '').trim() : '';

    if (!fdh) { errors.push('Row ' + (i+1) + ': empty FDH'); continue; }

    // Validate xing value
    if (xing && !['YES','NO','N/A',''].includes(xing)) {
      errors.push('Row ' + (i+1) + ' (' + fdh + '): invalid crossing value "' + xing + '"');
      continue;
    }

    // Validate against reference dictionary
    var ref = refDict[fdh.toUpperCase()];
    if (!ref) { skipped.push(fdh); continue; }

    valid.push({ fdh: fdh, xing: xing || '', details: det });
  }

  return { valid: valid, skipped: skipped, errors: errors };
}

function _baFindCol(headers, aliases) {
  for (var a = 0; a < aliases.length; a++) {
    var idx = headers.indexOf(aliases[a]);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ════════════════════════════════════════════════════════════
// STAGE PARSED CROSSINGS
// ════════════════════════════════════════════════════════════
/**
 * Stages pre-validated crossing rows (from parseCrossingsCSV) into
 * 6-Committed_Reviews with Pending QB Sync Status.
 * @param {Array<{fdh:string, xing:string, details:string}>} validRows
 * @returns {{staged:number}}
 */
function stageParsedCrossings(validRows) {
  if (!validRows || !validRows.length) return { staged: 0 };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REVIEW_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REVIEW_LOG_SHEET);
    sheet.appendRow(["FDH Engineering ID","Special Crossings?","Special Crossing Details","Verified Date","Committed Date","Committed By","QB Sync Status","QB Sync Date"]);
    sheet.getRange("1:1").setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var ts    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
  var email = Session.getActiveUser().getEmail();
  var date  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy");

  var newRows = validRows.map(function(r) {
    return [r.fdh, r.xing || '', r.details || '', date, ts, email, 'Pending', ''];
  });

  if (newRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 8).setValues(newRows);
  }

  logMsg('stageParsedCrossings: staged ' + newRows.length + ' rows from CSV import');
  return { staged: newRows.length };
}

// ════════════════════════════════════════════════════════════
// CROSSINGS CSV EXPORT
// ════════════════════════════════════════════════════════════
/**
 * Exports all crossings data (6-Committed_Reviews + QB reference) to Drive CSV.
 * @returns {string} URL of the created file
 */
function exportCrossingsCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const refDict = getReferenceDictionary();

  // Build rows: all FDHs in reference + their committed review status
  var commitSheet = ss.getSheetByName(REVIEW_LOG_SHEET);
  var committedMap = {};
  if (commitSheet && commitSheet.getLastRow() > 1) {
    var cData    = commitSheet.getDataRange().getValues();
    var cHeaders = cData[0].map(function(h){ return String(h).trim(); });
    var cFdhIdx  = cHeaders.indexOf('FDH Engineering ID');
    var cXingIdx = cHeaders.indexOf('Special Crossings?');
    var cDetIdx  = cHeaders.indexOf('Special Crossing Details');
    var cDateIdx = cHeaders.indexOf('Verified Date');
    var cSyncIdx = cHeaders.indexOf('QB Sync Status');
    for (var i = 1; i < cData.length; i++) {
      var r = cData[i];
      var fdh = cFdhIdx > -1 ? String(r[cFdhIdx] || '').trim().toUpperCase() : '';
      if (!fdh) continue;
      committedMap[fdh] = {
        xing:    cXingIdx > -1 ? String(r[cXingIdx] || '') : '',
        details: cDetIdx  > -1 ? String(r[cDetIdx]  || '') : '',
        date:    cDateIdx > -1 ? String(r[cDateIdx]  || '') : '',
        sync:    cSyncIdx > -1 ? String(r[cSyncIdx]  || '') : ''
      };
    }
  }

  var cols = ['FDH Engineering ID','Vendor','QB Crossing Status','Committed Xing','Details','Verified Date','QB Sync Status'];
  var csvRows = [cols.map(_baCsvEsc).join(',')];

  Object.keys(refDict).sort().forEach(function(fdhKey) {
    var ref = refDict[fdhKey];
    var qbX = (ref.qbRef && ref.qbRef.xingExist) ? ref.qbRef.xingExist : '';
    var c   = committedMap[fdhKey] || {};
    csvRows.push([
      ref.fdh  || fdhKey,
      ref.vendor || '',
      qbX,
      c.xing    || '',
      c.details  || '',
      c.date     || '',
      c.sync     || ''
    ].map(_baCsvEsc).join(','));
  });

  var csv      = csvRows.join('\r\n');
  var filename = 'Crossings_Export_' + _baNow() + '.csv';
  var folder   = _baReportFolder(CROSSINGS_REPORTS_FOLDER_ID);
  var file     = folder.createFile(filename, csv, MimeType.CSV);
  logMsg('exportCrossingsCSV: created ' + filename);
  return file.getUrl();
}

// ════════════════════════════════════════════════════════════
// BOM COMPARISON CSV EXPORT
// ════════════════════════════════════════════════════════════
/**
 * Exports BOM comparison data to Drive. Accepts client-computed BOM data
 * so we avoid a redundant backend call.
 * @param {Array<Object>} bomData — from getBOMComparisonData()
 * @returns {string} URL of the created file
 */
function exportBOMComparisonCSV(bomData) {
  if (!bomData || !bomData.length) bomData = getBOMComparisonData();
  var cols = ['FDH','Vendor','QB UG (ft)','Vendor UG (ft)','UG Diff?','QB AE (ft)','Vendor AE (ft)','AE Diff?','QB Fiber (ft)','Vendor Fiber (ft)','Fiber Diff?','QB NAPs','Vendor NAPs','NAPs Diff?'];
  var csvRows = [cols.map(_baCsvEsc).join(',')];
  bomData.forEach(function(r) {
    csvRows.push([
      r.fdh, r.vendor,
      r.qbUG, r.vendorUG, (r.qbUG > 0 && r.vendorUG > 0 && r.qbUG !== r.vendorUG) ? 'YES' : '',
      r.qbAE, r.vendorAE, (r.qbAE > 0 && r.vendorAE > 0 && r.qbAE !== r.vendorAE) ? 'YES' : '',
      r.qbFib, r.vendorFib, (r.qbFib > 0 && r.vendorFib > 0 && r.qbFib !== r.vendorFib) ? 'YES' : '',
      r.qbNAP, r.vendorNAP, (r.qbNAP > 0 && r.vendorNAP > 0 && r.qbNAP !== r.vendorNAP) ? 'YES' : ''
    ].map(_baCsvEsc).join(','));
  });
  var csv      = csvRows.join('\r\n');
  var filename = 'BOM_Comparison_' + _baNow() + '.csv';
  var folder   = _baReportFolder(BOM_REPORTS_FOLDER_ID);
  var file     = folder.createFile(filename, csv, MimeType.CSV);
  logMsg('exportBOMComparisonCSV: created ' + filename);
  return file.getUrl();
}

// ════════════════════════════════════════════════════════════
// LATEST COMMENTS CSV EXPORT
// ════════════════════════════════════════════════════════════
/**
 * Exports latest Manager Note per active FDH to Drive.
 * Reads from the Change Log sheet, takes the most recent Manager Note entry per FDH.
 * @returns {string} URL of the created file
 */
function exportLatestCommentsCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(CHANGE_LOG_SHEET);
  var latestMap = {};

  if (logSheet && logSheet.getLastRow() > 1) {
    var logData    = logSheet.getDataRange().getValues();
    var logHeaders = logData[0].map(function(h){ return String(h).trim(); });
    var lFdhIdx    = logHeaders.indexOf('FDH Engineering ID');
    var lTypeIdx   = logHeaders.indexOf('Type of Change');
    var lValIdx    = logHeaders.indexOf('New Value');
    var lUserIdx   = logHeaders.indexOf('Updated By');
    var lTimeIdx   = logHeaders.indexOf('Date & Time Updated');
    // Rows are most-recent-first (from syncChangeLogs sort)
    for (var i = 1; i < logData.length; i++) {
      var row  = logData[i];
      var fdh  = lFdhIdx  > -1 ? String(row[lFdhIdx]  || '').trim().toUpperCase() : '';
      var type = lTypeIdx > -1 ? String(row[lTypeIdx] || '').trim() : '';
      if (!fdh || !type.toLowerCase().includes('note') && !type.toLowerCase().includes('comment') && !type.toLowerCase().includes('manager')) continue;
      if (latestMap[fdh]) continue; // already have most recent
      latestMap[fdh] = {
        val:  lValIdx  > -1 ? String(row[lValIdx]  || '') : '',
        user: lUserIdx > -1 ? String(row[lUserIdx] || '') : '',
        time: lTimeIdx > -1 ? String(row[lTimeIdx] || '') : ''
      };
    }
  }

  // Also include FDHs with no comment history — they appear with empty comment
  const refDict = getReferenceDictionary();
  var cols = ['FDH','Vendor','Latest Comment','Updated By','Date'];
  var csvRows = [cols.map(_baCsvEsc).join(',')];
  Object.keys(refDict).sort().forEach(function(fdhKey) {
    var ref = refDict[fdhKey];
    var c   = latestMap[fdhKey] || { val: '', user: '', time: '' };
    csvRows.push([ref.fdh || fdhKey, ref.vendor || '', c.val, c.user, c.time].map(_baCsvEsc).join(','));
  });

  var csv      = csvRows.join('\r\n');
  var filename = 'Comments_Latest_' + _baNow() + '.csv';
  var folder   = _baReportFolder(COMMENTS_REPORTS_FOLDER_ID);
  var file     = folder.createFile(filename, csv, MimeType.CSV);
  logMsg('exportLatestCommentsCSV: created ' + filename);
  return file.getUrl();
}

// ════════════════════════════════════════════════════════════
// COMMENT HISTORY — ON-DEMAND AUDIT
// ════════════════════════════════════════════════════════════
/**
 * Returns comment/note history for selected FDHs from the Change Log sheet.
 * @param {string[]} fdhs
 * @param {string|null} startDate — ISO date string or null
 * @param {string|null} endDate   — ISO date string or null
 * @returns {Array<{fdh, val, user, time}>}
 */
function getCommentHistoryForFdhs(fdhs, startDate, endDate) {
  if (!fdhs || !fdhs.length) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(CHANGE_LOG_SHEET);
  if (!logSheet || logSheet.getLastRow() < 2) return [];

  var fdhSet = {};
  fdhs.forEach(function(f){ fdhSet[f.toString().toUpperCase()] = true; });
  var start = startDate ? new Date(startDate) : null;
  var end   = endDate   ? new Date(endDate)   : null;

  var logData    = logSheet.getDataRange().getValues();
  var logHeaders = logData[0].map(function(h){ return String(h).trim(); });
  var lFdhIdx    = logHeaders.indexOf('FDH Engineering ID');
  var lTypeIdx   = logHeaders.indexOf('Type of Change');
  var lValIdx    = logHeaders.indexOf('New Value');
  var lUserIdx   = logHeaders.indexOf('Updated By');
  var lTimeIdx   = logHeaders.indexOf('Date & Time Updated');

  var results = [];
  for (var i = 1; i < logData.length; i++) {
    var row  = logData[i];
    var fdh  = lFdhIdx  > -1 ? String(row[lFdhIdx]  || '').trim().toUpperCase() : '';
    var type = lTypeIdx > -1 ? String(row[lTypeIdx] || '').trim() : '';
    if (!fdh || !fdhSet[fdh]) continue;
    if (!type.toLowerCase().includes('note') && !type.toLowerCase().includes('comment') && !type.toLowerCase().includes('manager')) continue;
    var timeVal = lTimeIdx > -1 ? row[lTimeIdx] : null;
    if (start || end) {
      var d = timeVal ? new Date(timeVal) : null;
      if (d) {
        if (start && d < start) continue;
        if (end   && d > end)   continue;
      }
    }
    results.push({
      fdh:  fdh,
      type: type,
      val:  lValIdx  > -1 ? String(row[lValIdx]  || '') : '',
      user: lUserIdx > -1 ? String(row[lUserIdx] || '') : '',
      time: lTimeIdx > -1 ? String(row[lTimeIdx] || '') : ''
    });
  }
  return results;
}

// ════════════════════════════════════════════════════════════
// EXTEND CHANGE LOG FOR QUICK PEEK
// ════════════════════════════════════════════════════════════
/**
 * Fetches additional change log entries for one FDH from QB,
 * extending beyond the current 7-day sync window.
 * @param {string} fdh
 * @param {number} daysBack — how many days to extend (default 30)
 * @returns {Array<{fdh, type, val, user, time}>}
 */
function extendChangeLogForFdh(fdh, daysBack) {
  daysBack = daysBack || 30;
  var token = PropertiesService.getScriptProperties().getProperty('QB_USER_TOKEN');
  if (!token) throw new Error('QB_USER_TOKEN not set');

  const CL_TABLE = 'bvqruhtyc';
  const QB_PAGE_SIZE = 1000;

  // Determine cutoff: go back further than current 7-day window
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (7 + daysBack));
  var cutoffMs = cutoff.getTime();

  // Field discovery (reuse pattern from syncChangeLogs)
  var fieldUrl = QB_API_BASE + '/fields?tableId=' + CL_TABLE;
  var hdrs = _qbHeaders(token);
  var fieldResp = UrlFetchApp.fetch(fieldUrl, hdrs);
  var fields = JSON.parse(fieldResp.getContentText()) || [];

  function findFid(labels) {
    var lc = labels.map(function(l){ return l.toLowerCase(); });
    for (var f = 0; f < fields.length; f++) {
      if (lc.indexOf((fields[f].label || '').toLowerCase()) >= 0) return fields[f].id;
    }
    return null;
  }

  var fdhFid     = findFid(['FDH PROJECT ENGINEERING ID','FDH ENGINEERING ID','FDH ID','FDH']);
  var typeFid    = findFid(['Type of Change','Change Type','Field Changed']);
  var valFid     = findFid(['New Value','Value','New Value (text)']);
  var userFid    = findFid(['Updated By','User','Changed By']);
  var updatedFid = findFid(['Date & Time Updated','Updated At','Timestamp','Date Updated']);

  if (!fdhFid || !updatedFid) return [];

  var allRows = [];
  var skip = 0;
  var maxPages = 5;
  while (maxPages-- > 0) {
    var payload = {
      from:    CL_TABLE,
      select:  [fdhFid, typeFid, valFid, userFid, updatedFid].filter(Boolean),
      where:   "{" + updatedFid + ".GT." + cutoffMs + "}AND{" + fdhFid + ".EX.'" + fdh + "'}",
      sortBy:  [{ fieldId: updatedFid, order: 'DESC' }],
      options: { skip: skip, top: QB_PAGE_SIZE }
    };
    var opts = _qbHeaders(token);
    opts.method = 'post';
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(payload);
    var resp = UrlFetchApp.fetch(QB_API_BASE + '/records/query', opts);
    if (resp.getResponseCode() !== 200) break;
    var parsed = JSON.parse(resp.getContentText());
    var data   = parsed.data || [];
    data.forEach(function(rec) {
      allRows.push({
        fdh:  fdh,
        type: typeFid  ? String((rec[typeFid]    || {}).value || '') : '',
        val:  valFid   ? String((rec[valFid]      || {}).value || '') : '',
        user: userFid  ? String((rec[userFid]     || {}).value || '') : '',
        time: updatedFid ? String((rec[updatedFid] || {}).value || '') : ''
      });
    });
    if (data.length < QB_PAGE_SIZE) break;
    skip += QB_PAGE_SIZE;
  }
  return allRows;
}

// ── Chunk array helper ────────────────────────────────────
function _baChunk(arr, size) {
  var chunks = [];
  for (var i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
