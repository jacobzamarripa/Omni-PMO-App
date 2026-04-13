/**
 * FILE: 06_QBSync.js
 * PURPOSE: QuickBase API → Google Sheets live sync.
 *          Pulls all records from the FDH Projects report and writes
 *          them directly into 5-Reference_Data, replacing the manual
 *          CSV export workflow. Also registers the custom Sheets menu.
 */

// --- 1. QUICKBASE CONFIG ---

const QB_REALM        = "omnifiber.quickbase.com";
const QB_TABLE_ID     = "bts3c49e9";
const QB_API_BASE     = "https://api.quickbase.com/v1";
const QB_PAGE_SIZE    = 1000;
const QB_MAX_PAGES    = 20;
const CHANGE_LOG_TABLE_ID = "bvqruhtyc";

// --- PHASE 2 SCAFFOLD (not active — write-back not enabled) ---
// FIDs are unique PER TABLE only. Always pair with parent Table ID to avoid collision.
// Overlapping FIDs: 192 (Active Set), 193 (Active Has Power), 188 (Manager Note)
// exist in both write-permitted tables and must be addressed per namespace below.
const QB_WRITE_MAPPING = {
  "bts3c49e9": { // FDH Projects (Write-Permitted)
    "517": "Sent for Permitting",
    "459": "Permit Approved",
    "525": "Special Crossings Choice",
    "526": "Special Crossing Details",
    "192": "Active Set",
    "193": "Active Has Power",
    "518": "Transport Available",
    "522": "What Does it Feed",
    "524": "Island Missing Components",
    "188": "Manager Note",
    "513": "BOM Sent",
    "523": "How is it Fed",
    "742": "Phase ID",
    "744": "Stage ID",
    "746": "Status ID",
    "588": "CD Distributed",
    "589": "Splice Docs Distributed",
    "439": "Strand Maps Distributed",
    "436": "SOW Signed",
    "587": "PO Number"
  }
  // bvieaendx (Project Management) is currently 401 Restricted - omitted.
};

// --- DECK REFERENCE QUERY CONFIG ---
// fdhFid = FID of the "FDH Engineering ID" field in that secondary table.
// Verified: PM table (bvieaendx) uses FID 645 for Engineering ID.
const QB_DECK_QUERY_CONFIG = {
  "bvieaendx": {
    fdhFid: 645,
    fields: {
      q_permit_sent: 612, q_permit_appr: 653,
      q_cd_dist:     471, q_splice_dist: 473, q_strand_dist: 472,
      q_xing_exist:  620, q_cross_sub:   622, q_cross_appr:  623, q_cross_dist: 624,
      q_bom_sent:    513,
      q_sow_sign:    436, q_active_set:  192, q_active_pwr:  193, q_transport:  613,
      q_leg:         274,
      q_how_fed:     614,
      q_what_feeds:  615,
      q_island:      617,
      q_ofs_change:  618,
      q_ofs_reason:  619
    }
  }
  // bts3c49gt (Permits) and bts8av3cw (Cabinets) — add FID configs after field discovery
};

// Column names appended to 5-Reference_Data for Deck gap indicators
const QB_DECK_COLUMNS = [
  "QB_Permit_Sent", "QB_Permit_Appr", "QB_Cross_Sub", "QB_Cross_Appr", "QB_Cross_Dist",
  "QB_Active_Set",  "QB_Active_Pwr",  "QB_Leg",       "QB_Transport",
  "QB_How_Fed",     "QB_What_Feeds",  "QB_Island",    "QB_Ofs_Change", "QB_Ofs_Reason",
  "QB_CD_Dist",     "QB_Splice_Dist", "QB_Strand_Dist", "QB_BOM_Sent", "QB_SOW_Sign"
];


// --- 2. FIELD DISCOVERY (run once to build the Data Dictionary) ---

/**
 * Scans all QB tables and writes a searchable Data Dictionary to 9-QB_Fields.
 * Read-only — no PATCH or POST calls are made.
 */
