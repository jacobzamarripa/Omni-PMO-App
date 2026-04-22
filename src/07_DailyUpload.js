/**
 * FILE: 07_DailyUpload.js
 * PURPOSE: Daily Production Upload — QuickBase Daily Work Log (bvay4aqkz)
 * Handles FID discovery, upload queue management, duplicate detection,
 * record insertion, audit logging, and missing vendor report detection.
 * Authentication: reuses QB_USER_TOKEN + _qbHeaders() from 06_QBSync.js
 */

// --- CONSTANTS ---
// QB_DAILY_LOG_TABLE_ID, UPLOAD_LOG_SHEET, ENABLE_AUTO_DAILY_UPLOAD defined in 00_Config.js

const UPLOAD_STATUS = {
  PENDING:   "Pending",
  UPLOADED:  "Uploaded",
  FAILED:    "Failed",
  SKIPPED:   "Skipped",
  DUPLICATE: "Duplicate"
};

// Tracking columns appended after QB_HEADERS (cols 18–22, 1-indexed)
const UPLOAD_COL_STATUS = 17; // 0-indexed position in row array
const UPLOAD_COL_DATE   = 18;
const UPLOAD_COL_RID    = 19;
const UPLOAD_COL_BATCH  = 20;
const UPLOAD_COL_ERROR  = 21;

const UPLOAD_TRACKING_HEADERS = [
  "Upload Status", "Upload Date", "QB Record ID", "Batch ID", "Error Detail"
];

const DAILY_UPLOAD_EDITABLE_FIELDS = {
  "Locates Called In": true,
  "Cabinets Set": true,
  "Light to Cabinets": true,
  "Target Completion Date": true,
  "Daily UG Footage": true,
  "Daily Strand Footage": true,
  "Daily Fiber Footage": true,
  "Daily NAPs/Encl. Completed": true,
  "Drills": true,
  "Missles": true,
  "AE Crews": true,
  "Fiber Pulling Crews": true,
  "Splicing Crews": true,
  "Construction Comments": true
};

// --- UTILITIES ---

function _generateBatchId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'batch-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function _getDailyUploadToken() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) throw new Error("QB_USER_TOKEN not configured in Script Properties.");
  return token;
}

/**
 * Ensures the 1-QuickBase_Upload sheet has the 5 tracking columns.
 * Safe to call multiple times — only writes headers when missing.
 */
function _ensureUploadTrackingHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet || sheet.getLastRow() === 0) return;

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), QB_HEADERS.length + UPLOAD_TRACKING_HEADERS.length)).getValues()[0];
  UPLOAD_TRACKING_HEADERS.forEach((h, i) => {
    const colPos = QB_HEADERS.length + i; // 0-indexed
    if ((existingHeaders[colPos] || '').toString().trim() !== h) {
      sheet.getRange(1, colPos + 1).setValue(h);
    }
  });
}

// --- FID DISCOVERY ---

/**
 * Fetches field metadata from QB for the Daily Work Log table.
 * Caches result in Script Properties and writes to 9-QB_Fields sheet.
 * @returns {Object} { fieldLabel: fid, ... }
 */
function discoverDailyWorkLogFields() {
  const token = _getDailyUploadToken();
  const url = QB_API_BASE + '/fields?tableId=' + QB_DAILY_LOG_TABLE_ID;
  const opts = _qbHeaders(token);

  const resp = UrlFetchApp.fetch(url, opts);
  if (resp.getResponseCode() !== 200) {
    throw new Error('Field discovery failed (' + resp.getResponseCode() + '): ' + resp.getContentText());
  }

  const fields = JSON.parse(resp.getContentText());
  const fidMap = {};
  fields.forEach(function(f) {
    if (f.label)     fidMap[f.label]     = f.id;
    if (f.fieldName && f.fieldName !== f.label) fidMap[f.fieldName] = f.id;
  });

  PropertiesService.getScriptProperties().setProperty('DAILY_LOG_FID_MAP', JSON.stringify(fidMap));

  // Write reference table to 9-QB_Fields sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var fieldsSheet = ss.getSheetByName(QB_FIELDS_SHEET) || ss.insertSheet(QB_FIELDS_SHEET);
  const sectionTag = '=== Daily Work Log (' + QB_DAILY_LOG_TABLE_ID + ') ===';
  const rows = [[sectionTag, '', ''], ['Field Label', 'Field ID', 'Field Type']];
  fields.forEach(function(f) {
    rows.push([f.label || f.fieldName || '?', f.id, f.fieldType || '']);
  });

  const existingData = fieldsSheet.getLastRow() > 0 ? fieldsSheet.getDataRange().getValues() : [];
  let sectionStart = -1;
  for (let r = 0; r < existingData.length; r++) {
    if ((existingData[r][0] || '').toString().includes(QB_DAILY_LOG_TABLE_ID)) { sectionStart = r; break; }
  }

  if (sectionStart >= 0) {
    fieldsSheet.getRange(sectionStart + 1, 1, rows.length, 3).setValues(rows);
  } else {
    const startRow = fieldsSheet.getLastRow() + 2;
    fieldsSheet.getRange(startRow, 1, rows.length, 3).setValues(rows);
  }

  logMsg('[DailyUpload] Discovered ' + fields.length + ' fields for ' + QB_DAILY_LOG_TABLE_ID);
  return fidMap;
}

