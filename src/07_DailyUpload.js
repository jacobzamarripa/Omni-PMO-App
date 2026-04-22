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

const UPLOAD_SOURCE_HEADERS = [
  "Source File ID", "Source File Name", "Stage Batch ID", "Stage Imported At"
];

const DAILY_UPLOAD_STAGE_HEADERS = [
  "Batch ID", "Created At", "Source File ID", "Source File Name", "Source Modified Time",
  "Source Mime Type", "Source Sheet Name", "Record Key", "Source Row Number",
  "Initial Disposition", "Blocking Issues JSON", "Warnings JSON", "Record JSON"
];

const DAILY_UPLOAD_STAGE_DISPOSITIONS = {
  APPROVE: "approve",
  SKIP: "skip",
  NEEDS_FIX: "needs_fix"
};

const DAILY_UPLOAD_HEADER_ALIASES = {
  "Date": ["date", "report date", "daily report date"],
  "Contractor": ["contractor", "vendor", "contractor name"],
  "FDH Engineering ID": ["fdh engineering id", "fdh id", "fdh", "fdh project engineering id", "project engineering id"],
  "Locates Called In": ["locates called in", "locates", "locates called"],
  "Cabinets Set": ["cabinets set", "cabinet set"],
  "Light to Cabinets": ["light to cabinets", "light to cabinet", "light"],
  "Target Completion Date": ["target completion date", "target date", "completion date", "target ofs"],
  "Daily UG Footage": ["daily ug footage", "ug footage", "ug ft", "daily ug ft"],
  "Daily Strand Footage": ["daily strand footage", "strand footage", "strand ft", "daily strand ft"],
  "Daily Fiber Footage": ["daily fiber footage", "fiber footage", "fiber ft", "daily fiber ft"],
  "Daily NAPs/Encl. Completed": ["daily naps/encl. completed", "daily naps completed", "naps", "daily naps", "daily enclosures completed"],
  "Drills": ["drills"],
  "Missles": ["missles", "missiles"],
  "AE Crews": ["ae crews", "ae crew"],
  "Fiber Pulling Crews": ["fiber pulling crews", "fiber crews", "fiber pulling crew"],
  "Splicing Crews": ["splicing crews", "splice crews", "splicing crew"],
  "Construction Comments": ["construction comments", "comments", "vendor comments", "comment"]
};

const DAILY_UPLOAD_REQUIRED_FIELDS = ["Date", "Contractor", "FDH Engineering ID"];

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

function _getPipelineRecommendedDate() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _countDailyUploadQueueRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet) return 0;
  return Math.max(0, getTrueLastDataRow(sheet) - 1);
}

function _getLatestCompiledUploadFileMeta() {
  var folder = DriveApp.getFolderById(COMPILED_FOLDER_ID);
  var files = folder.getFilesByType(MimeType.CSV);
  var latest = null;
  while (files.hasNext()) {
    var file = files.next();
    if (!latest || file.getLastUpdated() > latest.getLastUpdated()) latest = file;
  }
  if (!latest) return null;
  return {
    fileId: latest.getId(),
    fileName: latest.getName(),
    fileUrl: latest.getUrl(),
    modifiedAt: Utilities.formatDate(latest.getLastUpdated(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  };
}

function getDailyPipelineStatus() {
  var props = PropertiesService.getScriptProperties();
  var latestArchiveDate = typeof _getLatestArchiveDate === 'function'
    ? _getLatestArchiveDate()
    : _getPipelineRecommendedDate();
  var latestExport = _getLatestCompiledUploadFileMeta();
  var stats = getDailyUploadStats();
  return {
    archiveStatus: props.getProperty('INGESTION_STATUS') || 'idle',
    latestArchiveDate: latestArchiveDate,
    recommendedDate: _getPipelineRecommendedDate(),
    queueRowCount: _countDailyUploadQueueRows(),
    pendingQueueCount: stats.pending || 0,
    latestExport: latestExport,
    lastCompletedAt: props.getProperty('INGESTION_LAST_COMPLETED_AT') || '',
    lastStartedAt: props.getProperty('INGESTION_LAST_STARTED_AT') || ''
  };
}

function runIncomingArchivePipeline() {
  var beforeRows = 0;
  var histSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET);
  if (histSheet) beforeRows = Math.max(0, getTrueLastDataRow(histSheet) - 1);

  processIncomingForQuickBase(true, false);

  var afterRows = beforeRows;
  histSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET);
  if (histSheet) afterRows = Math.max(0, getTrueLastDataRow(histSheet) - 1);
  var status = getDailyPipelineStatus();

  return {
    success: true,
    step: 'incoming',
    message: 'Incoming reports processed.',
    archiveRowsAdded: Math.max(0, afterRows - beforeRows),
    queueRowCount: status.queueRowCount,
    archiveStatus: status.archiveStatus,
    latestArchiveDate: status.latestArchiveDate
  };
}