function discoverAllQBFields() {
  const QB_TABLES = {
    "Active Cabinets":    "bts8av3cw",
    "FDH Projects":       "bts3c49e9",
    "Project Management": "bvieaendx",
    "Permits":            "bts3c49gt",
    "FDH Inspections":    "bvterz4k4"
  };

  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) throw new Error("QB_USER_TOKEN not found in Script Properties.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dictSheet = ss.getSheetByName(QB_FIELDS_SHEET) || ss.insertSheet(QB_FIELDS_SHEET);

  dictSheet.clear();
  dictSheet.appendRow(["Table Name", "Table ID", "Field ID (fid)", "Field Label", "Field Type"]);
  dictSheet.getRange("1:1").setFontWeight("bold").setBackground("#0f172a").setFontColor("white");

  let totalFields = 0;

  for (let tableName in QB_TABLES) {
    let tableId = QB_TABLES[tableName];
    let url = QB_API_BASE + "/fields?tableId=" + tableId;
    let response = UrlFetchApp.fetch(url, _qbHeaders(token));

    if (response.getResponseCode() === 200) {
      let fields = JSON.parse(response.getContentText());
      let rows = fields.map(function(f) { return [tableName, tableId, f.id, f.label, f.fieldType]; });
      if (rows.length > 0) {
        dictSheet.getRange(dictSheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
        totalFields += rows.length;
      }
    } else {
      Logger.log("WARN: HTTP " + response.getResponseCode() + " for table " + tableName + " (" + tableId + ")");
    }
  }

  dictSheet.setFrozenRows(1);
  dictSheet.autoResizeColumns(1, 5);
  if (dictSheet.getFilter() !== null) dictSheet.getFilter().remove();
  dictSheet.getDataRange().createFilter();

  Logger.log("Discovery Complete: Found " + totalFields + " fields across " + Object.keys(QB_TABLES).length + " tables.");
  SpreadsheetApp.getUi().alert("Discovery Complete!\n\nFound " + totalFields + " fields across " + Object.keys(QB_TABLES).length + " tables.\nSee the \"" + QB_FIELDS_SHEET + "\" tab for the full Data Dictionary.");
}


// --- 3. WEB APP SYNC (returns JSON result, no UI alerts) ---

function syncFromQBWebApp() {
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12', 'SIGNAL_FAST_current', 'vendor_daily_goals_v1', 'city_coords_v1', 'dashboard_data_cache_v2_blob']);
  try {
    const syncStartMs = Date.now();
    const timings = {};
    const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
    if (!token) return { success: false, error: "QB_USER_TOKEN not configured in Script Properties." };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(REF_SHEET);
    if (!sheet) sheet = ss.insertSheet(REF_SHEET);

    const snapshotStartMs = Date.now();
    const snapshot = _fetchReferenceTableSnapshot(token);
    timings.snapshotFetchMs = Date.now() - snapshotStartMs;
    const allRows = snapshot.rows;
    if (allRows.length === 0) return { success: false, error: "QuickBase returned 0 records. Check the table access and token permissions." };

    const headers = snapshot.headers;
    const outputData = [headers].concat(allRows);
    const numRows = outputData.length, numCols = headers.length;

    const refWriteStartMs = Date.now();
    sheet.clear();
    ensureCapacity(sheet, numRows, numCols);
    sheet.getRange(1, 1, numRows, numCols).setValues(outputData);
    sheet.getRange(1, 1, 1, numCols).setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    trimAndFilterSheet(sheet, numRows, numCols);
    timings.referenceWriteMs = Date.now() - refWriteStartMs;

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
    PropertiesService.getScriptProperties().setProperties({
      "refDataImportDate": timestamp,
      "refDataFileName":   "QuickBase API \u2014 Table " + QB_TABLE_ID,
      "QB_SYNC_DATE":      timestamp,
      "QB_SYNC_COUNT":     String(allRows.length)
    });

    // Reset admin logs so next engine run re-evaluates all admin tasks from fresh ref data
    var adminSheet = ss.getSheetByName("Admin_Logs");
    if (adminSheet && adminSheet.getLastRow() > 1) {
      adminSheet.getRange(2, 2, adminSheet.getLastRow() - 1, 2).clearContent(); // cols B+C: xingDate + statusDate
    }

    logMsg("QB WebApp Sync: " + allRows.length + " records written to " + REF_SHEET);

    // --- Enrich 5-Reference_Data with multi-table Deck reference values ---
    try {
      const deckStartMs = Date.now();
      var refSheet2   = ss.getSheetByName(REF_SHEET);
      var refHeaders2 = refSheet2.getRange(1, 1, 1, refSheet2.getLastColumn()).getValues()[0].map(String);
      var fdhRefIdx   = refHeaders2.findIndex(function(h) { return h.toUpperCase().includes("FDH"); });
      if (fdhRefIdx === -1) throw new Error("FDH column not found in " + REF_SHEET);

      var missingDeckCols = QB_DECK_COLUMNS.filter(function(col) { return refHeaders2.indexOf(col) === -1; });
      if (missingDeckCols.length > 0) {
        var deckColStartIdx = refSheet2.getLastColumn() + 1;
        var headerRange = refSheet2.getRange(1, deckColStartIdx, 1, missingDeckCols.length);
        headerRange.setValues([missingDeckCols]);
        headerRange.setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
        refHeaders2 = refHeaders2.concat(missingDeckCols);
      }

      var refRowCount = Math.max(refSheet2.getLastRow() - 1, 0);
      var refLastCol = refSheet2.getLastColumn();
      var refRange = refRowCount > 0 ? refSheet2.getRange(2, 1, refRowCount, refLastCol) : null;
      var refValues = refRange ? refRange.getValues() : [];
      var fdhRowMap = {};
      refValues.forEach(function(row, i) {
        var key = row[fdhRefIdx] ? row[fdhRefIdx].toString().trim().toUpperCase() : "";
        if (key) fdhRowMap[key] = i;
      });

      for (var tableId in QB_DECK_QUERY_CONFIG) {
        var cfg        = QB_DECK_QUERY_CONFIG[tableId];
        var fetchFids  = [cfg.fdhFid].concat(Object.values(cfg.fields));
        var records    = _fetchTableAllFids(token, tableId, fetchFids);
        var fdhFidStr  = String(cfg.fdhFid);

        // Build colName → FID string map from the named fields config
        var colKeyToCol = {
          q_permit_sent: "QB_Permit_Sent", q_permit_appr: "QB_Permit_Appr",
          q_cross_sub:   "QB_Cross_Sub",   q_cross_appr:  "QB_Cross_Appr",
          q_cross_dist:  "QB_Cross_Dist",  q_active_set:  "QB_Active_Set",
          q_active_pwr:  "QB_Active_Pwr",  q_leg:         "QB_Leg",
          q_transport:   "QB_Transport",   q_how_fed:     "QB_How_Fed",
          q_what_feeds:  "QB_What_Feeds",  q_island:      "QB_Island",
          q_ofs_change:  "QB_Ofs_Change",  q_ofs_reason:  "QB_Ofs_Reason",
          q_cd_dist:     "QB_CD_Dist",     q_splice_dist: "QB_Splice_Dist",
          q_strand_dist: "QB_Strand_Dist", q_bom_sent:    "QB_BOM_Sent",
          q_sow_sign:    "QB_SOW_Sign"
        };
        var colMap = {};
        Object.keys(cfg.fields).forEach(function(key) {
          if (colKeyToCol[key]) colMap[colKeyToCol[key]] = String(cfg.fields[key]);
        });

        records.forEach(function(rec) {
          var fdhCell = rec[fdhFidStr];
          var fdhVal  = fdhCell ? _extractValue(fdhCell.value) : "";
          if (!fdhVal) return;
          var fdhKey = fdhVal.toString().trim().toUpperCase();
          var rowIdx = fdhRowMap[fdhKey];
          if (rowIdx === undefined) return;

          QB_DECK_COLUMNS.forEach(function(col) {
            var fid = colMap[col];
            if (!fid || !rec[fid]) return;
            var val    = _extractValue(rec[fid].value);
            var colIdx = refHeaders2.indexOf(col);
            if (colIdx > -1 && val !== "") refValues[rowIdx][colIdx] = val;
          });
        });
      }
      if (refRange) refRange.setValues(refValues);
      timings.deckEnrichmentMs = Date.now() - deckStartMs;
      logMsg("QB Deck Enrichment: " + Object.keys(fdhRowMap).length + " rows scanned across " + Object.keys(QB_DECK_QUERY_CONFIG).length + " tables.");
    } catch (deckErr) {
      Logger.log("Deck enrichment WARN: " + deckErr.message);
    }

    const changeLogStartMs = Date.now();
    try {
      syncChangeLogs();
    } catch (clErr) {
      Logger.log("Change Log Sync Error: " + clErr.message);
    }
    timings.changeLogSyncMs = Date.now() - changeLogStartMs;
    timings.totalSyncMs = Date.now() - syncStartMs;
    logMsg("QB WebApp Sync timings: " + JSON.stringify(timings));

    return { success: true, count: allRows.length, timestamp: timestamp, timings: timings };

  } catch (e) {
    Logger.log("syncFromQBWebApp ERROR: " + e.message);
    return { success: false, error: e.message };
  }
}

function syncChangeLogs() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) return { success: false, error: "Token missing." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHANGE_LOG_SHEET) || ss.insertSheet(CHANGE_LOG_SHEET);
  const refFdhSet = _getSheetFdhSet(ss.getSheetByName(REF_SHEET), "FDH Engineering ID");
  const archiveFdhSet = _getSheetFdhSet(ss.getSheetByName(HISTORY_SHEET), "FDH Engineering ID");

  const headers = ["FDH Engineering ID", "Type of Change", "New Value", "Updated By", "Date & Time Updated"];
  const fieldUrl = QB_API_BASE + "/fields?tableId=" + CHANGE_LOG_TABLE_ID;
  const fieldResponse = UrlFetchApp.fetch(fieldUrl, _qbHeaders(token));
  if (fieldResponse.getResponseCode() !== 200) throw new Error("QB Change Log field discovery failed: " + fieldResponse.getContentText());

  const fieldList = JSON.parse(fieldResponse.getContentText()) || [];
  const normalizeLabel = (label) => String(label || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const findField = (aliases) => {
    const normalizedAliases = aliases.map(normalizeLabel);
    return fieldList.find(function(field) {
      const label = normalizeLabel(field && field.label);
      return normalizedAliases.some(function(alias) { return label === alias; });
    });
  };

  const fdhField = findField([
    'FDH PROJECT  ENGINEERING ID',
    'FDH PROJECT ENGINEERING ID',
    'FDH ENGINEERING ID',
    'FDH ID',
    'FDH',
    'PROJECT ID / FDH'
  ]);
  const typeField = findField(['TYPE OF CHANGE', 'CHANGE TYPE', 'TYPE']);
  const valueField = findField(['UPDATE', 'NEW VALUE', 'VALUE']);
  const updatedByField = findField(['UPDATED BY', 'USER']);
  const updatedAtField = findField(['DATE & TIME UPDATED', 'UPDATED AT', 'TIMESTAMP', 'DATE UPDATED']);
  const fdhFid = fdhField ? Number(fdhField.id) : 0;
  const typeFid = typeField ? Number(typeField.id) : 0;
  const valueFid = valueField ? Number(valueField.id) : 0;
  const updatedByFid = updatedByField ? Number(updatedByField.id) : 0;
  const updatedAtFid = updatedAtField ? Number(updatedAtField.id) : 0;
  const missingField = !fdhFid || !typeFid || !valueFid || !updatedByFid || !updatedAtFid;
  if (missingField) {
    logMsg("QB Change Log field mapping incomplete: " + JSON.stringify({
      fdhFid: fdhFid,
      typeFid: typeFid,
      valueFid: valueFid,
      updatedByFid: updatedByFid,
      updatedAtFid: updatedAtFid
    }));
    throw new Error("QB Change Log field mapping incomplete. Run discoverChangeLogFields() to inspect live labels/FIDs.");
  }
  logMsg("QB Change Log fields resolved: " + JSON.stringify({
    fdh: { fid: fdhFid, label: fdhField.label, type: fdhField.fieldType },
    type: { fid: typeFid, label: typeField.label, type: typeField.fieldType },
    value: { fid: valueFid, label: valueField.label, type: valueField.fieldType },
    updatedBy: { fid: updatedByFid, label: updatedByField.label, type: updatedByField.fieldType },
    updatedAt: { fid: updatedAtFid, label: updatedAtField.label, type: updatedAtField.fieldType }
  }));

  const fids = [fdhFid, typeFid, valueFid, updatedByFid, updatedAtFid];

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 14);
  const timestamp = sinceDate.getTime();

  const url = "https://api.quickbase.com/v1/records/query";
  const payload = {
    from: CHANGE_LOG_TABLE_ID,
    select: fids,
    where: "{" + updatedAtFid + ".GT." + timestamp + "}",
    sortBy: [{ fieldId: updatedAtFid, order: "DESC" }]
  };

  const options = {
    method: "post",
    headers: {
      "QB-Realm-Hostname": "omnifiber.quickbase.com",
      "Authorization": "QB-USER-TOKEN " + token,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) throw new Error("QB API Error: " + response.getContentText());

  const result = JSON.parse(response.getContentText());
  const data = result.data || [];
  let maxChangeTime = 0;

  const getCellText = function(rec, fid) {
    const cell = rec[String(fid)];
    if (!cell) return "";
    if (cell.displayValue !== null && cell.displayValue !== undefined && cell.displayValue !== "") {
      return _extractValue(cell.displayValue);
    }
    return _extractValue(cell.value);
  };

  const rows = data.map(function(rec) {
    const userVal = getCellText(rec, updatedByFid);
    const updatedAtVal = getCellText(rec, updatedAtFid);
    const dateObj = new Date(updatedAtVal);
    const t = dateObj.getTime();
    if (t > maxChangeTime) maxChangeTime = t;

    // QB date-only fields arrive as midnight CST (GMT-6). Suppress time when it's 00:00.
    const timeStr  = Utilities.formatDate(dateObj, "GMT-6", "HH:mm");
    const dateStr  = Utilities.formatDate(dateObj, "GMT-6", "MM/dd/yy");
    const displayDate = timeStr === "00:00" ? dateStr : dateStr + " " + timeStr;
    return [
      getCellText(rec, fdhFid),
      getCellText(rec, typeFid),
      getCellText(rec, valueFid),
      userVal || "System",
      displayDate
    ];
  });

  const props = PropertiesService.getScriptProperties();
  const lastKnownChange = Number(props.getProperty("LAST_QB_CHANGE_TIME") || 0);
  if (maxChangeTime > lastKnownChange) {
    props.setProperty("LAST_QB_CHANGE_TIME", String(maxChangeTime));
    props.setProperty("LATEST_SIGNAL_EVENT_MS", String(Date.now()));
    logMsg(`🔔 SIGNAL: New QuickBase changes detected (Latest: ${new Date(maxChangeTime).toISOString()})`);
  }

  const scrubbedRows = [];
  let blankFdhCount = 0;
  let droppedUnknownFdhCount = 0;
  rows.forEach(function(row) {
    const fdh = String(row[0] || "").trim().toUpperCase();
    if (!fdh) {
      blankFdhCount++;
      return;
    }
    if (refFdhSet.has(fdh) || archiveFdhSet.has(fdh)) {
      scrubbedRows.push(row);
      return;
    }
    droppedUnknownFdhCount++;
  });
  if (blankFdhCount > 0) {
    logMsg("QB Change Log sync: " + blankFdhCount + " rows dropped for blank FDH after raw extraction fallback.");
  }
  if (droppedUnknownFdhCount > 0) {
    logMsg("QB Change Log sync: " + droppedUnknownFdhCount + " rows dropped because FDH was in neither reference data nor archive.");
  }

  sheet.clear();
  ensureCapacity(sheet, Math.max(scrubbedRows.length + 1, 2), headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (scrubbedRows.length > 0) {
    sheet.getRange(2, 1, scrubbedRows.length, headers.length).setValues(scrubbedRows);
  }
  sheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
  sheet.setFrozenRows(1);
  trimAndFilterSheet(sheet, scrubbedRows.length + 1, headers.length);
  CacheService.getScriptCache().removeAll([
    'dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12',
    'SIGNAL_FAST_current', 'SIGNAL_FAST_week', 'SIGNAL_FAST_month',
    'SIGNAL_FAST_V2_current', 'SIGNAL_FAST_V2_week', 'SIGNAL_FAST_V2_month'
  ]);
  return { success: true, count: scrubbedRows.length };
}


// --- 4. MAIN SYNC FUNCTION ---

function importFDHProjects() {
  const ui = SpreadsheetApp.getUi();

  try {
    const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
    if (!token) {
      ui.alert("QB_USER_TOKEN not found.\n\nGo to Extensions \u2192 Script Properties, add key: QB_USER_TOKEN with your QuickBase user token.");
      return;
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(REF_SHEET);
    if (!sheet) sheet = ss.insertSheet(REF_SHEET);

    const dirtyRows = getDirtyRows();
    if (dirtyRows.length > 0) {
      const resp = ui.alert(
        "Uncommitted Crossings Detected",
        dirtyRows.length + " uncommitted crossings row(s) found in Daily Review.\n\nSync anyway? Dirty rows will be saved to the recovery log.",
        ui.ButtonSet.YES_NO
      );
      if (resp !== ui.Button.YES) return;
      const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
      dirtyRows.forEach(function(row) {
        logMsg("⚠️ DIRTY ROW RECOVERY: FDH=" + row.fdhId + " row=" + row.rowIndex + " at " + timestamp);
      });
    }

    const snapshot = _fetchReferenceTableSnapshot(token);
    const allRows = snapshot.rows;

    if (allRows.length === 0) {
      ui.alert("QuickBase returned 0 records. Check the table access and your token permissions.");
      return;
    }

    // --- Build header row from field labels ---
    const headers = snapshot.headers;

    const outputData = [headers].concat(allRows);
    const numRows    = outputData.length;
    const numCols    = headers.length;

    // --- Write to 5-Reference_Data ---
    sheet.clear();
    ensureCapacity(sheet, numRows, numCols);
    sheet.getRange(1, 1, numRows, numCols).setValues(outputData);

    // --- Format header row (matches importReferenceData style) ---
    sheet.getRange(1, 1, 1, numCols)
      .setBackground("#003366")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);

    // --- Trim excess rows/columns ---
    trimAndFilterSheet(sheet, numRows, numCols);

    // --- Store sync metadata ---
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
    PropertiesService.getScriptProperties().setProperties({
      "refDataImportDate": timestamp,
      "refDataFileName":   "QuickBase API \u2014 Table " + QB_TABLE_ID,
      "QB_SYNC_DATE":      timestamp,
      "QB_SYNC_COUNT":     String(allRows.length)
    });

    const popResult = populateDailyReviewFromReference();
    logMsg("QB Sync complete: " + allRows.length + " records written to " + REF_SHEET + " — Daily Review: " + popResult.updated + " updated, " + popResult.added + " added");
    ui.alert("\u2705 Synced " + allRows.length + " records from QuickBase\n" + timestamp);

  } catch (e) {
    Logger.log("importFDHProjects ERROR: " + e.message);
    ui.alert("Sync failed: " + e.message);
  }
}


// --- 5. CROSSINGS QUEUE FUNCTIONS ---

function commitToQueue() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let adminSheet = ss.getSheetByName("Admin_Logs");
  if (!adminSheet || adminSheet.getLastRow() < 2) {
    ui.alert("No verified crossings ready to commit. Use 'Verify Crossings' on a project card first.");
    return;
  }

  let adminData = adminSheet.getDataRange().getValues();
  let verifiedRows = [];
  for (let i = 1; i < adminData.length; i++) {
    let verifiedDate = adminData[i].length > 3 ? adminData[i][3].toString().trim() : "";
    let committedDate = adminData[i].length > 4 ? adminData[i][4].toString().trim() : "";
    if (verifiedDate !== "" && committedDate === "") {
      verifiedRows.push({ adminRowIdx: i + 1, fdhId: adminData[i][0].toString().trim(), verifiedDate: verifiedDate });
    }
  }

  if (verifiedRows.length === 0) {
    ui.alert("No verified crossings ready to commit. Use 'Verify Crossings' on a project card first.");
    return;
  }

  let refSheet = ss.getSheetByName(REF_SHEET);
  let refLookup = {};
  if (refSheet && refSheet.getLastRow() > 1) {
    let refData    = refSheet.getDataRange().getValues();
    let refHeaders = refData[0].map(h => h.toString().trim());
    let rfdhIdx    = refHeaders.findIndex(h => h.toUpperCase().includes("FDH"));
    let rxIdx      = refHeaders.indexOf("Special Crossings?");
    let rdIdx      = refHeaders.indexOf("Special Crossing Details");
    if (rfdhIdx > -1) {
      for (let i = 1; i < refData.length; i++) {
        let key = refData[i][rfdhIdx].toString().trim().toUpperCase();
        if (key) refLookup[key] = {
          specialX:       rxIdx > -1 ? refData[i][rxIdx].toString().trim() : "",
          specialXDetails: rdIdx > -1 ? refData[i][rdIdx].toString().trim() : ""
        };
      }
    }
  }

  let commitSheet = ss.getSheetByName("6-Committed_Reviews");
  if (!commitSheet) commitSheet = ss.insertSheet("6-Committed_Reviews");
  if (commitSheet.getLastRow() === 0) {
    commitSheet.appendRow(["FDH Engineering ID", "Special Crossings?", "Special Crossing Details", "Verified Date", "Committed Date", "Committed By", "QB Sync Status", "QB Sync Date"]);
    commitSheet.getRange("1:1").setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
    commitSheet.setFrozenRows(1);
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
  const userEmail = Session.getActiveUser().getEmail();

  verifiedRows.forEach(function(row) {
    let ref = refLookup[row.fdhId.toUpperCase()] || { specialX: "", specialXDetails: "" };
    commitSheet.appendRow([row.fdhId, ref.specialX, ref.specialXDetails, row.verifiedDate, timestamp, userEmail, "Pending", ""]);
    adminSheet.getRange(row.adminRowIdx, 5).setValue(timestamp);
  });

  logMsg("Crossings committed to queue: " + verifiedRows.length + " records — " + timestamp);
  ui.alert("\u2705 " + verifiedRows.length + " crossings committed to queue.");
}

// Web-app-safe version — returns JSON result instead of ui.alert
function commitToQueueWebApp() {
  CacheService.getScriptCache().removeAll(['dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12', 'SIGNAL_FAST_current', 'dashboard_data_cache_v2_blob']);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let adminSheet = ss.getSheetByName("Admin_Logs");
    if (!adminSheet || adminSheet.getLastRow() < 2) {
      return { success: true, count: 0 };
    }

    let adminData = adminSheet.getDataRange().getValues();
    let verifiedRows = [];
    for (let i = 1; i < adminData.length; i++) {
      let verifiedDate  = adminData[i].length > 3 ? adminData[i][3].toString().trim() : "";
      let committedDate = adminData[i].length > 4 ? adminData[i][4].toString().trim() : "";
      if (verifiedDate !== "" && committedDate === "") {
        verifiedRows.push({ adminRowIdx: i + 1, fdhId: adminData[i][0].toString().trim(), verifiedDate: verifiedDate });
      }
    }

    if (verifiedRows.length === 0) return { success: true, count: 0 };

    let refSheet = ss.getSheetByName(REF_SHEET);
    let refLookup = {};
    if (refSheet && refSheet.getLastRow() > 1) {
      let refData    = refSheet.getDataRange().getValues();
      let refHeaders = refData[0].map(h => h.toString().trim());
      let rfdhIdx    = refHeaders.findIndex(h => h.toUpperCase().includes("FDH"));
      let rxIdx      = refHeaders.indexOf("Special Crossings?");
      let rdIdx      = refHeaders.indexOf("Special Crossing Details");
      if (rfdhIdx > -1) {
        for (let i = 1; i < refData.length; i++) {
          let key = refData[i][rfdhIdx].toString().trim().toUpperCase();
          if (key) refLookup[key] = {
            specialX:        rxIdx > -1 ? refData[i][rxIdx].toString().trim() : "",
            specialXDetails: rdIdx > -1 ? refData[i][rdIdx].toString().trim() : ""
          };
        }
      }
    }

    let commitSheet = ss.getSheetByName("6-Committed_Reviews");
    if (!commitSheet) commitSheet = ss.insertSheet("6-Committed_Reviews");
    if (commitSheet.getLastRow() === 0) {
      commitSheet.appendRow(["FDH Engineering ID", "Special Crossings?", "Special Crossing Details", "Verified Date", "Committed Date", "Committed By", "QB Sync Status", "QB Sync Date"]);
      commitSheet.getRange("1:1").setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
      commitSheet.setFrozenRows(1);
    }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yy HH:mm");
    const userEmail = Session.getActiveUser().getEmail();

    verifiedRows.forEach(function(row) {
      let ref = refLookup[row.fdhId.toUpperCase()] || { specialX: "", specialXDetails: "" };
      commitSheet.appendRow([row.fdhId, ref.specialX, ref.specialXDetails, row.verifiedDate, timestamp, userEmail, "Pending", ""]);
      adminSheet.getRange(row.adminRowIdx, 5).setValue(timestamp);
    });

    logMsg("Crossings committed via web app: " + verifiedRows.length + " records — " + timestamp);
    return { success: true, count: verifiedRows.length };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function exportCommittedQueueToCSV() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let commitSheet = ss.getSheetByName("6-Committed_Reviews");
  if (!commitSheet || commitSheet.getLastRow() < 2) {
    ui.alert("Committed queue is empty. Commit verified crossings first.");
    return;
  }

  let data = commitSheet.getDataRange().getValues();
  let csvRows = data.map(function(row) {
    return row.map(function(cell) {
      let val = cell instanceof Date
        ? Utilities.formatDate(cell, Session.getScriptTimeZone(), "MM/dd/yy")
        : cell.toString();
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(",");
  });

  let csvContent = csvRows.join("\n");
  let dateStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  let fileName = "QB_Status_Update_Export_" + dateStamp + ".csv";

  let blob = Utilities.newBlob(csvContent, "text/csv", fileName);
  DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(blob);

  logMsg("Quickbase status queue exported: " + fileName);
  ui.alert("✅ Exported to Google Drive (Compiled Reports):\n" + fileName);
}

/**
 * Executes a direct QuickBase writeback for the specified table and records.
 * Uses the PATCH /records endpoint for bulk updates.
 * @param {string} tableId - The QuickBase Table ID.
 * @param {Array<Object>} records - Array of QB record objects.
 * @returns {Object} - Result of the API call.
 */
function writebackQBDirect(tableId, records) {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) throw new Error("QB_USER_TOKEN not found.");

  const url = QB_API_BASE + "/records";
  const options = _qbHeaders(token);
  options.method      = "patch";
  options.contentType = "application/json";
  options.payload     = JSON.stringify({ to: tableId, data: records });

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error("QuickBase API returned " + response.getResponseCode() + ": " + response.getContentText());
  }

  return JSON.parse(response.getContentText());
}
/**
 * Scans 8-Deck_Answers and 6-Committed_Reviews for items with 'Pending' sync status.
 * @returns {Array<Object>} - List of pending items formatted for the UI.
 */
function getPendingWritebackItems() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pending = [];

  // 1. Scan 6-Committed_Reviews (Special Crossings)
  const commitSheet = ss.getSheetByName(REVIEW_LOG_SHEET);
  if (commitSheet && commitSheet.getLastRow() > 1) {
    const data = commitSheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim());
    const fdhIdx = headers.indexOf("FDH Engineering ID");
    const statusIdx = headers.indexOf("QB Sync Status");
    const detailsIdx = headers.indexOf("Special Crossing Details");
    const crossingIdx = headers.indexOf("Special Crossings?");

    // We need the Record ID (RID) from Reference Data to PATCH
    const refDict = getReferenceDictionary();

    for (let i = 1; i < data.length; i++) {
      if (data[i][statusIdx] === "Pending") {
        const fdh = data[i][fdhIdx];
        const ref = refDict[fdh.toString().toUpperCase()];
        if (ref && ref.rid) {
          pending.push({
            fdh: fdh,
            rid: ref.rid,
            type: "Special Crossing",
            tableId: QB_TABLE_ID, // FDH Projects
            fields: {
              "525": data[i][crossingIdx], // Special Crossings? (Choice)
              "526": data[i][detailsIdx]   // Special Crossing Details
            },
            sheetName: REVIEW_LOG_SHEET,
            rowIdx: i + 1
          });
        }
      }
    }
  }

  // 2. Scan 8-Deck_Answers (BOM and other Deck fields)
  const deckSheet = ss.getSheetByName(DECK_SHEET);
  if (deckSheet && deckSheet.getLastRow() > 1) {
    const data = deckSheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim());
    const fdhIdx = headers.indexOf("FDH Engineering ID");
    const statusIdx = headers.indexOf("QB Sync Status");
    const cdIdx = headers.indexOf("CD Distributed");
    const spliceIdx = headers.indexOf("Splice Docs Dist");
    const strandIdx = headers.indexOf("Strand Maps Dist");
    const bomIdx = headers.indexOf("BOM Sent");
    const poIdx = headers.indexOf("PO Number Sent");
    const sowIdx = headers.indexOf("SOW Signed");
    const phaseIdx = headers.indexOf("Phase ID");
    const stageIdx = headers.indexOf("Stage ID");
    const qStatusIdx = headers.indexOf("Status ID");

    const refDict = getReferenceDictionary();

    for (let i = 1; i < data.length; i++) {
      if (data[i][statusIdx] === "Pending") {
        const fdh = data[i][fdhIdx];
        const ref = refDict[fdh.toString().toUpperCase()];
        if (ref && ref.rid) {
          const fields = {};
          if (cdIdx > -1 && data[i][cdIdx]) fields["588"] = data[i][cdIdx];
          if (spliceIdx > -1 && data[i][spliceIdx]) fields["589"] = data[i][spliceIdx];
          if (strandIdx > -1 && data[i][strandIdx]) fields["439"] = data[i][strandIdx];
          if (bomIdx > -1 && data[i][bomIdx]) fields["513"] = data[i][bomIdx];
          if (poIdx > -1 && data[i][poIdx]) fields["587"] = data[i][poIdx];
          if (sowIdx > -1 && data[i][sowIdx]) fields["436"] = data[i][sowIdx];
          
          if (phaseIdx > -1 && data[i][phaseIdx]) fields["742"] = data[i][phaseIdx];
          if (stageIdx > -1 && data[i][stageIdx]) fields["744"] = data[i][stageIdx];
          if (qStatusIdx > -1 && data[i][qStatusIdx]) fields["746"] = data[i][qStatusIdx];

          if (Object.keys(fields).length === 0) continue;

          pending.push({
            fdh: fdh,
            rid: ref.rid,
            type: "Deck / Deliverables / Pipeline",
            tableId: QB_TABLE_ID, 
            fields: fields,
            sheetName: DECK_SHEET,
            rowIdx: i + 1
          });
        }
      }
    }  }

  return pending;
}