/**
 * Returns the FID map for the Daily Work Log table.
 * Primary source: QB_DAILY_LOG_FID_MAP constant in 00_Config.js (hardcoded from known schema).
 * Falls back to Script Properties cache, then live discovery if the constant is somehow absent.
 */
function getDailyFidMap() {
  if (typeof QB_DAILY_LOG_FID_MAP !== 'undefined' && QB_DAILY_LOG_FID_MAP) {
    return QB_DAILY_LOG_FID_MAP;
  }
  const cached = PropertiesService.getScriptProperties().getProperty('DAILY_LOG_FID_MAP');
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  return discoverDailyWorkLogFields();
}

/**
 * Resolves a QB_HEADERS column name to its FID.
 * With the hardcoded map this is always an exact lookup — fuzzy matching is a fallback only.
 */
function _resolveFieldFid(columnName, fidMap) {
  if (fidMap[columnName] !== undefined) return fidMap[columnName];
  const lc = columnName.toLowerCase();
  for (var label in fidMap) {
    if (label.toLowerCase() === lc) return fidMap[label];
  }
  return null;
}

// --- QUEUE & STATS ---

/**
 * Reads 1-QuickBase_Upload and returns all non-Uploaded/non-Skipped rows.
 * Rows without a status value are treated as "Pending".
 * @returns {Array<Object>}
 */
function getDailyUploadQueue() {
  _ensureUploadTrackingHeaders();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  const queue = [];

  for (var i = 1; i < data.length; i++) {
    const row = data[i];
    const uploadStatus = (row[UPLOAD_COL_STATUS] || '').toString().trim();
    if (uploadStatus === UPLOAD_STATUS.UPLOADED || uploadStatus === UPLOAD_STATUS.SKIPPED) continue;

    const record = { rowIdx: i + 1 }; // 1-indexed
    QB_HEADERS.forEach(function(h, j) {
      var val = row[j];
      // Serialize dates for JSON transport
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      }
      record[h] = val !== undefined && val !== null ? val : '';
    });
    record.uploadStatus = uploadStatus || UPLOAD_STATUS.PENDING;
    record.uploadDate   = (row[UPLOAD_COL_DATE]  || '').toString();
    record.qbRecordId   = (row[UPLOAD_COL_RID]   || '').toString();
    record.batchId      = (row[UPLOAD_COL_BATCH] || '').toString();
    record.errorDetail  = (row[UPLOAD_COL_ERROR] || '').toString();

    queue.push(record);
  }

  return queue;
}

/**
 * Returns status counts for the KPI bar.
 */
function getDailyUploadStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) {
    return { pending: 0, uploadedToday: 0, uploadedTotal: 0, failed: 0, skipped: 0 };
  }

  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var pending = 0, uploadedToday = 0, uploadedTotal = 0, failed = 0, skipped = 0;

  for (var i = 1; i < data.length; i++) {
    const status    = (data[i][UPLOAD_COL_STATUS] || '').toString().trim();
    const uploadDate = (data[i][UPLOAD_COL_DATE]  || '').toString();
    if (!status || status === UPLOAD_STATUS.PENDING || status === UPLOAD_STATUS.DUPLICATE) pending++;
    else if (status === UPLOAD_STATUS.UPLOADED) {
      uploadedTotal++;
      if (uploadDate.startsWith(today)) uploadedToday++;
    }
    else if (status === UPLOAD_STATUS.FAILED)  failed++;
    else if (status === UPLOAD_STATUS.SKIPPED) skipped++;
  }

  return { pending, uploadedToday, uploadedTotal, failed, skipped };
}