function loadDailyUploadQueueForDate(dateStr) {
  if (!dateStr) dateStr = _getPipelineRecommendedDate();
  populateQuickBaseTabCore(dateStr);
  return {
    success: true,
    step: 'load_queue',
    targetDate: dateStr,
    rowCount: _countDailyUploadQueueRows(),
    message: 'QuickBase upload queue loaded for ' + dateStr + '.'
  };
}

function exportCurrentDailyUploadCsv() {
  var meta = exportQuickBaseCSVCore(true, 'MANUAL');
  if (!meta) throw new Error('The QuickBase upload tab is empty. Load a report date first.');
  return {
    success: true,
    step: 'export_csv',
    fileId: meta.fileId,
    fileName: meta.fileName,
    fileUrl: meta.fileUrl,
    folderId: meta.folderId,
    createdAt: meta.createdAt,
    rowCount: meta.rowCount,
    message: 'CSV exported to 01_Pending_Upload.'
  };
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

  const headerCount = QB_HEADERS.length + UPLOAD_TRACKING_HEADERS.length + UPLOAD_SOURCE_HEADERS.length;
  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headerCount)).getValues()[0];
  UPLOAD_TRACKING_HEADERS.forEach((h, i) => {
    const colPos = QB_HEADERS.length + i; // 0-indexed
    if ((existingHeaders[colPos] || '').toString().trim() !== h) {
      sheet.getRange(1, colPos + 1).setValue(h);
    }
  });
  UPLOAD_SOURCE_HEADERS.forEach((h, i) => {
    const colPos = QB_HEADERS.length + UPLOAD_TRACKING_HEADERS.length + i; // 0-indexed
    if ((existingHeaders[colPos] || '').toString().trim() !== h) {
      sheet.getRange(1, colPos + 1).setValue(h);
    }
  });
}

function _normalizeUploadHeaderKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function _formatUploadDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'MM/dd/yyyy');
  }
  var raw = String(value || '').trim();
  if (!raw) return '';
  var parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return '';
  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'MM/dd/yyyy');
}

function _parseUploadBoolean(value) {
  if (value === true || value === false) return value ? 'TRUE' : 'FALSE';
  var raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(true|yes|y|1|x)$/i.test(raw)) return 'TRUE';
  if (/^(false|no|n|0)$/i.test(raw)) return 'FALSE';
  return null;
}

function _parseUploadNumeric(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return value;
  var raw = String(value).replace(/,/g, '').trim();
  if (!raw) return '';
  var num = parseFloat(raw);
  return isNaN(num) ? null : num;
}

function _getUploadHeaderAliasMap() {
  var map = {};
  Object.keys(DAILY_UPLOAD_HEADER_ALIASES).forEach(function(target) {
    DAILY_UPLOAD_HEADER_ALIASES[target].concat([target]).forEach(function(alias) {
      map[_normalizeUploadHeaderKey(alias)] = target;
    });
  });
  return map;
}