/**
 * Public Web App endpoint to sync specific staged records to QuickBase.
...
 * Validates permissions per field before committing.
 * @param {Array<Object>} payload - Array of { tableId, recordId, fields: { fid: value } }
 * @returns {Object} - Summary of success and failures.
 */
/**
 * Public Web App endpoint to sync specific staged records to QuickBase.
 * Validates permissions per field before committing.
 * IMPLEMENTS: Safeguarded Overwrite (Collision Detection).
 * @param {Array<Object>} payload - Array of { tableId, recordId, fields: { fid: value }, overwriteMode }
 * @returns {Object} - Summary of success, collisions, and failures.
 */
function syncSpecificRecordsToQB(payload) {
  if (!payload || !Array.isArray(payload)) return { success: false, error: "Invalid payload." };

  const results = [];
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  const refDict = getReferenceDictionary();

  payload.forEach(function(item) {
    try {
      const fdhKey = (item.fdh || "").toString().toUpperCase();
      const refData = refDict[fdhKey] || {};
      const qbRef = refData.qbRef || {}; // Current values from Reference_Data

      // 1. Permission Guard
      const permittedTable = QB_WRITE_MAPPING[item.tableId];
      if (!permittedTable) {
        results.push({ id: item.recordId, fdh: item.fdh, status: "failed", error: "Table not write-permitted." });
        return;
      }

      const fieldsToUpdate = { "3": { "value": item.recordId } };
      let allPermitted = true;
      let collisions = [];

      Object.keys(item.fields).forEach(function(fid) {
        if (!permittedTable[fid]) {
          allPermitted = false;
          results.push({ id: item.recordId, fdh: item.fdh, status: "failed", error: "Field FID " + fid + " not write-permitted." });
        } else {
          // 2. Collision Detection
          // Map FID to qbRef key (this mapping needs to be robust)
          const qbFieldName = permittedTable[fid];
          const currentVal = qbRef[fid] || qbRef[qbFieldName]; // Check both fid and name for safety

          const isFieldOccupied = (currentVal !== undefined && currentVal !== null && currentVal !== "" && currentVal !== "-");
          const isValueChanging = (String(currentVal).trim() !== String(item.fields[fid]).trim());

          if (!item.overwriteMode && isFieldOccupied && isValueChanging) {
            collisions.push({ fid: fid, field: qbFieldName, current: currentVal, proposed: item.fields[fid] });
          } else {
            fieldsToUpdate[fid] = { "value": item.fields[fid] };
          }
        }
      });

      if (!allPermitted) return;

      if (collisions.length > 0) {
        results.push({ id: item.recordId, fdh: item.fdh, status: "collision", collisions: collisions });
        logMsg("QB Sync COLLISION for " + item.fdh + ": Overwrite required.");
        return;
      }

      // 3. Execute PATCH
      const qbResult = writebackQBDirect(item.tableId, [fieldsToUpdate]);
      
      // 4. Mark in Sheets
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(item.sheetName);
      if (sheet) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
        const statusIdx = headers.indexOf("QB Sync Status");
        const dateIdx = headers.indexOf("QB Sync Date");

        if (statusIdx > -1) {
          sheet.getRange(item.rowIdx, statusIdx + 1).setValue("Synced");
        }
        if (dateIdx > -1) {
          sheet.getRange(item.rowIdx, dateIdx + 1).setValue(new Date());
        }
      }
      
      results.push({ id: item.recordId, fdh: item.fdh, status: "success", qbMetadata: qbResult });
      logMsg("QB Direct Writeback: Success for " + item.fdh + " (RID " + item.recordId + ") in " + item.tableId);

    } catch (e) {
      // Mark failure in sheet
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(item.sheetName);
        if (sheet) {
          const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
          const statusIdx = headers.indexOf("QB Sync Status");
          if (statusIdx > -1) sheet.getRange(item.rowIdx, statusIdx + 1).setValue("Failed");
        }
      } catch (sheetErr) {}

      results.push({ id: item.recordId, fdh: item.fdh, status: "failed", error: e.message });
      logMsg("QB Direct Writeback ERROR for " + item.fdh + ": " + e.message);
    }
  });

  return { success: true, results: results };
}