// --- DUPLICATE DETECTION ---

/**
 * Queries QB to check if a record for this date + FDH already exists.
 * Returns { isDuplicate, existingRecordId }.
 */
function checkDuplicateDailyRecord(dateStr, fdh) {
  if (!dateStr || !fdh) return { isDuplicate: false };

  const fidMap = getDailyFidMap();
  const fdhFid  = _resolveFieldFid('FDH Engineering ID', fidMap); // → FID 22
  const dateFid = _resolveFieldFid('Date', fidMap);               // → FID 6

  if (!fdhFid) return { isDuplicate: false, error: 'FDH FID not found in QB_DAILY_LOG_FID_MAP' };

  const token = _getDailyUploadToken();
  const url = QB_API_BASE + '/records/query';
  const opts = _qbHeaders(token);
  opts.method      = 'post';
  opts.contentType = 'application/json';
  opts.payload     = JSON.stringify({
    from: QB_DAILY_LOG_TABLE_ID,
    select: [3, dateFid, fdhFid].filter(Boolean),
    where: '{' + fdhFid + '.EX.' + JSON.stringify(fdh.toString()) + '}'
  });

  try {
    const resp = UrlFetchApp.fetch(url, opts);
    if (resp.getResponseCode() !== 200) return { isDuplicate: false };
    const result = JSON.parse(resp.getContentText());
    const records = result.data || [];

    if (!dateFid || records.length === 0) return { isDuplicate: false };

    // Normalize the incoming dateStr for comparison
    let compareDate = dateStr.toString();
    if (dateStr instanceof Date) {
      compareDate = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    }

    const match = records.find(function(r) {
      const qbDate = r[dateFid] ? r[dateFid].value : '';
      return qbDate && qbDate.toString().replace(/-/g, '/').includes(compareDate.replace(/-/g, '/'));
    });

    return match
      ? { isDuplicate: true, existingRecordId: match[3] ? match[3].value : null }
      : { isDuplicate: false };
  } catch(e) {
    return { isDuplicate: false, error: e.message };
  }
}

// --- PAYLOAD BUILDER ---

/**
 * Maps a row object to the QB record format { "fid": { "value": val } }.
 * Coerces types per CHECKBOX_COLUMNS, NUMERIC_COLUMNS, DATE_COLUMNS from 00_Config.js.
 */
function buildQBRecordPayload(rowData, fidMap) {
  const record = {};

  QB_HEADERS.forEach(function(col) {
    const fid = _resolveFieldFid(col, fidMap);
    if (!fid) return;

    var val = rowData[col];

    if (val === null || val === undefined || val === '') {
      return; // Omit empty fields
    }

    if (CHECKBOX_COLUMNS.indexOf(col) >= 0) {
      val = (val === true || val === 'TRUE' || val === 1 || val === '1' || val === 'true');
    } else if (NUMERIC_COLUMNS.indexOf(col) >= 0) {
      var n = parseFloat(String(val).replace(/,/g, ''));
      if (isNaN(n)) return;
      val = n;
    } else if (DATE_COLUMNS.indexOf(col) >= 0) {
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'MM-DD-YYYY');
      } else {
        val = val.toString();
      }
    } else {
      val = val.toString();
    }

    record[fid.toString()] = { value: val };
  });

  return record;
}

// --- MAIN UPLOAD ---

/**
 * Main upload function called from the frontend via google.script.run.
 * @param {Array<number>} rowIndices - 1-indexed sheet row numbers to upload.
 * @param {Object} options - { dryRun, skipDuplicates, batchId, forceRows }
 * @returns {Object} { batchId, success, failed, skipped, duplicates, results }
 */
