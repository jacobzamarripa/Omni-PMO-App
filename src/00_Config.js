/**
 * FILE: 00_Config.gs
 * PURPOSE: Configuration, Constants, Colors, and SHARED HELPER FUNCTIONS
 */

const ARCHIVE_FOLDER_ID   = "1EqGpR7HYlMfTezGXol2kNZ9vVvGTtP4-"; // Production_Archive
const INCOMING_FOLDER_ID  = "1ofH6CIxjeoazZqxZ1EBulmwY02_WdieG"; // Daily_Production_Reports
const COMPILED_FOLDER_ID  = "1YJiF1bdfZkHscRfYuYCOI91kzT22dONV"; // Compiled_Daily_Production_Reports / 01_Pending_Upload
const UPLOADED_FOLDER_ID  = "1b6n2GCX_qJYWp0lgVgP1JE9iWm9VQqJr"; // 02_Uploaded
const COMPILED_PARENT_FOLDER_ID = "1Wd9yx8VCgnAY76EIuo_dkFO4mF7yy7vN"; // Compiled_Daily_Production_Reports (Parent)
const REFERENCE_FOLDER_ID = "1KBFJ5SWrTgRnU5zWUmcDOZtOiTNLonRk"; // Production_Incoming
const OMNI_FIBER_FOLDER_ID = "1wuz8GwOpwDSl_Xmc08uZbQKf_JICwdNt"; // Omni Fiber Root
const BOMS_FOLDER_ID = "1TfXAt8lQKl0emi7zE8V_aex6k2YH8Ogl";
const CDS_PERMITS_FOLDER_ID = "1BxKhfNAXo32TPEvrTBsGi69lVo9njDU8";
const VENDOR_TRACKER_ID   = "1O9PiwSxkoI6md8XEIUfohV3yY4ot5uqqO9VKU8HfEl0"; 
const PAYLOAD_FOLDER_ID     = "11wQaLNWF4xgBL_nkU8kYKXsaU8zowME9"; // App_Datastore
const PAYLOAD_FILENAME      = "dashboard_payload_v2.json";
const DEFAULT_VENDOR_DAILY_GOALS = {
  "Bucyrus": 18000,
  "Dycom": 22000,
  "Ervin": 20000,
  "Locating Inc": 15000,
  "MasTec": 24000,
  "MCI": 18000,
  "Orbital": 20000,
  "Prince": 22000,
  "Quanta": 22000
};
const DEFAULT_CITY_COORDS = {
  "ABILENE": { city: "Abilene", state: "TX", lat: 32.4487, lng: -99.7331 },
  "AKRON": { city: "Akron", state: "OH", lat: 41.0814, lng: -81.5190 },
  "ALLENTOWN": { city: "Allentown", state: "PA", lat: 40.6023, lng: -75.4714 },
  "ANN ARBOR": { city: "Ann Arbor", state: "MI", lat: 42.2808, lng: -83.7430 },
  "ARLINGTON": { city: "Arlington", state: "TX", lat: 32.7357, lng: -97.1081 },
  "AUSTIN": { city: "Austin", state: "TX", lat: 30.2672, lng: -97.7431 },
  "BAY CITY": { city: "Bay City", state: "MI", lat: 43.5945, lng: -83.8889 },
  "BEAUMONT": { city: "Beaumont", state: "TX", lat: 30.0802, lng: -94.1266 },
  "BETHLEHEM": { city: "Bethlehem", state: "PA", lat: 40.6259, lng: -75.3705 },
  "CANTON": { city: "Canton", state: "OH", lat: 40.7989, lng: -81.3784 },
  "CINCINNATI": { city: "Cincinnati", state: "OH", lat: 39.1031, lng: -84.5120 },
  "CLEVELAND": { city: "Cleveland", state: "OH", lat: 41.4993, lng: -81.6944 },
  "COLUMBUS": { city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988 },
  "CORPUS CHRISTI": { city: "Corpus Christi", state: "TX", lat: 27.8006, lng: -97.3964 },
  "DALLAS": { city: "Dallas", state: "TX", lat: 32.7767, lng: -96.7970 },
  "DAYTON": { city: "Dayton", state: "OH", lat: 39.7589, lng: -84.1916 },
  "DETROIT": { city: "Detroit", state: "MI", lat: 42.3314, lng: -83.0458 },
  "EL PASO": { city: "El Paso", state: "TX", lat: 31.7619, lng: -106.4850 },
  "ERIE": { city: "Erie", state: "PA", lat: 42.1292, lng: -80.0851 },
  "FLINT": { city: "Flint", state: "MI", lat: 43.0125, lng: -83.6875 },
  "FORT WORTH": { city: "Fort Worth", state: "TX", lat: 32.7555, lng: -97.3308 },
  "GRAND RAPIDS": { city: "Grand Rapids", state: "MI", lat: 42.9634, lng: -85.6681 },
  "HARRISBURG": { city: "Harrisburg", state: "PA", lat: 40.2732, lng: -76.8867 },
  "HOUSTON": { city: "Houston", state: "TX", lat: 29.7604, lng: -95.3698 },
  "JACKSON": { city: "Jackson", state: "MI", lat: 42.2459, lng: -84.4013 },
  "KALAMAZOO": { city: "Kalamazoo", state: "MI", lat: 42.2917, lng: -85.5872 },
  "KILLEEN": { city: "Killeen", state: "TX", lat: 31.1171, lng: -97.7278 },
  "LANCASTER": { city: "Lancaster", state: "PA", lat: 40.0379, lng: -76.3055 },
  "LANSING": { city: "Lansing", state: "MI", lat: 42.7325, lng: -84.5555 },
  "LIMA": { city: "Lima", state: "OH", lat: 40.7426, lng: -84.1052 },
  "LORAIN": { city: "Lorain", state: "OH", lat: 41.4528, lng: -82.1824 },
  "LUBBOCK": { city: "Lubbock", state: "TX", lat: 33.5779, lng: -101.8552 },
  "MANSFIELD": { city: "Mansfield", state: "OH", lat: 40.7584, lng: -82.5154 },
  "MIDLAND": { city: "Midland", state: "TX", lat: 31.9974, lng: -102.0779 },
  "ODESSA": { city: "Odessa", state: "TX", lat: 31.8457, lng: -102.3676 },
  "PHILADELPHIA": { city: "Philadelphia", state: "PA", lat: 39.9526, lng: -75.1652 },
  "PITTSBURGH": { city: "Pittsburgh", state: "PA", lat: 40.4406, lng: -79.9959 },
  "READING": { city: "Reading", state: "PA", lat: 40.3356, lng: -75.9269 },
  "SAGINAW": { city: "Saginaw", state: "MI", lat: 43.4195, lng: -83.9508 },
  "SAN ANTONIO": { city: "San Antonio", state: "TX", lat: 29.4241, lng: -98.4936 },
  "SANDUSKY": { city: "Sandusky", state: "OH", lat: 41.4489, lng: -82.7079 },
  "SCRANTON": { city: "Scranton", state: "PA", lat: 41.4089, lng: -75.6624 },
  "STATE COLLEGE": { city: "State College", state: "PA", lat: 40.7934, lng: -77.8600 },
  "TEMPLE": { city: "Temple", state: "TX", lat: 31.0982, lng: -97.3428 },
  "TOLEDO": { city: "Toledo", state: "OH", lat: 41.6528, lng: -83.5379 },
  "TRAVERSE CITY": { city: "Traverse City", state: "MI", lat: 44.7631, lng: -85.6206 },
  "TYLER": { city: "Tyler", state: "TX", lat: 32.3513, lng: -95.3011 },
  "WACO": { city: "Waco", state: "TX", lat: 31.5493, lng: -97.1467 },
  "YORK": { city: "York", state: "PA", lat: 39.9626, lng: -76.7277 },
  "YOUNGSTOWN": { city: "Youngstown", state: "OH", lat: 41.0998, lng: -80.6495 }
};

