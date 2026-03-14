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
const QB_REPORT_ID    = "1000071";
const QB_API_BASE     = "https://api.quickbase.com/v1";
const QB_PAGE_SIZE    = 1000;
const QB_MAX_PAGES    = 20;

// --- PHASE 2 SCAFFOLD (not active — write-back not enabled) ---
// FIDs are unique PER TABLE only. Always pair with parent Table ID to avoid collision.
// Overlapping FIDs: 192 (Active Set), 193 (Active Has Power), 188 (Manager Note)
// exist in both write-permitted tables and must be addressed per namespace below.
const QB_WRITE_MAPPING = {
  "bts3c49e9": { // FDH Projects (Write-Permitted)
    "517": "Sent for Permitting",
    "459": "Permit Approved",
    "527": "DOT Paperwork Submitted",
    "528": "Special Crossing Approved",
    "529": "Approval Dist to Vendor",
    "192": "Active Set",
    "193": "Active Has Power",
    "518": "Transport Available",
    "522": "What Does it Feed",
    "524": "Island Missing Components",
    "188": "Manager Note"
  },
  "bvieaendx": { // Project Management (Write-Permitted)
    "612": "Sent for Permitting",
    "653": "Permit Approved",
    "622": "DOT Paperwork Submitted",
    "623": "Special Crossing Approved",
    "624": "Approval Dist to Vendor",
    "192": "Active Set",
    "193": "Active Has Power",
    "613": "Transport Available",
    "617": "What Does it Feed",
    "619": "Island Missing Components",
    "188": "Manager Note"
  }
  // bts8av3cw (Active Cabinets), bts3c49gt (Permits), bvterz4k4 (FDH Inspections)
  // are READ-ONLY — intentionally excluded from this map.
};

// --- DECK REFERENCE QUERY CONFIG ---
// fdhFid = FID of the "FDH Engineering ID" field in that secondary table.
// Verified: PM table (bvieaendx) uses FID 645 for Engineering ID.
const QB_DECK_QUERY_CONFIG = {
  "bvieaendx": { // Project Management (Write-Permitted)
    fdhFid: 645,
    fields: {
      q_permit_sent: 612, q_permit_appr: 653, q_cross_sub: 622,
      q_cross_appr:  623, q_cross_dist:  624, q_active_set: 192,
      q_active_pwr:  193, q_leg:         274, q_transport:  613,
      q_how_fed:     614, q_what_feeds:  615, q_island:     617,
      q_ofs_change:  619,
      q_cd_dist:     471, q_splice_dist: 473, q_strand_dist: 472,
      q_bom_po:      434, q_sow_sign:    436
    }
  }
  // bts3c49gt (Permits) and bts8av3cw (Cabinets) — add FID configs after field discovery
};