// --- 6. PRIVATE HELPERS ---

function getDirtyRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const drSheet = ss.getSheetByName(MIRROR_SHEET);
  if (!drSheet || drSheet.getLastRow() < 2) return [];

  const data    = drSheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim());
  const fdhIdx  = headers.findIndex(h => h.toUpperCase().includes("FDH"));
  const xIdx    = headers.indexOf("Special Crossings?");
  const detIdx  = headers.indexOf("Special Crossing Details");
  const comIdx  = headers.indexOf("Committed Date");

  if (fdhIdx < 0 || (xIdx < 0 && detIdx < 0)) return [];

  let dirty = [];
  for (let i = 1; i < data.length; i++) {
    let hasValue = (xIdx > -1 && data[i][xIdx].toString().trim() !== "") ||
                   (detIdx > -1 && data[i][detIdx].toString().trim() !== "");
    let committed = comIdx > -1 && data[i][comIdx].toString().trim() !== "";
    if (hasValue && !committed) {
      dirty.push({ rowIndex: i + 1, fdhId: data[i][fdhIdx].toString().trim() });
    }
  }
  return dirty;
}

function _fetchReferenceTableSnapshot(token) {
  const fields = _fetchTableFields(token, QB_TABLE_ID);
  if (!fields.length) throw new Error("No fields returned for QuickBase table " + QB_TABLE_ID);

  const fids = fields.map(function(field) { return Number(field.id); }).filter(function(fid) { return fid > 0; });
  const records = _fetchTableAllFids(token, QB_TABLE_ID, fids);
  const headers = fields.map(function(field) { return field.label; });
  const rows = records.map(function(record) {
    return fields.map(function(field) {
      const cell = record[String(field.id)];
      var raw = cell ? _extractValue(cell.value) : "";
      if (field.label && field.label.toString().trim().toLowerCase() === "cx vendor") {
        raw = _normalizeVendor(raw);
      }
      return raw;
    });
  });

  logMsg("QB Table Snapshot: " + rows.length + " records pulled from table " + QB_TABLE_ID);
  return { headers: headers, rows: rows };
}