function _detectUploadSourceSheet(spreadsheet) {
  var aliasMap = _getUploadHeaderAliasMap();
  var best = null;
  spreadsheet.getSheets().forEach(function(sheet) {
    var maxRows = Math.min(sheet.getLastRow(), 10);
    var maxCols = Math.min(sheet.getLastColumn(), 30);
    if (maxRows < 1 || maxCols < 1) return;
    var values = sheet.getRange(1, 1, maxRows, maxCols).getDisplayValues();
    values.forEach(function(row, idx) {
      var matched = 0;
      row.forEach(function(cell) {
        if (aliasMap[_normalizeUploadHeaderKey(cell)]) matched++;
      });
      if (!best || matched > best.score) {
        best = { sheet: sheet, headerRow: idx + 1, score: matched };
      }
    });
  });
  if (!best || best.score < 3) throw new Error('No recognizable upload sheet was found in the selected Drive file.');
  return best;
}

function _buildUploadColumnMapping(headerRow) {
  var aliasMap = _getUploadHeaderAliasMap();
  var targetToCol = {};
  var unknownHeaders = [];
  headerRow.forEach(function(cell, idx) {
    var normalized = _normalizeUploadHeaderKey(cell);
    if (!normalized) return;
    var target = aliasMap[normalized];
    if (target && targetToCol[target] === undefined) targetToCol[target] = idx;
    else if (!target) unknownHeaders.push(String(cell).trim());
  });
  return { targetToCol: targetToCol, unknownHeaders: unknownHeaders };
}

function _getUploadStageSheet(createIfMissing) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DAILY_UPLOAD_STAGE_SHEET);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(DAILY_UPLOAD_STAGE_SHEET);
    sheet.hideSheet();
    sheet.getRange(1, 1, 1, DAILY_UPLOAD_STAGE_HEADERS.length).setValues([DAILY_UPLOAD_STAGE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _clearUploadStageBatch(batchId) {
  if (!batchId) return;
  var sheet = _getUploadStageSheet(false);
  if (!sheet || sheet.getLastRow() <= 1) return;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if ((values[i][0] || '').toString() === batchId) {
      sheet.deleteRow(i + 2);
    }
  }
}

function _resetUploadStageSheet() {
  var sheet = _getUploadStageSheet(true);
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
}

function _getQueueDuplicateLookup() {
  var lookup = {};
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QB_UPLOAD_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return lookup;
  var data = sheet.getDataRange().getValues();
  var dateIdx = QB_HEADERS.indexOf('Date');
  var fdhIdx = QB_HEADERS.indexOf('FDH Engineering ID');
  var statusIdx = QB_HEADERS.length;
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][statusIdx] || '').trim();
    if (status === UPLOAD_STATUS.SKIPPED) continue;
    var dateStr = _formatUploadDate(data[i][dateIdx]);
    var fdh = String(data[i][fdhIdx] || '').trim().toUpperCase();
    if (!dateStr || !fdh) continue;
    lookup[dateStr + '::' + fdh] = true;
  }
  return lookup;
}