function uploadDailyRecordsToQB(rowIndices, options) {
  options          = options || {};
  const dryRun     = !!options.dryRun;
  const skipDupes  = options.skipDuplicates !== false;
  const batchId    = options.batchId || _generateBatchId();
  const forceRows  = options.forceRows || [];

  if (!rowIndices || rowIndices.length === 0) {
    return { batchId, success: 0, failed: 0, skipped: 0, duplicates: 0, results: [], error: 'No rows specified' };
  }

  _ensureUploadTrackingHeaders();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet) throw new Error(QB_UPLOAD_SHEET + ' sheet not found.');

  const fidMap  = getDailyFidMap();
  const token   = _getDailyUploadToken();
  const allData = sheet.getDataRange().getValues();

  const results = [];
  var success = 0, failed = 0, skipped = 0, dupes = 0;

  for (var i = 0; i < rowIndices.length; i++) {
    const rowIdx = rowIndices[i];
    const rowData = allData[rowIdx - 1];

    if (!rowData) {
      results.push({ rowIdx: rowIdx, status: 'failed', error: 'Row not found' });
      failed++;
      continue;
    }

    // Safety lock: block re-upload of already-Uploaded rows
    const currentStatus = (rowData[UPLOAD_COL_STATUS] || '').toString().trim();
    if (currentStatus === UPLOAD_STATUS.UPLOADED) {
      results.push({ rowIdx: rowIdx, status: 'skipped', reason: 'Already uploaded' });
      skipped++;
      continue;
    }

    const rowObj = {};
    QB_HEADERS.forEach(function(h, j) { rowObj[h] = rowData[j]; });

    const dateVal  = rowObj['Date'];
    const fdhVal   = rowObj['FDH Engineering ID'];
    const vendor   = rowObj['Contractor'];

    // Duplicate detection (skip in dry-run to avoid slow API calls per row)
    var isDupe = false, existingRid = null;
    if (!dryRun) {
      const dupeResult = checkDuplicateDailyRecord(dateVal, fdhVal);
      isDupe      = dupeResult.isDuplicate;
      existingRid = dupeResult.existingRecordId;
    }

    if (isDupe && forceRows.indexOf(rowIdx) < 0) {
      dupes++;
      const errMsg = 'Duplicate — QB Record ID: ' + existingRid;
      results.push({ rowIdx: rowIdx, status: 'duplicate', fdh: fdhVal, vendor: vendor, existingRecordId: existingRid });
      if (!dryRun && skipDupes) {
        _setUploadStatus(sheet, rowIdx, UPLOAD_STATUS.DUPLICATE, null, null, batchId, errMsg);
        continue;
      }
    }

    if (dryRun) {
      const record     = buildQBRecordPayload(rowObj, fidMap);
      const unmapped   = QB_HEADERS.filter(function(h) { return !_resolveFieldFid(h, fidMap); });
      results.push({
        rowIdx: rowIdx, status: 'dry-run',
        fdh: fdhVal, vendor: vendor,
        mappedFields: Object.keys(record).length,
        unmappedFields: unmapped,
        isDuplicate: isDupe
      });
      continue;
    }

    // POST to QB
    try {
      const record  = buildQBRecordPayload(rowObj, fidMap);
      const url     = QB_API_BASE + '/records';
      const opts    = _qbHeaders(token);
      opts.method      = 'post';
      opts.contentType = 'application/json';
      opts.payload     = JSON.stringify({ to: QB_DAILY_LOG_TABLE_ID, data: [record] });

      const resp = UrlFetchApp.fetch(url, opts);
      const code = resp.getResponseCode();

      if (code === 200 || code === 207) {
        const body      = JSON.parse(resp.getContentText());
        const newRid    = (body.data && body.data[0] && body.data[0]['3']) ? body.data[0]['3'].value : '';
        _setUploadStatus(sheet, rowIdx, UPLOAD_STATUS.UPLOADED, new Date(), newRid, batchId, '');
        results.push({ rowIdx: rowIdx, status: 'success', fdh: fdhVal, vendor: vendor, qbRecordId: newRid });
        success++;
      } else {
        const errText = resp.getContentText().substring(0, 300);
        _setUploadStatus(sheet, rowIdx, UPLOAD_STATUS.FAILED, new Date(), '', batchId, 'HTTP ' + code + ': ' + errText);
        results.push({ rowIdx: rowIdx, status: 'failed', fdh: fdhVal, vendor: vendor, error: 'HTTP ' + code, detail: errText });
        failed++;
      }
    } catch(e) {
      _setUploadStatus(sheet, rowIdx, UPLOAD_STATUS.FAILED, new Date(), '', batchId, e.message);
      results.push({ rowIdx: rowIdx, status: 'failed', fdh: fdhVal, vendor: vendor, error: e.message });
      failed++;
    }

    // Throttle per QB API rate limits
    if (i < rowIndices.length - 1) Utilities.sleep(120);
  }

  // Audit log
  if (!dryRun) {
    _writeUploadLogEntry({
      batchId: batchId, timestamp: new Date(), dryRun: false,
      rowCount: rowIndices.length, success: success,
      failed: failed, skipped: skipped, duplicates: dupes,
      userEmail: Session.getActiveUser().getEmail() || 'unknown'
    });
  }

  return { batchId: batchId, success: success, failed: failed, skipped: skipped, duplicates: dupes, results: results };
}