const QB_UPLOAD_SHEET    = "1-QuickBase_Upload";
const HISTORY_SHEET      = "2-Master_Archive";
const MIRROR_SHEET       = "3-Daily_Review"; 
const LOG_SHEET          = "4-System_Logs";
const REF_SHEET          = "5-Reference_Data";
const STYLE_MASTER       = "Style_Master";
const REVIEW_LOG_SHEET   = "6-Committed_Reviews";
const XING_SHEET         = "7-CD_Special_Xings"; 
const DECK_SHEET         = "8-Deck_Answers";
const QB_FIELDS_SHEET    = "9-QB_Fields";
const CHANGE_LOG_SHEET   = "10-Change_Log";

const HISTORY_HEADERS = ["Date", "Contractor", "FDH Engineering ID", "Locates Called In", "Cabinets Set", "Light to Cabinets", "Target Completion Date", "BSLs", "Budget OFS", "CX Start", "CX Complete", "Daily UG Footage", "Total UG Footage Completed", "UG BOM Quantity", "UG Complete?", "Daily Strand Footage", "Total Strand Footage Complete?", "Strand BOM Quantity", "Strand Complete?", "Daily Fiber Footage", "Total Fiber Footage Complete", "Fiber BOM Quantity", "Fiber Complete?", "Daily NAPs/Encl. Completed", "Total NAPs Completed", "NAP/Encl. BOM Qty.", "NAPs/Encl. Complete?", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews", "Vendor Comment"];
const QB_HEADERS = ["Date", "Contractor", "FDH Engineering ID", "Locates Called In", "Cabinets Set", "Light to Cabinets", "Target Completion Date", "Daily UG Footage", "Daily Strand Footage", "Daily Fiber Footage", "Daily NAPs/Encl. Completed", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews", "Construction Comments"];
const DECK_HEADERS = [
  "Timestamp", "FDH Engineering ID", "Vendor", "Target Date",
  "Sent for Permitting", "Permit Approved", "DOT Paperwork Submitted", "Special Crossing Approved", "Approval Dist to Vendor",
  "CD Distributed", "Splice Docs Dist", "Strand Maps Dist", "BOM Sent", "PO Number Sent", "SOW Signed",
  "Active Set", "Active Has Power", "Leg ID", "Transport Available", "How is it Fed", "What Does it Feed", "Island Missing Components",
  "OFS Changed Check", "OFS Changed Reason", "Is Xing Override", "Phase ID", "Stage ID", "Status ID", "Manager Note", "QB Sync Status"
];

// 🧠 ADDED: CX Start and CX Complete
const REVIEW_EXTRA_HEADERS = ["City", "Stage", "Status", "BSLs", "Budget OFS", "CX Start", "CX Complete", "CX Inferred", "CD Intelligence", "Gemini Insight", "Gemini Insight Date"];

const ANALYTICS_QUADRANT = ["Historical Milestones", "Health Flags", "Action Required", "Field Production", "QB Context & Gaps"];

const CHECKBOX_COLUMNS = ["Locates Called In", "Cabinets Set", "Light to Cabinets", "UG Complete?", "Strand Complete?", "Fiber Complete?", "NAPs/Encl. Complete?"];
const NUMERIC_COLUMNS = ["Daily UG Footage", "Total UG Footage Completed", "UG BOM Quantity", "Daily Strand Footage", "Total Strand Footage Complete?", "Strand BOM Quantity", "Daily Fiber Footage", "Total Fiber Footage Complete", "Fiber BOM Quantity", "Daily NAPs/Encl. Completed", "Total NAPs Completed", "NAP/Encl. BOM Qty.", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews"];
const DATE_COLUMNS = ["Date", "Target Completion Date", "CX Start", "CX Complete"];

const OVERAGE_THRESHOLD = 1.05;
const FT_PER_MILE = 5280;

const ROW_THEMES = { PERMITTING: { bg: "#faf5ff", text: "#a855f7", label: "🟣 PERMITTING" }, OFS: { bg: "#eff6ff", text: "#2563eb", label: "🔵 OFS" }, COMPLETE: { bg: "#f0fdf4", text: "#22c55e", label: "🟢 COMPLETE" }, ON_HOLD: { bg: "#f8fafc", text: "#94a3b8", label: "⚪ ON HOLD" }, ACTIVE: { bg: null, text: null, label: "" } };
const BENNY_COLORS = { RED: { bg: "#fee2e2", text: "#ef4444", name: "warn" }, YELLOW: { bg: "#fef08a", text: "#b45309", name: "mismatch" }, UG: { bg: "#ffedd5", text: "#ea580c", name: "ug" }, AE: { bg: "#f1f5f9", text: "#475569", name: "ae" }, FIB: { bg: "#ffe4e6", text: "#e11d48", name: "fib" }, NAP: { bg: "#e0e7ff", text: "#4f46e5", name: "nap" }, CLEAN: { bg: null, text: "#166534", name: "clean" }, GHOST: { bg: "#f1f5f9", text: "#64748b", name: "ghost" } };
const TEXT_COLORS = { UG: "#f97316", AE: "#64748b", FIB: "#ff0000", NAP: "#6366f1", WARN: "#ef4444", MISMATCH: "#b45309", MAGIC: "#8b5cf6", BENCH: "#0f172a", DONE: "#22c55e", STAR: "#fbbf24", GHOST: "#64748b" };

function logMsg(msg) { const ss = SpreadsheetApp.getActiveSpreadsheet(); let sh = ss.getSheetByName(LOG_SHEET); if (!sh) sh = ss.insertSheet(LOG_SHEET); if (sh.getLastRow() === 0) { sh.appendRow(["Timestamp", "Message Summary"]); sh.getRange("1:1").setBackground("#003366").setFontColor("white").setFontWeight("bold"); sh.setFrozenRows(1); sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 600); } sh.appendRow([new Date(), msg]); }
function getTrueLastDataRow(sheet) { const data = sheet.getRange("C:C").getValues(); for (let i = data.length - 1; i >= 0; i--) { if (data[i][0] !== "" && data[i][0] !== null) return i + 1; } return 1; }
function ensureCapacity(sheet, requiredRows, requiredCols) { let maxRows = sheet.getMaxRows(); let maxCols = sheet.getMaxColumns(); if (maxRows < requiredRows) sheet.insertRowsAfter(maxRows, requiredRows - maxRows); if (maxCols < requiredCols) sheet.insertColumnsAfter(maxCols, requiredCols - maxCols); }
function trimAndFilterSheet(sheet, lastDataRow, lastDataCol) { let maxRows = sheet.getMaxRows(); let maxCols = sheet.getMaxColumns(); let safeRow = Math.max(lastDataRow, 2); if (maxRows > safeRow) sheet.deleteRows(safeRow + 1, maxRows - safeRow); if (maxCols > lastDataCol) sheet.deleteColumns(lastDataCol + 1, maxCols - lastDataCol); let range = sheet.getRange(1, 1, safeRow, lastDataCol); if (sheet.getFilter() !== null) sheet.getFilter().remove(); range.createFilter(); }
function isBooleanColumn(header) { return CHECKBOX_COLUMNS.includes(header.trim()); } function isNumericColumn(header) { return NUMERIC_COLUMNS.includes(header.trim()); } function isDateColumn(header) { return DATE_COLUMNS.includes(header.trim()); }
function colorizeText(richTextBuilder, text, keyword, color) { let regex = new RegExp(keyword, "gi"); let match; while ((match = regex.exec(text)) !== null) { let style = SpreadsheetApp.newTextStyle().setForegroundColor(color).setBold(true).build(); richTextBuilder.setTextStyle(match.index, match.index + match[0].length, style); } }
function colorizeLineStartingWith(richTextBuilder, text, prefix, color) { let lines = text.split('\n'); let currentIndex = 0; lines.forEach(line => { if (line.startsWith(prefix)) { let style = SpreadsheetApp.newTextStyle().setForegroundColor(color).setBold(true).build(); richTextBuilder.setTextStyle(currentIndex, currentIndex + line.length, style); } else if (line.startsWith("[Tracker] " + prefix)) { let tPrefix = "[Tracker] " + prefix; let style = SpreadsheetApp.newTextStyle().setForegroundColor(color).setBold(true).build(); richTextBuilder.setTextStyle(currentIndex + tPrefix.length, currentIndex + line.length, style); let trkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#0284c7").setBold(true).build(); richTextBuilder.setTextStyle(currentIndex, currentIndex + "[Tracker]".length, trkStyle); } currentIndex += line.length + 1; }); }
function drawProgressBar(percent) { const bars = 10; const fill = Math.round(percent * bars); return "▰".repeat(fill) + "▱".repeat(bars - fill); }