function _getSheetFdhSet(sheet, headerName) {
  const keys = new Set();
  if (!sheet || sheet.getLastRow() < 2) return keys;

  const data = sheet.getDataRange().getValues();
  const headers = (data[0] || []).map(function(h) { return String(h || "").trim(); });
  const idx = headers.indexOf(headerName);
  if (idx === -1) return keys;

  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][idx] || "").trim().toUpperCase();
    if (key) keys.add(key);
  }
  return keys;
}

function _fetchTableFields(token, tableId) {
  const url = QB_API_BASE + "/fields?tableId=" + tableId;
  const response = UrlFetchApp.fetch(url, _qbHeaders(token));
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("QB field discovery returned HTTP " + code + ": " + response.getContentText().substring(0, 300));
  }
  return JSON.parse(response.getContentText()) || [];
}

// Canonical vendor name map — add aliases here as you discover new variants.
// Keys must be lowercase. Values are the display name written to the sheet.
var VENDOR_ALIASES = {
  "lecom":         "LeCom",
  "le com":        "LeCom",
  "drg":           "DRG",
  "mastec":        "MasTec",
  "mas tec":       "MasTec",
  "dycom":         "Dycom",
  "black box":     "Black Box",
  "blackbox":      "Black Box"
};

function _normalizeVendor(name) {
  if (!name) return "";
  var key = name.toString().toLowerCase().trim();
  return VENDOR_ALIASES[key] || name.toString().trim();
}