/**
 * Writes upload tracking columns to a specific sheet row.
 */
function _setUploadStatus(sheet, rowIdx, status, uploadDate, qbRecordId, batchId, errorDetail) {
  sheet.getRange(rowIdx, QB_HEADERS.length + 1, 1, 5).setValues([[
    status,
    uploadDate ? Utilities.formatDate(uploadDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : '',
    qbRecordId  || '',
    batchId     || '',
    errorDetail || ''
  ]]);
}

/**
 * Appends a row to 11-Upload_Log, creating the sheet with headers if needed.
 */
function _writeUploadLogEntry(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(UPLOAD_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(UPLOAD_LOG_SHEET);
    logSheet.appendRow(['Batch ID', 'Timestamp', 'Dry Run?', 'Row Count', 'Success', 'Failed', 'Skipped', 'Duplicates', 'User Email']);
    logSheet.setFrozenRows(1);
    logSheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
  logSheet.appendRow([
    entry.batchId,
    Utilities.formatDate(entry.timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    entry.dryRun ? 'YES' : 'NO',
    entry.rowCount, entry.success, entry.failed, entry.skipped, entry.duplicates,
    entry.userEmail
  ]);
}

/**
 * Saves a single cell edit from inline editing back to 1-QuickBase_Upload.
 * Blocks edits to Uploaded rows. Resets Failed rows to Pending on save.
 * @returns {Object} { ok, error }
 */
function saveDailyUploadRowEdit(rowIdx, fieldName, newValue) {
  return saveDailyUploadRowEditsBatch([{ rowIdx: rowIdx, field: fieldName, value: newValue }]);
}

/**
 * Saves multiple cell edits back to 1-QuickBase_Upload in a single batch.
 * @param {Array<Object>} tasks - [{ rowIdx, field, value }, ...]
 * @returns {Object} { ok, count, errors }
 */
function saveDailyUploadRowEditsBatch(tasks) {
  if (!tasks || !tasks.length) return { ok: true, count: 0 };

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);
    if (!sheet) return { ok: false, error: 'Sheet not found' };

    const dataRange = sheet.getDataRange();
    const lastCol = sheet.getLastColumn();
    const statusColIdx = QB_HEADERS.length + 1; // 1-indexed column for status

    const errors = [];
    let successCount = 0;

    tasks.forEach(function(task) {
      const rowIdx = task.rowIdx;
      const fieldName = task.field;
      const newValue = task.value;

      if (!DAILY_UPLOAD_EDITABLE_FIELDS[fieldName]) {
        errors.push({ rowIdx: rowIdx, field: fieldName, error: 'Field is locked' });
        return;
      }

      const colIdx = QB_HEADERS.indexOf(fieldName);
      if (colIdx < 0) {
        errors.push({ rowIdx: rowIdx, field: fieldName, error: 'Unknown field' });
        return;
      }

      // Check row status
      const statusCell = sheet.getRange(rowIdx, statusColIdx).getValue().toString();
      if (statusCell === UPLOAD_STATUS.UPLOADED || statusCell === UPLOAD_STATUS.SKIPPED) {
        errors.push({ rowIdx: rowIdx, field: fieldName, error: 'Row is finalized' });
        return;
      }

      const nextValue = _sanitizeDailyUploadEditValue(fieldName, newValue);
      sheet.getRange(rowIdx, colIdx + 1).setValue(nextValue);

      // Reset Failed → Pending
      if (statusCell === UPLOAD_STATUS.FAILED) {
        sheet.getRange(rowIdx, statusColIdx).setValue(UPLOAD_STATUS.PENDING);
        sheet.getRange(rowIdx, statusColIdx + 4).setValue(''); // Clear error detail
      }
      successCount++;
    });

    return {
      ok: errors.length === 0,
      count: successCount,
      errors: errors
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function _sanitizeDailyUploadEditValue(fieldName, newValue) {
  var value = newValue === null || newValue === undefined ? '' : newValue.toString().trim();
  if (fieldName === 'Locates Called In' || fieldName === 'Cabinets Set' || fieldName === 'Light to Cabinets') {
    return /^(true|1|yes)$/i.test(value) ? 'TRUE' : 'FALSE';
  }
  return value;
}

// --- HISTORY ---

/**
 * Returns recent batch entries from 11-Upload_Log (most recent first).
 * @param {number} limit
 */
function getDailyUploadHistory(limit) {
  limit = limit || 50;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(UPLOAD_LOG_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).reverse().slice(0, limit).map(function(r) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = r[i] instanceof Date ? r[i].toString() : (r[i] || ''); });
    return obj;
  });
}

// --- MISSING REPORT DETECTION ---

/**
 * Returns which vendors in DEFAULT_VENDOR_DAILY_GOALS have NOT submitted
 * a report for the given date.
 * @param {string} dateStr - "MM/dd/yyyy" format
 * @returns {Array<Object>} [{ vendor, activeFdhCount, activeFdhs, lastReportDate }]
 */
function getMissingReportVendors(dateStr) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);

  const dateColIdx   = QB_HEADERS.indexOf('Date');
  const vendorColIdx = QB_HEADERS.indexOf('Contractor');

  // Track what was actually submitted and the most recent report date per vendor (keyed lowercase)
  const reportedVendors = {};  // vendorKey → Set of date strings
  const lastReportDate  = {};  // vendorKey → most recent date string

  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var rowDate = data[i][dateColIdx];
      var rowDateStr = rowDate instanceof Date
        ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'MM/dd/yyyy')
        : rowDate.toString();
      var vendor    = (data[i][vendorColIdx] || '').toString().trim();
      var vendorKey = vendor.toLowerCase();
      if (!vendorKey) continue;

      if (!reportedVendors[vendorKey]) reportedVendors[vendorKey] = new Set();
      reportedVendors[vendorKey].add(rowDateStr);

      if (!lastReportDate[vendorKey] || rowDateStr > lastReportDate[vendorKey]) {
        lastReportDate[vendorKey] = rowDateStr;
      }
    }
  }

  // Build the report-expected portfolio from reference dictionary — mirrors the
  // shared Active Portfolio rule, but excludes grace-window and upcoming-only items.
  const refDict = typeof getReferenceDictionary === 'function' ? getReferenceDictionary() : {};

  const activeByVendor = {};  // vendorKey → { displayName, fdhs[] }
  Object.keys(refDict).forEach(function(fdhId) {
    var p      = refDict[fdhId];
    var vendor = (p.vendor || '').toString().trim();
    if (!vendor) return;
    var portfolioMeta = (typeof _getPortfolioVisibilityMeta === 'function')
      ? _getPortfolioVisibilityMeta({
          stage: p.stage || '',
          status: p.status || '',
          vendor: vendor,
          primaryOfsDate: p.canonicalOfsDate || p.forecastedOFS || '',
          fallbackOfsDate: p.canonicalOfsDate || p.forecastedOFS || '',
          cxStart: p.cxStart || '',
          targetDate: p.canonicalOfsDate || p.forecastedOFS || '',
          referenceDate: dateStr,
          hasHistory: false
        })
      : { expectDailyReport: true };
    if (!portfolioMeta.expectDailyReport) return;

    var vk = vendor.toLowerCase();
    if (!activeByVendor[vk]) activeByVendor[vk] = { displayName: vendor, fdhs: [] };
    activeByVendor[vk].fdhs.push({ fdh: fdhId, city: (p.city || '').toString() });
  });

  // Return vendors with active projects who haven't submitted for dateStr
  return Object.keys(activeByVendor)
    .filter(function(vk) {
      return !reportedVendors[vk] || !reportedVendors[vk].has(dateStr);
    })
    .map(function(vk) {
      var entry = activeByVendor[vk];
      return {
        vendor:         entry.displayName,
        activeFdhCount: entry.fdhs.length,
        activeFdhs:     entry.fdhs.slice(0, 20),
        lastReportDate: lastReportDate[vk] || 'Never'
      };
    })
    .sort(function(a, b) { return a.vendor.localeCompare(b.vendor); });
}

