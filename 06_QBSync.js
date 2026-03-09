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


// --- 2. FIELD DISCOVERY (run once to identify field IDs) ---

function discoverQBFields() {
  const token = PropertiesService.getScriptProperties().getProperty("QB_USER_TOKEN");
  if (!token) {
    SpreadsheetApp.getUi().alert("QB_USER_TOKEN not found.\n\nGo to Extensions \u2192 Script Properties and add it before running.");
    return;
  }

  const url = QB_API_BASE + "/fields?tableId=" + QB_TABLE_ID;
  const response = UrlFetchApp.fetch(url, _qbHeaders(token));
  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error("QB API returned HTTP " + code + ": " + response.getContentText().substring(0, 300));
  }

  const fields = JSON.parse(response.getContentText());
  fields.forEach(function(f) {
    Logger.log("Field ID " + f.id + " \u2192 " + f.label + " (" + f.fieldType + ")");
  });

  SpreadsheetApp.getUi().alert(
    "Found " + fields.length + " fields in the FDH Projects table.\n\n" +
    "Open Apps Script \u2192 Executions \u2192 View logs to see all field IDs and labels."
  );
}


// --- 3. WEB APP SYNC (returns JSON result, no UI alerts) ---

function syncFromQBWebApp() {
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