/**
 * Queries a QB table for specific FIDs using the /records/query endpoint.
 * Returns an array of raw record objects keyed by FID string.
 */
function _fetchTableAllFids(token, tableId, fids) {
  var url        = QB_API_BASE + "/records/query";
  var allRecords = [];
  var skip       = 0;
  var total      = Infinity;

  while (skip < total && skip < QB_MAX_PAGES * QB_PAGE_SIZE) {
    var opts = _qbHeaders(token);
    opts.method      = "post";
    opts.contentType = "application/json";
    opts.payload     = JSON.stringify({
      from:    tableId,
      select:  fids,
      where:   "{3.GT.0}",
      options: { skip: skip, top: QB_PAGE_SIZE }
    });

    var resp = UrlFetchApp.fetch(url, opts);
    if (resp.getResponseCode() !== 200) {
      Logger.log("WARN: QB query HTTP " + resp.getResponseCode() + " for table " + tableId);
      break;
    }

    var parsed = JSON.parse(resp.getContentText());
    (parsed.data || []).forEach(function(r) { allRecords.push(r); });

    var meta = parsed.metadata || {};
    total = (meta.totalRecords != null) ? meta.totalRecords : 0;
    skip += (meta.numRecords  != null) ? meta.numRecords  : 0;
    if (!meta.numRecords || meta.numRecords === 0) break;
  }

  Logger.log("_fetchTableAllFids: " + tableId + " → " + allRecords.length + " records");
  return allRecords;
}