/**
 * Builds a copy-paste email draft for a missing vendor report.
 * @returns {Object} { subject, body }
 */
function draftMissingReportEmail(vendor, dateStr, activeFdhs) {
  activeFdhs = activeFdhs || [];

  const fdhList = activeFdhs.length > 0
    ? activeFdhs.map(function(f) {
        return '  • ' + f.fdh + (f.city ? ' (' + f.city + ')' : '');
      }).join('\n')
    : '  (No active projects found in system — please confirm with vendor)';

  const subject = 'Daily Production Report — ' + vendor + ' — ' + dateStr;
  const body = [
    'Hi ' + vendor + ' team,',
    '',
    "We haven't received your daily production report for " + dateStr + '.',
    'You currently have ' + (activeFdhs.length || 'several') + ' active FDH project(s) in our tracking system:',
    '',
    fdhList,
    '',
    'Please submit your report at your earliest convenience. If you had no production activity today or have already submitted, please reply to confirm.',
    '',
    'Thank you,',
    'Jacob Zamarripa',
    'Omni Fiber — PMO'
  ].join('\n');

  return { subject: subject, body: body };
}

// --- AUTOMATION STUB (NOT ACTIVE) ---

/**
 * Automation entry point — called by time-trigger when ENABLE_AUTO_DAILY_UPLOAD = true.
 * Currently a no-op stub. Flip the constant and wire a trigger to activate.
 */