// Column names appended to 5-Reference_Data for Deck gap indicators
const QB_DECK_COLUMNS = [
  "QB_Permit_Sent", "QB_Permit_Appr", "QB_Cross_Sub", "QB_Cross_Appr", "QB_Cross_Dist",
  "QB_Active_Set",  "QB_Active_Pwr",  "QB_Leg",       "QB_Transport",
  "QB_How_Fed",     "QB_What_Feeds",  "QB_Island",    "QB_Ofs_Change",
  "QB_CD_Dist",     "QB_Splice_Dist", "QB_Strand_Dist","QB_BOM_PO",   "QB_SOW_Sign"
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
  CacheService.getScriptCache().remove('dashboard_data_cache');
  try {
    const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
    if (!token) return { success: false, error: "QB_USER_TOKEN not configured in Script Properties." };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(REF_SHEET);
    if (!sheet) sheet = ss.insertSheet(REF_SHEET);

    const allRows = [];
    let fieldMap = null, skip = 0, pageCount = 0, totalRecords = Infinity;

    while (skip < totalRecords && pageCount < QB_MAX_PAGES) {
      const page = _fetchReportPage(token, skip);
      if (!fieldMap) fieldMap = _buildFieldMap(page.fields);
      page.data.forEach(function(record) {
        const row = page.fields.map(function(f) {
          const cell = record[String(f.id)];
          var raw = cell ? _extractValue(cell.value) : "";
          if (f.label && f.label.toString().trim().toLowerCase() === "cx vendor") raw = _normalizeVendor(raw);
          return raw;
        });
        allRows.push(row);
      });
      totalRecords = page.metadata.totalRecords;
      skip        += page.metadata.numRecords;
      pageCount++;
      if (page.metadata.numRecords === 0) break;
    }

    if (allRows.length === 0) return { success: false, error: "QuickBase returned 0 records. Check the Report ID and token permissions." };

    const headers = (fieldMap && fieldMap._order) ? fieldMap._order.map(function(id) { return fieldMap[id]; }) : [];
    const outputData = [headers].concat(allRows);
    const numRows = outputData.length, numCols = headers.length;

    sheet.clear();
    ensureCapacity(sheet, numRows, numCols);
    sheet.getRange(1, 1, numRows, numCols).setValues(outputData);
    sheet.getRange(1, 1, 1, numCols).setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    trimAndFilterSheet(sheet, numRows, numCols);

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");
    PropertiesService.getScriptProperties().setProperties({
      "refDataImportDate": timestamp,
      "refDataFileName":   "QuickBase API \u2014 Report " + QB_REPORT_ID,
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
      var refSheet2   = ss.getSheetByName(REF_SHEET);
      var refHeaders2 = refSheet2.getRange(1, 1, 1, refSheet2.getLastColumn()).getValues()[0].map(String);
      var fdhRefIdx   = refHeaders2.findIndex(function(h) { return h.toUpperCase().includes("FDH"); });
      if (fdhRefIdx === -1) throw new Error("FDH column not found in " + REF_SHEET);

      var refData2 = refSheet2.getRange(2, 1, refSheet2.getLastRow() - 1, refSheet2.getLastColumn()).getValues();
      var fdhRowMap = {};
      refData2.forEach(function(row, i) {
        var key = row[fdhRefIdx] ? row[fdhRefIdx].toString().trim().toUpperCase() : "";
        if (key) fdhRowMap[key] = i + 2;
      });

      QB_DECK_COLUMNS.forEach(function(col) {
        if (refHeaders2.indexOf(col) === -1) {
          var newColIdx = refSheet2.getLastColumn() + 1;
          refSheet2.getRange(1, newColIdx).setValue(col).setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
          refHeaders2.push(col);
        }
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
          q_ofs_change:  "QB_Ofs_Change",
          q_cd_dist:     "QB_CD_Dist",     q_splice_dist: "QB_Splice_Dist",
          q_strand_dist: "QB_Strand_Dist", q_bom_po:      "QB_BOM_PO",
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
          var rowNum = fdhRowMap[fdhKey];
          if (!rowNum) return;

          QB_DECK_COLUMNS.forEach(function(col) {
            var fid = colMap[col];
            if (!fid || !rec[fid]) return;
            var val    = _extractValue(rec[fid].value);
            var colIdx = refHeaders2.indexOf(col) + 1;
            if (colIdx > 0 && val !== "") refSheet2.getRange(rowNum, colIdx).setValue(val);
          });
        });
      }
      logMsg("QB Deck Enrichment: " + Object.keys(fdhRowMap).length + " rows scanned across " + Object.keys(QB_DECK_QUERY_CONFIG).length + " tables.");
    } catch (deckErr) {
      Logger.log("Deck enrichment WARN: " + deckErr.message);
    }

    return { success: true, count: allRows.length, timestamp: timestamp };

  } catch (e) {
    Logger.log("syncFromQBWebApp ERROR: " + e.message);
    return { success: false, error: e.message };
  }
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
      const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");
      dirtyRows.forEach(function(row) {
        logMsg("⚠️ DIRTY ROW RECOVERY: FDH=" + row.fdhId + " row=" + row.rowIndex + " at " + timestamp);
      });
    }

    // --- Paginate through the report ---
    const allRows  = [];
    let fieldMap   = null;
    let skip       = 0;
    let pageCount  = 0;
    let totalRecords = Infinity;

    while (skip < totalRecords && pageCount < QB_MAX_PAGES) {
      const page = _fetchReportPage(token, skip);

      if (!fieldMap) {
        fieldMap = _buildFieldMap(page.fields);
      }

      page.data.forEach(function(record) {
        const row = page.fields.map(function(f) {
          const cell = record[String(f.id)];
          var raw = cell ? _extractValue(cell.value) : "";
          // Normalize vendor names so case variants all map to a canonical form
          if (f.label && f.label.toString().trim().toLowerCase() === "cx vendor") {
            raw = _normalizeVendor(raw);
          }
          return raw;
        });
        allRows.push(row);
      });

      totalRecords = page.metadata.totalRecords;
      skip        += page.metadata.numRecords;
      pageCount++;

      if (page.metadata.numRecords === 0) break;
    }

    if (pageCount >= QB_MAX_PAGES) {
      logMsg("QB Sync: safety limit of " + QB_MAX_PAGES + " pages reached. Some records may be missing.");
    }

    if (allRows.length === 0) {
      ui.alert("QuickBase returned 0 records. Check the Report ID and your token permissions.");
      return;
    }

    // --- Build header row from field labels ---
    const headers = (fieldMap && fieldMap._order)
      ? fieldMap._order.map(function(id) { return fieldMap[id]; })
      : [];

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
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");
    PropertiesService.getScriptProperties().setProperties({
      "refDataImportDate": timestamp,
      "refDataFileName":   "QuickBase API \u2014 Report " + QB_REPORT_ID,
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
    commitSheet.appendRow(["FDH Engineering ID", "Special Crossings?", "Special Crossing Details", "Verified Date", "Committed Date", "Committed By"]);
    commitSheet.getRange("1:1").setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
    commitSheet.setFrozenRows(1);
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");
  const userEmail = Session.getActiveUser().getEmail();

  verifiedRows.forEach(function(row) {
    let ref = refLookup[row.fdhId.toUpperCase()] || { specialX: "", specialXDetails: "" };
    commitSheet.appendRow([row.fdhId, ref.specialX, ref.specialXDetails, row.verifiedDate, timestamp, userEmail]);
    adminSheet.getRange(row.adminRowIdx, 5).setValue(timestamp);
  });

  logMsg("Crossings committed to queue: " + verifiedRows.length + " records — " + timestamp);
  ui.alert("\u2705 " + verifiedRows.length + " crossings committed to queue.");
}

// Web-app-safe version — returns JSON result instead of ui.alert
function commitToQueueWebApp() {
  CacheService.getScriptCache().remove('dashboard_data_cache');
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
      commitSheet.appendRow(["FDH Engineering ID", "Special Crossings?", "Special Crossing Details", "Verified Date", "Committed Date", "Committed By"]);
      commitSheet.getRange("1:1").setBackground("#003366").setFontColor("#ffffff").setFontWeight("bold");
      commitSheet.setFrozenRows(1);
    }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");
    const userEmail = Session.getActiveUser().getEmail();

    verifiedRows.forEach(function(row) {
      let ref = refLookup[row.fdhId.toUpperCase()] || { specialX: "", specialXDetails: "" };
      commitSheet.appendRow([row.fdhId, ref.specialX, ref.specialXDetails, row.verifiedDate, timestamp, userEmail]);
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
        ? Utilities.formatDate(cell, Session.getScriptTimeZone(), "MM/dd/yyyy")
        : cell.toString();
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(",");
  });

  let csvContent = csvRows.join("\n");
  let dateStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  let fileName = "Special_Crossings_Export_" + dateStamp + ".csv";

  let blob = Utilities.newBlob(csvContent, "text/csv", fileName);
  DriveApp.createFile(blob);

  logMsg("Crossings queue exported: " + fileName);
  ui.alert("\u2705 Exported to Google Drive:\n" + fileName);
}