function _extractValue(val) {
  if (val === null || val === undefined) return "";
  // QB multi-select fields return arrays like ["LeCom"] — join to plain text
  if (Array.isArray(val)) {
    return val.map(function(item) { return _extractValue(item); }).join(", ");
  }
  if (typeof val === "object") {
    if (val.name)  return val.name;
    if (val.email) return val.email;
    if (val.url)   return val.url;
    return JSON.stringify(val);
  }
  return val;
}

function _qbHeaders(token) {
  return {
    method:  "get",
    headers: {
      "QB-Realm-Hostname": QB_REALM,
      "Authorization":     "QB-USER-TOKEN " + token,
      "Content-Type":      "application/json"
    },
    muteHttpExceptions: true
  };
}

/**
 * Targeted discovery for the Change Log table FIDs.
 * Run this once to see the field mapping in the Apps Script Logger.
 */
function discoverChangeLogFields() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  
  if (!token) {
    Logger.log("ERROR: QB_USER_TOKEN not found in Script Properties.");
    return;
  }

  const url = "https://api.quickbase.com/v1/fields?tableId=" + CHANGE_LOG_TABLE_ID;
  const options = {
    method: "get",
    headers: {
      "QB-Realm-Hostname": "omnifiber.quickbase.com",
      "Authorization": "QB-USER-TOKEN " + token,
      "Content-Type": "application/json"
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 200) {
      Logger.log("--- FIELD DISCOVERY FOR TABLE: " + CHANGE_LOG_TABLE_ID + " ---");
      result.forEach(field => {
        Logger.log("FID: " + field.id + " | Label: " + field.label + " | Type: " + field.fieldType);
      });
      Logger.log("--- END DISCOVERY ---");
      
      // Optionally write to your dictionary sheet as well
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let dictSheet = ss.getSheetByName("9-QB_Fields") || ss.insertSheet("9-QB_Fields");
      const rows = result.map(f => ["FDH Change Logs", CHANGE_LOG_TABLE_ID, f.id, f.label, f.fieldType]);
      if (rows.length > 0) {
        dictSheet.getRange(dictSheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
        SpreadsheetApp.getUi().alert("FIDs captured! Check the Logger (Cmd+Enter) or the '9-QB_Fields' tab.");
      }
    } else {
      Logger.log("API Error: " + response.getContentText());
    }
  } catch (e) {
    Logger.log("Script Error: " + e.toString());
  }
}

