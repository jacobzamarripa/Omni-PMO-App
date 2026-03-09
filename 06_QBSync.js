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

    logMsg("QB Sync complete: " + allRows.length + " records written to " + REF_SHEET);
    ui.alert("\u2705 Synced " + allRows.length + " records from QuickBase\n" + timestamp);

  } catch (e) {
    Logger.log("importFDHProjects ERROR: " + e.message);
    ui.alert("Sync failed: " + e.message);
  }
}


// --- 5. PRIVATE HELPERS ---

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
