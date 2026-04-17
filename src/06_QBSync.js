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
// Report whose column selection drives the Reference_Data field fetch.
// To add/remove columns: edit the report in QB, no code change needed.
const QB_REFERENCE_REPORT_ID = "1000071";
// Row filter for the FDH Projects snapshot. Limits sync to CX-phase projects only
// (Stage: Permitting → OFS), cutting the record set from ~4700 to ~2000.
// FID 743 = Phase field. Adjust the value if QB uses a different casing.
const QB_REFERENCE_WHERE = "{743.EX.'CX'}";
const QB_DEPENDENCY_TABLE_ID = "bvmsmt5cf";

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
  "QB_Permit_Sent", "QB_Permit_Appr", "QB_Xing_Exist", "QB_Cross_Sub", "QB_Cross_Appr", "QB_Cross_Dist",
  "QB_Active_Set",  "QB_Active_Pwr",  "QB_Leg",       "QB_Transport",
  "QB_How_Fed",     "QB_What_Feeds",  "QB_Island",    "QB_Ofs_Change", "QB_Ofs_Reason",
  "QB_CD_Dist",     "QB_Splice_Dist", "QB_Strand_Dist", "QB_BOM_Sent", "QB_SOW_Sign",
  "QB_PM_RID",      "QB_Blocked_By",  "QB_Blocks"
];

/**
 * Whitelist of QB field labels to fetch from the FDH Projects table (bts3c49e9).
 * With full token access QB exposes 80-100+ fields; the engine only needs ~30.
 * Filtering here keeps Reference_Data lean and Phase 1 sync fast at any record volume.
 *
 * Fields whose label contains "FDH" are always included (engine uses fuzzy match).
 * QB_* deck enrichment columns are NOT listed here — they come from the PM table join.
 *
 * TO UPDATE: run _inspectFieldCount() to see all available labels, then add any new
 * engine-needed fields to this list using their exact QB label.
 */
// Confirmed against the full 464-field list from bts3c49e9 on 2026-04-14.
// "CX Vendor" does not exist in QB — the field is "Construction Vendor" (FID 757).
// DRG / Direct Vendor fields do not exist in QB — sourced from vendor tracker sheets.
// UG/AE/Fiber/NAPs BOM Qty. not confirmed in QB — engine will get blank if absent.
// "Record ID#" (FID 3) is always force-included in the fids list below, not via whitelist.
const QB_REFERENCE_FIELD_WHITELIST = [
  // Identity — FID 13 (exact label only; fuzzy handled separately below)
  "FDH Engineering ID",
  // Project metadata — FID 38, 743, 745, 747
  "City", "Phase", "Stage", "Status",
  // Counts & dates — FID 15, 87, 24, 254, 227
  "BSLs", "HHPs",
  "OFS DATE",
  "CX Start", "CX Complete",
  // Deliverables flags — FID 513, 473, 472, 471, 589, 439, 588, 437, 435
  "BOM in Deliverables",
  "Splice Sheet in Deliverables",
  "Stand Map in Deliverables",
  "CD in Deliverables",
  "Splice Docs Distributed",
  "Strand Maps",
  "CD Distributed",
  "BOM & PO sent",
  "SOW sent",
  // Special crossings — FID 525, 526
  "Special Crossings?", "Special Crossing Details",
  // Vendor — FID 757 (QB label). Remapped to "CX Vendor" in sheet via QB_LABEL_REMAP below.
  "Construction Vendor"
];