// --- SYNC + REBUILD: atomic QB sync → engine run → fresh payload ---

/**
 * Returns the most recent date found in the Master Archive as a "yyyy-MM-dd" string.
 * Used by syncAndRebuildDashboard to auto-select the target date for the engine run.
 */
function _getLatestArchiveDate() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const histSheet = ss.getSheetByName(HISTORY_SHEET);
    if (!histSheet || histSheet.getLastRow() < 2) {
      return Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
    }
    const dateIdx = HISTORY_HEADERS.indexOf("Date");
    if (dateIdx < 0) return Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
    const data = histSheet.getDataRange().getValues();
    let latest = null;
    for (let i = 1; i < data.length; i++) {
      let d = data[i][dateIdx];
      if (!d) continue;
      let obj = (d instanceof Date) ? d : new Date(d);
      if (!isNaN(obj.getTime()) && (!latest || obj > latest)) latest = obj;
    }
    return latest
      ? Utilities.formatDate(latest, "GMT-5", "yyyy-MM-dd")
      : Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
  } catch (e) {
    logMsg("_getLatestArchiveDate error: " + e.message);
    return Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd");
  }
}

/**
 * Syncs QB reference data and immediately rebuilds the dashboard payload from the
 * latest date in the Master Archive. Returns the full V2 payload (with _syncMeta
 * attached) so the frontend can refresh in a single round-trip.
 */
function syncAndRebuildDashboard() {
  const overallStartMs = Date.now();
  const syncResult = syncFromQBWebApp();
  if (!syncResult.success) {
    return { actionItems: [], _syncMeta: { error: syncResult.error } };
  }
  const latestDate = _getLatestArchiveDate();
  logMsg("syncAndRebuildDashboard: rebuilding from latest archive date → " + latestDate);
  const rebuildStartMs = Date.now();
  generateDailyReviewCore(latestDate, null, false);
  const payloadFetchStartMs = Date.now();
  const payload = getDashboardDataV2();
  const timings = Object.assign({}, syncResult.timings || {}, {
    rebuildReviewMs: Date.now() - rebuildStartMs,
    payloadFetchMs: Date.now() - payloadFetchStartMs,
    totalMs: Date.now() - overallStartMs
  });
  logMsg("syncAndRebuildDashboard timings: " + JSON.stringify(timings));
  payload._syncMeta = { count: syncResult.count, timestamp: syncResult.timestamp, date: latestDate, timings: timings };
  return payload;
}