function _buildStagedUploadRecord(rowValues, rowNumber, mapping, sourceHeaders, duplicateLookup) {
  var record = {};
  var blockingIssues = [];
  var warnings = [];

  QB_HEADERS.forEach(function(header) {
    var sourceIdx = mapping.targetToCol[header];
    var raw = sourceIdx === undefined ? '' : rowValues[sourceIdx];
    if (DATE_COLUMNS.indexOf(header) >= 0) {
      if (raw === '' || raw === null || raw === undefined) {
        record[header] = '';
      } else {
        var dateStr = _formatUploadDate(raw);
        if (!dateStr) {
          record[header] = String(raw || '');
          blockingIssues.push(header + ' is not a valid date');
        } else {
          record[header] = dateStr;
        }
      }
      return;
    }
    if (CHECKBOX_COLUMNS.indexOf(header) >= 0) {
      var boolVal = _parseUploadBoolean(raw);
      if (boolVal === null) {
        record[header] = String(raw || '');
        blockingIssues.push(header + ' must be yes/no or true/false');
      } else {
        record[header] = boolVal;
      }
      return;
    }
    if (NUMERIC_COLUMNS.indexOf(header) >= 0) {
      var num = _parseUploadNumeric(raw);
      if (num === null) {
        record[header] = String(raw || '');
        blockingIssues.push(header + ' is not numeric');
      } else {
        record[header] = num;
      }
      return;
    }
    record[header] = raw === null || raw === undefined ? '' : String(raw).trim();
  });

  DAILY_UPLOAD_REQUIRED_FIELDS.forEach(function(field) {
    if (!String(record[field] || '').trim()) blockingIssues.push('Missing ' + field);
  });

  var key = '';
  if (record['Date'] && record['FDH Engineering ID']) {
    key = record['Date'] + '::' + String(record['FDH Engineering ID']).trim().toUpperCase();
    if (duplicateLookup[key]) warnings.push('Already present in the upload queue');
    var qbDupe = checkDuplicateDailyRecord(record['Date'], record['FDH Engineering ID'], record['Contractor']);
    if (qbDupe && qbDupe.isDuplicate) warnings.push('Existing QuickBase record ID ' + (qbDupe.existingRecordId || 'found'));
  }

  return {
    recordKey: 'r' + rowNumber,
    sourceRowNumber: rowNumber,
    disposition: blockingIssues.length > 0 ? DAILY_UPLOAD_STAGE_DISPOSITIONS.NEEDS_FIX : DAILY_UPLOAD_STAGE_DISPOSITIONS.APPROVE,
    blockingIssues: blockingIssues,
    warnings: warnings,
    values: record,
    sourceHeaders: sourceHeaders
  };
}

function _serializeUploadStageRows(batchId, source, records) {
  return records.map(function(record) {
    return [
      batchId,
      source.createdAt,
      source.fileId,
      source.fileName,
      source.modifiedTime,
      source.mimeType,
      source.sheetName,
      record.recordKey,
      record.sourceRowNumber,
      record.disposition,
      JSON.stringify(record.blockingIssues || []),
      JSON.stringify(record.warnings || []),
      JSON.stringify(record.values || {})
    ];
  });
}

function _readUploadStageBatch(batchId) {
  var sheet = _getUploadStageSheet(false);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var values = sheet.getDataRange().getValues();
  var rows = values.slice(1).filter(function(row) { return String(row[0] || '') === String(batchId || ''); });
  if (!rows.length) return null;

  var source = {
    fileId: rows[0][2] || '',
    fileName: rows[0][3] || '',
    modifiedTime: rows[0][4] || '',
    mimeType: rows[0][5] || '',
    sheetName: rows[0][6] || '',
    createdAt: rows[0][1] || ''
  };

  var records = rows.map(function(row) {
    var blockingIssues = [];
    var warnings = [];
    var valuesObj = {};
    try { blockingIssues = JSON.parse(row[10] || '[]'); } catch (err) {}
    try { warnings = JSON.parse(row[11] || '[]'); } catch (err) {}
    try { valuesObj = JSON.parse(row[12] || '{}'); } catch (err) {}
    return {
      recordKey: row[7],
      sourceRowNumber: row[8],
      disposition: row[9] || DAILY_UPLOAD_STAGE_DISPOSITIONS.APPROVE,
      blockingIssues: blockingIssues,
      warnings: warnings,
      values: valuesObj
    };
  });

  return _buildUploadStagePayload(batchId, source, records);
}

function _buildUploadStagePayload(batchId, source, records) {
  var summary = {
    totalRows: records.length,
    validRows: 0,
    flaggedRows: 0,
    duplicateCandidates: 0,
    missingRequired: 0,
    unknownHeaders: 0
  };

  records.forEach(function(record) {
    if ((record.blockingIssues || []).length > 0 || (record.warnings || []).length > 0) summary.flaggedRows++;
    else summary.validRows++;
    if ((record.warnings || []).some(function(msg) { return /duplicate|quickbase/i.test(msg); })) summary.duplicateCandidates++;
    if ((record.blockingIssues || []).some(function(msg) { return /^Missing /i.test(msg); })) summary.missingRequired++;
  });

  return {
    batchId: batchId,
    source: source,
    summary: summary,
    records: records,
    canApprove: records.some(function(record) {
      return record.disposition === DAILY_UPLOAD_STAGE_DISPOSITIONS.APPROVE && (!record.blockingIssues || record.blockingIssues.length === 0);
    })
  };
}