// Maps QB field labels → the column header name the engine expects in Reference_Data.
// Add entries here when QB's label differs from what getReferenceDictionary() looks for.
const QB_LABEL_REMAP = {
  "Construction Vendor": "CX Vendor"  // FID 757 — engine looks for "CX Vendor"
};

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
    "FDH Inspections":    "bvterz4k4",
    "Dependencies":       "bvmsmt5cf"
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
      logMsg("WARN", "discoverAllQBFields", "HTTP " + response.getResponseCode() + " for table " + tableName + " (" + tableId + ")");
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
    bumpEngineDictionaryCacheVersion();

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
        var fetchFids  = [cfg.fdhFid, 3].concat(Object.values(cfg.fields)); // Added FID 3 for Record ID
        var records    = _fetchTableAllFids(token, tableId, fetchFids);
        var fdhFidStr  = String(cfg.fdhFid);

        // Build colName → FID string map from the named fields config
        var colKeyToCol = {
          q_permit_sent: "QB_Permit_Sent", q_permit_appr: "QB_Permit_Appr",
          q_xing_exist:  "QB_Xing_Exist",
          q_cross_sub:   "QB_Cross_Sub",   q_cross_appr:  "QB_Cross_Appr",
          q_cross_dist:  "QB_Cross_Dist",  q_active_set:  "QB_Active_Set",
          q_active_pwr:  "QB_Active_Pwr",  q_leg:         "QB_Leg",
          q_transport:   "QB_Transport",   q_how_fed:     "QB_How_Fed",
          q_what_feeds:  "QB_What_Feeds",  q_island:      "QB_Island",
          q_ofs_change:  "QB_Ofs_Change",  q_ofs_reason:  "QB_Ofs_Reason",
          q_cd_dist:     "QB_CD_Dist",     q_splice_dist: "QB_Splice_Dist",
          q_strand_dist: "QB_Strand_Dist", q_bom_sent:    "QB_BOM_Sent",
          q_sow_sign:    "QB_SOW_Sign",
          q_pm_rid:      "QB_PM_RID"       // Local alias for FID 3 on PM table
        };
        var colMap = {};
        Object.keys(cfg.fields).forEach(function(key) {
          if (colKeyToCol[key]) colMap[colKeyToCol[key]] = String(cfg.fields[key]);
        });
        
        // Ensure FID 3 is mapped correctly specifically for the PM table RID
        if (tableId === "bvieaendx") colMap["QB_PM_RID"] = "3";

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

      // --- New: FDH Dependency Link Enrichment (Table bvmsmt5cf) ---
      try {
        const depStartMs = Date.now();
        syncFDHDependencies(token, fdhRowMap, refHeaders2, refValues);
        if (refRange) refRange.setValues(refValues); // Write back updated dependency columns
        timings.dependencyEnrichmentMs = Date.now() - depStartMs;
      } catch (depErr) {
        logMsg("WARN", "syncFromQBWebApp.dependencyEnrichment", depErr.message);
      }
    } catch (deckErr) {
      logMsg("WARN", "syncFromQBWebApp.deckEnrichment", deckErr.message);
    }

    const changeLogStartMs = Date.now();
    try {
      syncChangeLogs();
    } catch (clErr) {
      logMsg("WARN", "syncFromQBWebApp.changeLogSync", clErr.message);
    }
    timings.changeLogSyncMs = Date.now() - changeLogStartMs;
    timings.totalSyncMs = Date.now() - syncStartMs;
    logMsg("QB WebApp Sync timings: " + JSON.stringify(timings));

    return { success: true, count: allRows.length, timestamp: timestamp, timings: timings };

  } catch (e) {
    logMsg("WARN", "syncFromQBWebApp", e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Pulls FDH dependency links from Table bvmsmt5cf and writes them to
 * QB_Blocked_By and QB_Blocks columns in Reference Data.
 */
function syncFDHDependencies(token, fdhRowMap, refHeaders, refValues) {
  const fields = _fetchTableFields(token, QB_DEPENDENCY_TABLE_ID);
  
  const normalizeLabel = (label) => String(label || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const findField = (aliases) => {
    const normalizedAliases = aliases.map(normalizeLabel);
    return fields.find(function(field) {
      const label = normalizeLabel(field && field.label);
      return normalizedAliases.some(function(alias) { return label === alias; });
    });
  };

  // User feedback: "Dependent FDH Project Link ID" and "Check and Balance"
  // "Check and Balance" contains TDO04-F96->TDO04-F208
  const succField = findField(['DEPENDENT FDH PROJECT LINK ID', 'SUCCESSOR', 'CHILD FDH', 'TO FDH']);
  const cbField   = findField(['CHECK AND BALANCE', 'LINK', 'DEPENDENCY']);

  if (!succField || !cbField) {
    logMsg("WARN", "syncFDHDependencies", "Could not find expected fields in table " + QB_DEPENDENCY_TABLE_ID + ". Run discoverDependencyFields() to inspect labels.");
    return;
  }

  const succFid = Number(succField.id);
  const cbFid   = Number(cbField.id);
  const fids    = [succFid, cbFid];

  // Fetch all records from the dependency table
  const records = _fetchTableAllFids(token, QB_DEPENDENCY_TABLE_ID, fids);
  
  // Maps to store aggregated relationships: FDH -> Set of related FDHs
  const blockedByMap = {}; // Current FDH is blocked by [...]
  const blocksMap    = {}; // Current FDH blocks [...]

  records.forEach(function(rec) {
    const cbVal   = rec[String(cbFid)] ? _extractValue(rec[String(cbFid)].value) : "";
    const succVal = rec[String(succFid)] ? _extractValue(rec[String(succFid)].value) : "";
    
    // Parse "TDO04-F96->TDO04-F208" to find the predecessor
    let pred = "";
    if (cbVal && cbVal.includes("->")) {
      pred = cbVal.split("->")[0].trim().toUpperCase();
    }
    const succ = succVal ? succVal.trim().toUpperCase() : (cbVal && cbVal.includes("->") ? cbVal.split("->")[1].trim().toUpperCase() : "");

    if (pred && succ) {
      if (!blockedByMap[succ]) blockedByMap[succ] = new Set();
      blockedByMap[succ].add(pred);

      if (!blocksMap[pred]) blocksMap[pred] = new Set();
      blocksMap[pred].add(succ);
    }
  });

  const blockedByColIdx = refHeaders.indexOf("QB_Blocked_By");
  const blocksColIdx    = refHeaders.indexOf("QB_Blocks");

  if (blockedByColIdx === -1 || blocksColIdx === -1) {
    logMsg("WARN", "syncFDHDependencies", "Target columns QB_Blocked_By or QB_Blocks missing from " + REF_SHEET);
    return;
  }

  // Update refValues with aggregated dependency lists
  for (const fdh in fdhRowMap) {
    const rowIdx = fdhRowMap[fdh];
    const upperFdh = fdh.toUpperCase();

    if (blockedByMap[upperFdh]) {
      refValues[rowIdx][blockedByColIdx] = Array.from(blockedByMap[upperFdh]).join(", ");
    }
    if (blocksMap[upperFdh]) {
      refValues[rowIdx][blocksColIdx] = Array.from(blocksMap[upperFdh]).join(", ");
    }
  }

  logMsg("QB Dependency Enrichment: " + records.length + " links processed.");
}

function syncChangeLogs() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) return { success: false, error: "Token missing." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHANGE_LOG_SHEET) || ss.insertSheet(CHANGE_LOG_SHEET);
  const refFdhSet = _getSheetFdhSet(ss.getSheetByName(REF_SHEET), "FDH Engineering ID");
  const archiveFdhSet = _getSheetFdhSet(ss.getSheetByName(HISTORY_SHEET), "FDH Engineering ID");
  const knownFdhSet = new Set();
  refFdhSet.forEach(function(fdh) { knownFdhSet.add(fdh); });
  archiveFdhSet.forEach(function(fdh) { knownFdhSet.add(fdh); });

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
  sinceDate.setDate(sinceDate.getDate() - 7);
  const timestamp = sinceDate.getTime();

  const url = "https://api.quickbase.com/v1/records/query";
  const data = [];
  let clSkip = 0;
  let clTotal = Infinity;
  let maxChangeTime = 0;

  while (clSkip < clTotal && clSkip < QB_MAX_PAGES * QB_PAGE_SIZE) {
    const payload = {
      from: CHANGE_LOG_TABLE_ID,
      select: fids,
      where: "{" + updatedAtFid + ".GT." + timestamp + "}",
      sortBy: [{ fieldId: updatedAtFid, order: "DESC" }],
      options: { skip: clSkip, top: QB_PAGE_SIZE }
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
    const page = result.data || [];
    page.forEach(function(r) { data.push(r); });
    const meta = result.metadata || {};
    clTotal = (meta.totalRecords != null) ? meta.totalRecords : 0;
    clSkip += (meta.numRecords != null) ? meta.numRecords : 0;
    if (!meta.numRecords || meta.numRecords === 0) break;
  }
  logMsg("QB Change Log: fetched " + data.length + " records (14-day window).");

  const getCellText = function(rec, fid) {
    const cell = rec[String(fid)];
    if (!cell) return "";
    if (cell.displayValue !== null && cell.displayValue !== undefined && cell.displayValue !== "") {
      return _extractValue(cell.displayValue);
    }
    return _extractValue(cell.value);
  };

  const rows = [];
  let blankFdhCount = 0;
  let droppedUnknownFdhCount = 0;
  data.forEach(function(rec) {
    const fdh = String(getCellText(rec, fdhFid) || "").trim().toUpperCase();
    if (!fdh) {
      blankFdhCount++;
      return;
    }
    if (!knownFdhSet.has(fdh)) {
      droppedUnknownFdhCount++;
      return;
    }
    const userVal = getCellText(rec, updatedByFid);
    const updatedAtVal = getCellText(rec, updatedAtFid);
    const dateObj = new Date(updatedAtVal);
    const t = dateObj.getTime();
    if (t > maxChangeTime) maxChangeTime = t;

    // QB date-only fields arrive as midnight CST (GMT-6). Suppress time when it's 00:00.
    const timeStr  = Utilities.formatDate(dateObj, "GMT-6", "HH:mm");
    const dateStr  = Utilities.formatDate(dateObj, "GMT-6", "MM/dd/yy");
    const displayDate = timeStr === "00:00" ? dateStr : dateStr + " " + timeStr;
    rows.push([
      fdh,
      getCellText(rec, typeFid),
      getCellText(rec, valueFid),
      userVal || "System",
      displayDate
    ]);
  });

  const props = PropertiesService.getScriptProperties();
  const lastKnownChange = Number(props.getProperty("LAST_QB_CHANGE_TIME") || 0);
  if (maxChangeTime > lastKnownChange) {
    props.setProperty("LAST_QB_CHANGE_TIME", String(maxChangeTime));
    props.setProperty("LATEST_SIGNAL_EVENT_MS", String(Date.now()));
    logMsg(`🔔 SIGNAL: New QuickBase changes detected (Latest: ${new Date(maxChangeTime).toISOString()})`);
  }

  if (blankFdhCount > 0) {
    logMsg("QB Change Log sync: " + blankFdhCount + " rows dropped for blank FDH after raw extraction fallback.");
  }
  if (droppedUnknownFdhCount > 0) {
    logMsg("QB Change Log sync: " + droppedUnknownFdhCount + " rows dropped because FDH was in neither reference data nor archive.");
  }

  sheet.clear();
  ensureCapacity(sheet, Math.max(rows.length + 1, 2), headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
  // Note on first header cell: link to full QB change log for history beyond 7 days
  sheet.getRange("A1").setNote(
    "Showing last 7 days of changes. For full history visit QB:\n" +
    "https://omnifiber.quickbase.com/nav/app/bts3c49dd/table/" + CHANGE_LOG_TABLE_ID
  );
  sheet.setFrozenRows(1);
  trimAndFilterSheet(sheet, rows.length + 1, headers.length);
  CacheService.getScriptCache().removeAll([
    'dashboard_data_cache_v12_meta', 'dashboard_data_cache_v12',
    'SIGNAL_FAST_current', 'SIGNAL_FAST_week', 'SIGNAL_FAST_month',
    'SIGNAL_FAST_V2_current', 'SIGNAL_FAST_V2_week', 'SIGNAL_FAST_V2_month'
  ]);
  return { success: true, count: rows.length };
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
    bumpEngineDictionaryCacheVersion();

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
              "525": data[i][crossingIdx], // Special Crossings Choice
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
  const allFields = _fetchTableFields(token, QB_TABLE_ID);
  if (!allFields.length) throw new Error("No fields returned for QuickBase table " + QB_TABLE_ID);

  // --- Field selection: report-driven with whitelist fallback ---
  // Primary: pull the FID list from QB report QB_REFERENCE_REPORT_ID.
  //   The report's column selection is the source of truth — add/remove columns
  //   in the QB report UI, no code change needed.
  // Fallback: if the report API call fails, filter by QB_REFERENCE_FIELD_WHITELIST.
  var reportFids = null;
  try {
    var rResp = UrlFetchApp.fetch(QB_API_BASE + '/reports/' + QB_REFERENCE_REPORT_ID + '?tableId=' + QB_TABLE_ID, _qbHeaders(token));
    if (rResp.getResponseCode() === 200) {
      var rData = JSON.parse(rResp.getContentText());
      var cols  = rData.query && rData.query.fields ? rData.query.fields : null;
      if (cols && cols.length > 0) {
        reportFids = cols.map(Number);
        logMsg('QB field selection: report ' + QB_REFERENCE_REPORT_ID + ' → ' + reportFids.length + ' fields');
      }
    }
  } catch (rErr) {
    logMsg('QB report field fetch WARN (falling back to whitelist): ' + rErr.message);
  }

  var fields;
  if (reportFids) {
    var fidSet = {};
    reportFids.forEach(function(id) { fidSet[id] = true; });
    fields = allFields.filter(function(f) { return fidSet[Number(f.id)]; });
  } else {
    // Whitelist fallback — exact label match only (no broad FDH fuzzy to avoid junk fields)
    fields = allFields.filter(function(f) {
      return QB_REFERENCE_FIELD_WHITELIST.indexOf((f.label || '').trim()) > -1;
    });
  }

  // Always include FID 3 (Record ID#) — engine uses it for QB write-back
  if (!fields.some(function(f) { return Number(f.id) === 3; })) {
    var ridField = allFields.find(function(f) { return Number(f.id) === 3; });
    if (ridField) fields.unshift(ridField);
  }
  logMsg('QB field filter: ' + fields.length + ' of ' + allFields.length + ' fields included for ' + QB_TABLE_ID);

  const fids = fields.map(function(field) { return Number(field.id); }).filter(function(fid) { return fid > 0; });
  const records = _fetchTableAllFids(token, QB_TABLE_ID, fids, QB_REFERENCE_WHERE);

  // Apply label remaps so sheet headers match what the engine expects
  const headers = fields.map(function(field) {
    var label = (field.label || '').trim();
    return QB_LABEL_REMAP[label] || label;
  });

  const rows = records.map(function(record) {
    return fields.map(function(field) {
      const cell = record[String(field.id)];
      var raw = cell ? _extractValue(cell.value) : "";
      // Normalize vendor name regardless of QB label (handles "Construction Vendor" remap)
      if (QB_LABEL_REMAP[field.label] === 'CX Vendor' || (field.label || '').trim().toLowerCase() === 'cx vendor') {
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

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h || "").trim(); });
  const idx = headers.indexOf(headerName);
  if (idx === -1) return keys;

  const columnValues = sheet.getRange(2, idx + 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < columnValues.length; i++) {
    const key = String(columnValues[i][0] || "").trim().toUpperCase();
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
function _fetchTableAllFids(token, tableId, fids, where) {
  var url        = QB_API_BASE + "/records/query";
  var allRecords = [];
  var skip       = 0;
  var total      = Infinity;
  var whereClause = where || "{3.GT.0}";

  while (skip < total && skip < QB_MAX_PAGES * QB_PAGE_SIZE) {
    var opts = _qbHeaders(token);
    opts.method      = "post";
    opts.contentType = "application/json";
    opts.payload     = JSON.stringify({
      from:    tableId,
      select:  fids,
      where:   whereClause,
      options: { skip: skip, top: QB_PAGE_SIZE }
    });

    var resp = UrlFetchApp.fetch(url, opts);
    if (resp.getResponseCode() !== 200) {
      logMsg("WARN", "_fetchTableAllFids", "QB query HTTP " + resp.getResponseCode() + " for table " + tableId);
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
 * Targeted discovery for the Dependency table FIDs (bvmsmt5cf).
 * Run this once to see the field mapping in the Apps Script Logger.
 */
function discoverDependencyFields() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) throw new Error("QB_USER_TOKEN not found in Script Properties.");

  const url = QB_API_BASE + "/fields?tableId=" + QB_DEPENDENCY_TABLE_ID;
  const response = UrlFetchApp.fetch(url, _qbHeaders(token));
  const fields = JSON.parse(response.getContentText());

  if (response.getResponseCode() === 200) {
    Logger.log("--- FIELD DISCOVERY FOR TABLE: " + QB_DEPENDENCY_TABLE_ID + " ---");
    fields.forEach(f => {
      Logger.log("FID: " + f.id + " | Label: " + f.label + " | Type: " + f.fieldType);
    });
    Logger.log("--- END DISCOVERY ---");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let dictSheet = ss.getSheetByName(QB_FIELDS_SHEET) || ss.insertSheet(QB_FIELDS_SHEET);
    const rows = fields.map(f => ["Dependencies", QB_DEPENDENCY_TABLE_ID, f.id, f.label, f.fieldType]);
    if (rows.length > 0) {
      dictSheet.getRange(dictSheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
      SpreadsheetApp.getUi().alert("FIDs captured! Check the Logger (Cmd+Enter) or the '9-QB_Fields' tab.");
    }
  } else {
    logMsg("ERROR", "discoverDependencyFields", "HTTP " + response.getResponseCode());
  }
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


// --- ASYNC SYNC (two-phase trigger chain, each phase gets a fresh 6-min GAS window) ---
// Phase 1 (_runQBSyncPhase1): QB API fetch + sheet writes (~3-5 min)
// Phase 2 (_runQBSyncPhase2): engine rebuild + payload save (~2-4 min)

function _deleteQBSyncTriggers_() {
  return ScriptApp.getProjectTriggers()
    .filter(function(t) {
      const fn = t.getHandlerFunction();
      return fn === '_runQBSyncPhase1' || fn === '_runQBSyncPhase2';
    })
    .reduce(function(count, t) {
      ScriptApp.deleteTrigger(t);
      return count + 1;
    }, 0);
}

function _clearQBSyncTransientState_(props) {
  [
    'QB_SYNC_PHASE',
    'QB_SYNC_STARTED',
    'QB_SYNC_RUN_ID',
    'QB_SYNC_PHASE1_TRIGGER_CREATED_AT',
    'QB_SYNC_PHASE2_QUEUED_AT',
    'QB_SYNC_PHASE2_TRIGGER_CREATED_AT',
    'QB_SYNC_PHASE1_RESULT'
  ].forEach(function(key) {
    props.deleteProperty(key);
  });
}

function _setQBSyncTerminalState_(props, status, payload) {
  const completedAt = Date.now();
  const updates = {
    'QB_SYNC_STATUS': status,
    'QB_SYNC_LAST_STATUS': status,
    'QB_SYNC_LAST_COMPLETED': String(completedAt)
  };

  if (status === 'done') {
    const resultJson = JSON.stringify(payload || {});
    updates['QB_SYNC_RESULT'] = resultJson;
    updates['QB_SYNC_LAST_RESULT'] = resultJson;
    updates['QB_SYNC_ERROR'] = '';
    updates['QB_SYNC_LAST_ERROR'] = '';
  } else {
    const errorMessage = payload || 'Unknown error';
    updates['QB_SYNC_ERROR'] = errorMessage;
    updates['QB_SYNC_LAST_ERROR'] = errorMessage;
  }

  props.setProperties(updates);
  _clearQBSyncTransientState_(props);

  const runId = props.getProperty('QB_SYNC_LAST_RUN_ID') || 'unknown';
  if (status === 'done') {
    const result = payload || {};
    logMsg(
      'QB Async Sync terminal state — status=done, runId=' + runId +
      ', date=' + (result.date || 'unknown') +
      ', records=' + (result.count == null ? 'unknown' : result.count)
    );
  } else {
    logMsg('QB Async Sync terminal state — status=error, runId=' + runId + ', error=' + (payload || 'Unknown error'));
  }
}

/**
 * Called by the frontend. Clears stale state, cleans up any orphaned triggers,
 * then fires Phase 1. Returns immediately so the browser never waits.
 */
function kickoffQBSync() {
  const props = PropertiesService.getScriptProperties();
  const kickoffStartedAt = Date.now();

  // Guard against double-triggering — but reset if stale (> 14 min covers both phases)
  if (props.getProperty('QB_SYNC_STATUS') === 'running') {
    const started = Number(props.getProperty('QB_SYNC_STARTED') || 0);
    const elapsed = started ? Date.now() - started : 0;
    if (elapsed < 14 * 60 * 1000) return { pending: true, alreadyRunning: true };
    logMsg('kickoffQBSync: stale running status — resetting and re-triggering.');
    _clearQBSyncTransientState_(props);
  }

  // Clean up any orphaned triggers from prior failed runs
  const deletedTriggerCount = _deleteQBSyncTriggers_();

  const runId = String(kickoffStartedAt);

  props.setProperties({
    'QB_SYNC_STATUS':  'running',
    'QB_SYNC_PHASE':   '1',
    'QB_SYNC_STARTED': String(kickoffStartedAt),
    'QB_SYNC_RUN_ID': runId,
    'QB_SYNC_LAST_STARTED': String(kickoffStartedAt),
    'QB_SYNC_LAST_RUN_ID': runId,
    'QB_SYNC_ERROR': ''
  });

  const phase1TriggerCreatedAt = Date.now();
  props.setProperty('QB_SYNC_PHASE1_TRIGGER_CREATED_AT', String(phase1TriggerCreatedAt));
  ScriptApp.newTrigger('_runQBSyncPhase1').timeBased().after(1000).create();
  logMsg('QB Async Sync kickoff scheduled', 'runId=' + runId + ', deletedTriggers=' + deletedTriggerCount + ', phase1TriggerDelayMs=' + (phase1TriggerCreatedAt - kickoffStartedAt));
  if (typeof logAutomationHealthSummary === 'function') logAutomationHealthSummary('Automation health after QB kickoff');
  return { pending: true };
}

/**
 * Phase 1 trigger: QB API fetch + sheet writes.
 * On success, saves the sync result and immediately chains Phase 2.
 */
function _runQBSyncPhase1(e) {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === '_runQBSyncPhase1'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  const props = PropertiesService.getScriptProperties();
  try {
    const phase1StartMs = Date.now();
    const runId = props.getProperty('QB_SYNC_RUN_ID') || 'unknown';
    const phase1TriggerCreatedAt = Number(props.getProperty('QB_SYNC_PHASE1_TRIGGER_CREATED_AT') || 0);
    const phase1TriggerLatencyMs = phase1TriggerCreatedAt ? phase1StartMs - phase1TriggerCreatedAt : null;
    logMsg('QB Async Sync — Phase 1 start (QB fetch + sheet writes)', 'runId=' + runId + ', triggerLatencyMs=' + (phase1TriggerLatencyMs === null ? 'unknown' : phase1TriggerLatencyMs));
    const syncResult = syncFromQBWebApp();
    if (!syncResult.success) {
      _setQBSyncTerminalState_(props, 'error', syncResult.error || 'Phase 1 failed');
      return;
    }
    const phase2QueuedAt = Date.now();
    const phase2TriggerCreatedAt = Date.now();
    // Stash Phase 1 result so Phase 2 can include it in the final meta
    props.setProperties({
      'QB_SYNC_PHASE':       '2',
      'QB_SYNC_PHASE2_QUEUED_AT': String(phase2QueuedAt),
      'QB_SYNC_PHASE2_TRIGGER_CREATED_AT': String(phase2TriggerCreatedAt),
      'QB_SYNC_PHASE1_RESULT': JSON.stringify({
        count:     syncResult.count,
        timestamp: syncResult.timestamp,
        timings:   syncResult.timings,
        triggerLatencyMs: phase1TriggerLatencyMs,
        runId: runId
      })
    });
    ScriptApp.newTrigger('_runQBSyncPhase2').timeBased().after(1000).create();
    logMsg('QB Async Sync — Phase 1 complete (' + syncResult.count + ' records). Chaining Phase 2.', 'runId=' + runId + ', phase2TriggerDelayMs=' + (phase2TriggerCreatedAt - phase2QueuedAt));
  } catch (err) {
    logMsg('QB Async Sync Phase 1 ERROR: ' + err.message);
    _setQBSyncTerminalState_(props, 'error', err.message);
  }
}

/**
 * Phase 2 trigger: engine rebuild + payload save.
 * Writes the terminal 'done' status when complete.
 */
function _runQBSyncPhase2(e) {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === '_runQBSyncPhase2'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  const props = PropertiesService.getScriptProperties();
  try {
    const phase2StartMs = Date.now();
    const phase1 = JSON.parse(props.getProperty('QB_SYNC_PHASE1_RESULT') || '{}');
    const runId = props.getProperty('QB_SYNC_RUN_ID') || phase1.runId || 'unknown';
    const queuedAtMs = Number(props.getProperty('QB_SYNC_PHASE2_QUEUED_AT') || 0);
    const phase2TriggerCreatedAt = Number(props.getProperty('QB_SYNC_PHASE2_TRIGGER_CREATED_AT') || 0);
    const phase2QueueLatencyMs = queuedAtMs ? phase2StartMs - queuedAtMs : null;
    const phase2TriggerLatencyMs = phase2TriggerCreatedAt ? phase2StartMs - phase2TriggerCreatedAt : null;
    logMsg('QB Async Sync — Phase 2 start (engine rebuild)', 'runId=' + runId + ', queueLatencyMs=' + (phase2QueueLatencyMs === null ? 'unknown' : phase2QueueLatencyMs) + ', triggerLatencyMs=' + (phase2TriggerLatencyMs === null ? 'unknown' : phase2TriggerLatencyMs));
    const latestDate = _getLatestArchiveDate();
    const rebuildStartMs = Date.now();
    generateDailyReviewCore(latestDate, null, false);
    const payloadTimings = JSON.parse(props.getProperty('QB_LAST_PAYLOAD_TIMINGS') || '{}');
    const phase2Timings = {
      runId: runId,
      phase1TriggerLatencyMs: phase1.triggerLatencyMs == null ? null : phase1.triggerLatencyMs,
      phase2TriggerLatencyMs: phase2TriggerLatencyMs,
      queueLatencyMs: phase2QueueLatencyMs,
      rebuildMs: Date.now() - rebuildStartMs,
      totalPhase2Ms: Date.now() - phase2StartMs
    };
    if (payloadTimings && Object.keys(payloadTimings).length) phase2Timings.payloadBuild = payloadTimings;
    _setQBSyncTerminalState_(props, 'done', {
      count:     phase1.count,
      timestamp: phase1.timestamp,
      date:      latestDate,
      timings:   Object.assign({}, phase1.timings || {}, phase2Timings)
    });
    logMsg('QB Async Sync — Phase 2 complete. date=' + latestDate + ', records=' + phase1.count + ', timings=' + JSON.stringify(phase2Timings));
  } catch (err) {
    logMsg('QB Async Sync Phase 2 ERROR: ' + err.message);
    _setQBSyncTerminalState_(props, 'error', err.message);
  }
}

/**
 * Lightweight poll target. Frontend calls this every 5 seconds to check sync progress.
 * Returns { status: 'idle'|'running'|'done'|'error', meta?, error?, elapsedMs? }.
 * Resets status to 'idle' after reading a terminal state (done/error).
 */
function getQBSyncStatus() {
  const props  = PropertiesService.getScriptProperties();
  const status = props.getProperty('QB_SYNC_STATUS') || 'idle';
  const result = { status: status };

  if (status === 'done') {
    try { result.meta = JSON.parse(props.getProperty('QB_SYNC_RESULT') || '{}'); } catch (e) {}
    props.setProperty('QB_SYNC_STATUS', 'idle');
  } else if (status === 'error') {
    result.error = props.getProperty('QB_SYNC_ERROR') || 'Unknown error';
    props.setProperty('QB_SYNC_STATUS', 'idle');
  } else if (status === 'running') {
    const started = Number(props.getProperty('QB_SYNC_STARTED') || 0);
    result.elapsedMs = started ? Date.now() - started : 0;
    result.phase = props.getProperty('QB_SYNC_PHASE') || '1';
    // Auto-reset stale status — allow 14 min to cover both Phase 1 + Phase 2
    if (result.elapsedMs > 14 * 60 * 1000) {
      _deleteQBSyncTriggers_();
      _setQBSyncTerminalState_(props, 'error', 'Sync timed out after 14 min. Check Apps Script execution logs.');
      result.status = 'error';
      result.error  = props.getProperty('QB_SYNC_ERROR');
    }
  }

  return result;
}


// --- DEV/TEST HELPERS (safe to run from GAS editor; delete after validation) ---

function _inspectFieldCount() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  const allFields = _fetchTableFields(token, QB_TABLE_ID);
  Logger.log("Total fields visible on " + QB_TABLE_ID + ": " + allFields.length);

  // Write full list to 9-QB_Fields sheet so all 464 are visible
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(QB_FIELDS_SHEET) || ss.insertSheet(QB_FIELDS_SHEET);
  sheet.clear();
  sheet.appendRow(["FID", "Label", "Field Type", "In Whitelist?"]);
  sheet.getRange("1:1").setFontWeight("bold").setBackground("#0f172a").setFontColor("white");

  const whitelistSet = {};
  QB_REFERENCE_FIELD_WHITELIST.forEach(function(l) { whitelistSet[l] = true; });

  const rows = allFields.map(function(f) {
    const label = f.label || "";
    const inList = label.toUpperCase().includes("FDH") ? "FDH (fuzzy)" :
                   (whitelistSet[label] ? "✅ YES" : "");
    return [f.id, label, f.fieldType, inList];
  });
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 4);
  SpreadsheetApp.flush();
  Logger.log("Written " + allFields.length + " fields to " + QB_FIELDS_SHEET + " tab.");
}

// Shows which fields the QB report includes, which engine-needed columns are in it,
// and which engine-needed columns are MISSING from the report (add those in QB).
function _inspectReportVsEngine() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  const allFields = _fetchTableFields(token, QB_TABLE_ID);
  const fidToLabel = {};
  allFields.forEach(function(f) { fidToLabel[Number(f.id)] = f.label; });

  var reportFids = [];
  var rResp = UrlFetchApp.fetch(QB_API_BASE + '/reports/' + QB_REFERENCE_REPORT_ID + '?tableId=' + QB_TABLE_ID, _qbHeaders(token));
  Logger.log('Report API HTTP ' + rResp.getResponseCode());
  Logger.log('Report API raw response:\n' + rResp.getContentText().substring(0, 2000));
  if (rResp.getResponseCode() === 200) {
    var rData = JSON.parse(rResp.getContentText());
    reportFids = ((rData.query && rData.query.fields) ? rData.query.fields : []).map(Number);
  }
  var reportLabels = reportFids.map(function(id) { return fidToLabel[id] || ('FID:' + id); });

  // Engine-needed labels (from QB_REFERENCE_FIELD_WHITELIST + FDH fuzzy)
  var engineNeeded = ['FDH Engineering ID (fuzzy)'].concat(QB_REFERENCE_FIELD_WHITELIST);

  var inReport   = reportLabels.filter(function(l) { return QB_REFERENCE_FIELD_WHITELIST.indexOf(l) > -1 || l.toUpperCase().includes('FDH'); });
  var missingFromReport = engineNeeded.filter(function(l) {
    if (l === 'FDH Engineering ID (fuzzy)') return !reportLabels.some(function(r) { return r.toUpperCase().includes('FDH'); });
    return reportLabels.indexOf(l) === -1;
  });
  var extraInReport = reportLabels.filter(function(l) {
    return QB_REFERENCE_FIELD_WHITELIST.indexOf(l) === -1 && !l.toUpperCase().includes('FDH');
  });

  Logger.log('=== Report ' + QB_REFERENCE_REPORT_ID + ' field count: ' + reportFids.length + ' ===');
  Logger.log('Report labels:\n  ' + reportLabels.join('\n  '));
  Logger.log('\n✅ Engine needs & report has (' + inReport.length + '):\n  ' + inReport.join('\n  '));
  Logger.log('\n❌ Engine needs but MISSING from report (' + missingFromReport.length + '):\n  ' + (missingFromReport.join('\n  ') || 'none'));
  Logger.log('\n➕ In report but not in engine whitelist (' + extraInReport.length + '):\n  ' + (extraInReport.join('\n  ') || 'none'));
}


function _testKickoff() {
  Logger.log(JSON.stringify(kickoffQBSync()));
}

function _testStatus() {
  Logger.log(JSON.stringify(getQBSyncStatus()));
}

function _inspectSyncProps() {
  const p = PropertiesService.getScriptProperties();
  Logger.log(JSON.stringify({
    status:  p.getProperty('QB_SYNC_STATUS'),
    phase:   p.getProperty('QB_SYNC_PHASE'),
    started: p.getProperty('QB_SYNC_STARTED'),
    result:  p.getProperty('QB_SYNC_RESULT'),
    error:   p.getProperty('QB_SYNC_ERROR')
  }));
}

function _resetSyncProps() {
  const p = PropertiesService.getScriptProperties();
  p.deleteProperty('QB_SYNC_STATUS');
  p.deleteProperty('QB_SYNC_STARTED');
  p.deleteProperty('QB_SYNC_RESULT');
  p.deleteProperty('QB_SYNC_ERROR');
  Logger.log('Sync props cleared.');
}