function writebackQBDirect() {
  Browser.msgBox("QB writeback is not yet activated.\n\nUse 'Export Crossings Queue to CSV' to export for manual entry.");
  return;

  // --- STUB: Full QB PATCH implementation (activate when field IDs are confirmed) ---
  // const ui = SpreadsheetApp.getUi();
  // const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  // if (!token) { ui.alert("QB_USER_TOKEN not configured."); return; }
  // const QB_SPECIAL_X_FIELD_ID    = 0; // Replace with actual field ID from discoverQBFields()
  // const QB_SPECIAL_X_DETAIL_FID  = 0; // Replace with actual field ID from discoverQBFields()
  // const ss = SpreadsheetApp.getActiveSpreadsheet();
  // let commitSheet = ss.getSheetByName("6-Committed_Reviews");
  // if (!commitSheet || commitSheet.getLastRow() < 2) { ui.alert("Committed queue is empty."); return; }
  // let data = commitSheet.getDataRange().getValues();
  // let records = [];
  // for (let i = 1; i < data.length; i++) {
  //   records.push({
  //     "3": { "value": data[i][0] },
  //     [QB_SPECIAL_X_FIELD_ID]:   { "value": data[i][1] },
  //     [QB_SPECIAL_X_DETAIL_FID]: { "value": data[i][2] }
  //   });
  // }
  // const url = QB_API_BASE + "/records";
  // const options = _qbHeaders(token);
  // options.method      = "patch";
  // options.contentType = "application/json";
  // options.payload     = JSON.stringify({ to: QB_TABLE_ID, data: records });
  // const response = UrlFetchApp.fetch(url, options);
  // if (response.getResponseCode() !== 200) throw new Error("QB PATCH returned HTTP " + response.getResponseCode());
  // ui.alert("✅ Written back to QuickBase successfully.");
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

function _fetchReportPage(token, skip) {
  const url = QB_API_BASE + "/reports/" + QB_REPORT_ID + "/run?tableId=" + QB_TABLE_ID;
  const options = _qbHeaders(token);
  options.method      = "post";
  options.contentType = "application/json";
  options.payload     = JSON.stringify({ skip: skip, top: QB_PAGE_SIZE });

  const response = UrlFetchApp.fetch(url, options);
  const code     = response.getResponseCode();

  if (code !== 200) {
    throw new Error("QB API returned HTTP " + code + ": " + response.getContentText().substring(0, 300));
  }

  return JSON.parse(response.getContentText());
}

function _buildFieldMap(fields) {
  const map = { _order: [] };
  fields.forEach(function(f) {
    map[f.id]     = f.label;
    map._order.push(f.id);
  });
  return map;
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