function listAvailableUploadDriveFiles() {
  var folder = DriveApp.getFolderById(DAILY_UPLOAD_SOURCE_FOLDER_ID);
  var iter = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  var files = [];
  while (iter.hasNext()) {
    var file = iter.next();
    files.push({
      fileId: file.getId(),
      fileName: file.getName(),
      modifiedTime: Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      mimeType: MimeType.GOOGLE_SHEETS,
      size: file.getSize ? file.getSize() : '',
      inferredVendor: '',
      inferredDate: _formatUploadDate(file.getLastUpdated())
    });
  }
  files.sort(function(a, b) { return String(b.modifiedTime).localeCompare(String(a.modifiedTime)); });
  return files.slice(0, 25);
}

function stageUploadFileFromDrive(fileId) {
  if (!fileId) throw new Error('No Drive file selected.');
  var file = DriveApp.getFileById(fileId);
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) throw new Error('Only Google Sheets sources are supported in v1.');

  var spreadsheet = SpreadsheetApp.openById(fileId);
  var detected = _detectUploadSourceSheet(spreadsheet);
  var sourceSheet = detected.sheet;
  var lastRow = sourceSheet.getLastRow();
  var lastCol = sourceSheet.getLastColumn();
  if (lastRow <= detected.headerRow) throw new Error('The selected file does not contain any data rows below its header.');

  var values = sourceSheet.getRange(detected.headerRow, 1, lastRow - detected.headerRow + 1, lastCol).getValues();
  var displayValues = sourceSheet.getRange(detected.headerRow, 1, lastRow - detected.headerRow + 1, lastCol).getDisplayValues();
  var headers = displayValues[0];
  var mapping = _buildUploadColumnMapping(headers);
  var duplicateLookup = _getQueueDuplicateLookup();
  var records = [];

  for (var i = 1; i < values.length; i++) {
    var rowValues = values[i];
    var displayRow = displayValues[i];
    var hasContent = rowValues.some(function(cell) { return cell !== '' && cell !== null && cell !== undefined; });
    if (!hasContent) continue;
    records.push(_buildStagedUploadRecord(rowValues, detected.headerRow + i, mapping, headers, duplicateLookup));
  }

  if (!records.length) throw new Error('No eligible rows were found in the selected source sheet.');

  var batchId = _generateBatchId();
  var source = {
    fileId: file.getId(),
    fileName: file.getName(),
    modifiedTime: Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    mimeType: file.getMimeType(),
    sheetName: sourceSheet.getName(),
    createdAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  };

  _resetUploadStageSheet();
  var sheet = _getUploadStageSheet(true);
  var rows = _serializeUploadStageRows(batchId, source, records);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, DAILY_UPLOAD_STAGE_HEADERS.length).setValues(rows);

  var payload = _buildUploadStagePayload(batchId, source, records);
  payload.summary.unknownHeaders = mapping.unknownHeaders.length;
  payload.unknownHeaders = mapping.unknownHeaders;
  return payload;
}

function getStagedUploadBatch(batchId) {
  return _readUploadStageBatch(batchId) || { batchId: '', source: null, summary: null, records: [], canApprove: false };
}

function getLatestStagedUploadBatch() {
  var sheet = _getUploadStageSheet(false);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  var values = sheet.getDataRange().getValues();
  var latestBatchId = '';
  var latestCreated = '';
  values.slice(1).forEach(function(row) {
    var created = String(row[1] || '');
    if (!latestCreated || created > latestCreated) {
      latestCreated = created;
      latestBatchId = row[0];
    }
  });
  return latestBatchId ? _readUploadStageBatch(latestBatchId) : null;
}