function uploadPendingRecordsAuto() {
  if (!ENABLE_AUTO_DAILY_UPLOAD) {
    logMsg('[DailyUpload] Auto-upload is disabled. Set ENABLE_AUTO_DAILY_UPLOAD = true to activate.');
    return;
  }

  const queue = getDailyUploadQueue();
  const pending = queue.filter(function(r) { return r.uploadStatus === UPLOAD_STATUS.PENDING; });
  if (pending.length === 0) { logMsg('[DailyUpload] Auto-upload: no pending rows.'); return; }

  const rowIndices = pending.map(function(r) { return r.rowIdx; });
  const result = uploadDailyRecordsToQB(rowIndices, {
    batchId: _generateBatchId(),
    skipDuplicates: true
  });

  const summary = '[DailyUpload] Auto-upload complete — Success: ' + result.success +
    ' | Failed: ' + result.failed + ' | Dupes: ' + result.duplicates;
  logMsg(summary);

  if (result.failed > 0) {
    MailApp.sendEmail({
      to: 'jacobzamarripa@gmail.com',
      subject: '[OMNISIGHT] Auto-Upload Failures — ' + result.failed + ' row(s)',
      body: summary + '\n\nFailed rows:\n' +
        result.results.filter(function(r) { return r.status === 'failed'; })
                      .map(function(r) { return 'Row ' + r.rowIdx + ': ' + r.error; })
                      .join('\n')
    });
  }
}

// --- EXPORT ---

/**
 * Exports a filtered subset of 1-QuickBase_Upload rows to Drive as CSV.
 * @param {Array<number>} rowIndices - 1-indexed row numbers to include.
 * @returns {string} Drive file URL.
 */
function exportDailyUploadViewToCSV(rowIndices) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet) throw new Error(QB_UPLOAD_SHEET + ' not found.');

  const allData = sheet.getDataRange().getValues();
  const allHeaders = allData[0];

  const rowSet = new Set(rowIndices.map(function(r) { return r - 1; })); // 0-indexed
  const exportRows = [allHeaders].concat(
    allData.slice(1).filter(function(_, i) { return rowIndices ? rowSet.has(i + 1) : true; })
  );

  function _csvEscape(val) {
    var s = (val instanceof Date)
      ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'MM/dd/yyyy')
      : String(val === null || val === undefined ? '' : val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const csvContent = exportRows.map(function(row) {
    return row.map(_csvEscape).join(',');
  }).join('\r\n');

  const dateStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const filename  = 'Daily_Upload_Export_' + dateStamp + '.csv';

  const folder = DriveApp.getFolderById(COMPILED_FOLDER_ID);
  const file   = folder.createFile(filename, csvContent, MimeType.CSV);

  logMsg('[DailyUpload] Exported ' + (exportRows.length - 1) + ' rows to ' + filename);
  return file.getUrl();
}