function approveStagedUploadBatch(batchId, options) {
  options = options || {};
  var staged = _readUploadStageBatch(batchId);
  if (!staged) throw new Error('Staged batch not found.');

  var dispositionMap = options.dispositions || {};
  var approvedRows = [];
  var skipped = 0;

  staged.records.forEach(function(record) {
    var disposition = dispositionMap[record.recordKey] || record.disposition;
    if (disposition === DAILY_UPLOAD_STAGE_DISPOSITIONS.SKIP) {
      skipped++;
      return;
    }
    if (record.blockingIssues && record.blockingIssues.length > 0) return;
    if (disposition !== DAILY_UPLOAD_STAGE_DISPOSITIONS.APPROVE) return;
    approvedRows.push(record);
  });

  if (!approvedRows.length) throw new Error('No staged rows are eligible for import.');

  _ensureUploadTrackingHeaders();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var queueSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (!queueSheet) throw new Error(QB_UPLOAD_SHEET + ' sheet not found.');

  var importedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var startRow = queueSheet.getLastRow() + 1;
  var values = approvedRows.map(function(record) {
    var row = QB_HEADERS.map(function(header) { return record.values[header] === undefined ? '' : record.values[header]; });
    return row.concat(['', '', '', '', '']).concat([
      staged.source.fileId || '',
      staged.source.fileName || '',
      batchId,
      importedAt
    ]);
  });

  queueSheet.getRange(startRow, 1, values.length, values[0].length).setValues(values);
  _clearUploadStageBatch(batchId);

  return {
    batchId: batchId,
    importedCount: values.length,
    skippedCount: skipped + (staged.records.length - approvedRows.length - skipped),
    rowIndices: values.map(function(_, idx) { return startRow + idx; }),
    sourceFileName: staged.source.fileName || ''
  };
}

function discardStagedUploadBatch(batchId) {
  _clearUploadStageBatch(batchId);
  return { ok: true, batchId: batchId };
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
 * Updated: Now also checks for 'Contractor' to allow multi-vendor reporting
 * on the same project/date.
 * @returns {Object} { isDuplicate, existingRecordId }.
 */
function checkDuplicateDailyRecord(dateStr, fdh, vendor) {
  if (!dateStr || !fdh) return { isDuplicate: false };

  const fidMap  = getDailyFidMap();
  const fdhFid  = _resolveFieldFid('FDH Engineering ID', fidMap); // → FID 22
  const dateFid = _resolveFieldFid('Date', fidMap);               // → FID 6
  const venFid  = _resolveFieldFid('Contractor', fidMap);         // → FID 38

  if (!fdhFid) return { isDuplicate: false, error: 'FDH FID not found in QB_DAILY_LOG_FID_MAP' };

  const token = _getDailyUploadToken();
  const url = QB_API_BASE + '/records/query';
  const opts = _qbHeaders(token);
  opts.method      = 'post';
  opts.contentType = 'application/json';
  
  // Base query on FDH only to get all potential records for the project
  opts.payload     = JSON.stringify({
    from: QB_DAILY_LOG_TABLE_ID,
    select: [3, dateFid, fdhFid, venFid].filter(Boolean),
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
    
    const targetVendor = String(vendor || '').trim().toLowerCase();

    // MATCH LOGIC: Date must match AND (if vendor provided) Vendor must match.
    // If no vendor provided, we fallback to project-level date match.
    const match = records.find(function(r) {
      const qbDate = r[dateFid] ? r[dateFid].value : '';
      const dateMatch = qbDate && qbDate.toString().replace(/-/g, '/').includes(compareDate.replace(/-/g, '/'));
      
      if (!dateMatch) return false;
      if (!targetVendor) return true; // Date match is enough if no vendor specified

      const qbVendor = String(r[venFid] ? r[venFid].value : '').trim().toLowerCase();
      return qbVendor === targetVendor;
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
      const dupeResult = checkDuplicateDailyRecord(dateVal, fdhVal, vendor);
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
