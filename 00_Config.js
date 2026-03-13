/**
 * FILE: 00_Config.gs
 * PURPOSE: Configuration, Constants, Colors, and SHARED HELPER FUNCTIONS
 */

const ARCHIVE_FOLDER_ID   = "1EqGpR7HYlMfTezGXol2kNZ9vVvGTtP4-"; 
const INCOMING_FOLDER_ID  = "1KBFJ5SWrTgRnU5zWUmcDOZtOiTNLonRk"; 
const COMPILED_FOLDER_ID  = "1Wd9yx8VCgnAY76EIuo_dkFO4mF7yy7vN"; 
const REFERENCE_FOLDER_ID = "14_pVws2NJ7i5GCiqxTpx2RN6HHDCNjOm"; 
const VENDOR_TRACKER_ID   = "1O9PiwSxkoI6md8XEIUfohV3yY4ot5uqqO9VKU8HfEl0"; 

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

const HISTORY_HEADERS = ["Date", "Contractor", "FDH Engineering ID", "Locates Called In", "Cabinets Set", "Light to Cabinets", "Target Completion Date", "Daily UG Footage", "Total UG Footage Completed", "UG BOM Quantity", "UG Complete?", "Daily Strand Footage", "Total Strand Footage Complete?", "Strand BOM Quantity", "Strand Complete?", "Daily Fiber Footage", "Total Fiber Footage Complete", "Fiber BOM Quantity", "Fiber Complete?", "Daily NAPs/Encl. Completed", "Total NAPs Completed", "NAP/Encl. BOM Qty.", "NAPs/Encl. Complete?", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews", "Vendor Comment"];
const QB_HEADERS = ["Date", "Contractor", "FDH Engineering ID", "Locates Called In", "Cabinets Set", "Light to Cabinets", "Target Completion Date", "Daily UG Footage", "Daily Strand Footage", "Daily Fiber Footage", "Daily NAPs/Encl. Completed", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews", "Construction Comments"];
const DECK_HEADERS = [
  "Timestamp", "FDH Engineering ID", "Vendor", "Target Date",
  "Sent for Permitting", "Permit Approved", "DOT Paperwork Submitted",
  "Special Crossing Approved", "Approval Dist to Vendor", "Active Set",
  "Active Has Power", "Leg ID", "Transport Available", "How is it Fed",
  "What Does it Feed", "Island Missing Components", "OFS Changed Reason",
  "Manager Note", "QB Sync Status"
];

// 🧠 ADDED: CX Start and CX Complete
const REVIEW_EXTRA_HEADERS = ["City", "Stage", "Status", "BSLs", "Budget OFS", "CX Start", "CX Complete", "CD Intelligence", "Gemini Insight", "Gemini Insight Date"];

const ANALYTICS_QUADRANT = ["Historical Milestones", "Health Flags", "Action Required", "Field Production", "QB Context & Gaps"];

const CHECKBOX_COLUMNS = ["Locates Called In", "Cabinets Set", "Light to Cabinets", "UG Complete?", "Strand Complete?", "Fiber Complete?", "NAPs/Encl. Complete?"];
const NUMERIC_COLUMNS = ["Daily UG Footage", "Total UG Footage Completed", "UG BOM Quantity", "Daily Strand Footage", "Total Strand Footage Complete?", "Strand BOM Quantity", "Daily Fiber Footage", "Total Fiber Footage Complete", "Fiber BOM Quantity", "Daily NAPs/Encl. Completed", "Total NAPs Completed", "NAP/Encl. BOM Qty.", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews"];
const DATE_COLUMNS = ["Date", "Target Completion Date", "CX Start", "CX Complete"];

const OVERAGE_THRESHOLD = 1.05;

const ROW_THEMES = { PERMITTING: { bg: "#faf5ff", text: "#a855f7", label: "🟣 PERMITTING" }, OFS: { bg: "#eff6ff", text: "#2563eb", label: "🔵 OFS" }, COMPLETE: { bg: "#f0fdf4", text: "#22c55e", label: "🟢 COMPLETE" }, ON_HOLD: { bg: "#f8fafc", text: "#94a3b8", label: "⚪ ON HOLD" }, ACTIVE: { bg: null, text: null, label: "" } };
const BENNY_COLORS = { RED: { bg: "#fee2e2", text: "#ef4444", name: "warn" }, YELLOW: { bg: "#fef08a", text: "#b45309", name: "mismatch" }, UG: { bg: "#ffedd5", text: "#ea580c", name: "ug" }, AE: { bg: "#f1f5f9", text: "#475569", name: "ae" }, FIB: { bg: "#ffe4e6", text: "#e11d48", name: "fib" }, NAP: { bg: "#e0e7ff", text: "#4f46e5", name: "nap" }, CLEAN: { bg: null, text: "#166534", name: "clean" } };
const TEXT_COLORS = { UG: "#f97316", AE: "#64748b", FIB: "#ff0000", NAP: "#6366f1", WARN: "#ef4444", MISMATCH: "#b45309", MAGIC: "#8b5cf6", BENCH: "#0f172a", DONE: "#22c55e", STAR: "#fbbf24" };

function logMsg(msg) { const ss = SpreadsheetApp.getActiveSpreadsheet(); let sh = ss.getSheetByName(LOG_SHEET); if (!sh) sh = ss.insertSheet(LOG_SHEET); if (sh.getLastRow() === 0) { sh.appendRow(["Timestamp", "Message Summary"]); sh.getRange("1:1").setBackground("#003366").setFontColor("white").setFontWeight("bold"); sh.setFrozenRows(1); sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 600); } sh.appendRow([new Date(), msg]); }
function getTrueLastDataRow(sheet) { const data = sheet.getRange("C:C").getValues(); for (let i = data.length - 1; i >= 0; i--) { if (data[i][0] !== "" && data[i][0] !== null) return i + 1; } return 1; }
function ensureCapacity(sheet, requiredRows, requiredCols) { let maxRows = sheet.getMaxRows(); let maxCols = sheet.getMaxColumns(); if (maxRows < requiredRows) sheet.insertRowsAfter(maxRows, requiredRows - maxRows); if (maxCols < requiredCols) sheet.insertColumnsAfter(maxCols, requiredCols - maxCols); }
function trimAndFilterSheet(sheet, lastDataRow, lastDataCol) { let maxRows = sheet.getMaxRows(); let maxCols = sheet.getMaxColumns(); let safeRow = Math.max(lastDataRow, 2); if (maxRows > safeRow) sheet.deleteRows(safeRow + 1, maxRows - safeRow); if (maxCols > lastDataCol) sheet.deleteColumns(lastDataCol + 1, maxCols - lastDataCol); let range = sheet.getRange(1, 1, safeRow, lastDataCol); if (sheet.getFilter() !== null) sheet.getFilter().remove(); range.createFilter(); }
function isBooleanColumn(header) { return CHECKBOX_COLUMNS.includes(header.trim()); } function isNumericColumn(header) { return NUMERIC_COLUMNS.includes(header.trim()); } function isDateColumn(header) { return DATE_COLUMNS.includes(header.trim()); }
function colorizeText(richTextBuilder, text, keyword, color) { let regex = new RegExp(keyword, "gi"); let match; while ((match = regex.exec(text)) !== null) { let style = SpreadsheetApp.newTextStyle().setForegroundColor(color).setBold(true).build(); richTextBuilder.setTextStyle(match.index, match.index + match[0].length, style); } }
function colorizeLineStartingWith(richTextBuilder, text, prefix, color) { let lines = text.split('\n'); let currentIndex = 0; lines.forEach(line => { if (line.startsWith(prefix)) { let style = SpreadsheetApp.newTextStyle().setForegroundColor(color).setBold(true).build(); richTextBuilder.setTextStyle(currentIndex, currentIndex + line.length, style); } else if (line.startsWith("[Tracker] " + prefix)) { let tPrefix = "[Tracker] " + prefix; let style = SpreadsheetApp.newTextStyle().setForegroundColor(color).setBold(true).build(); richTextBuilder.setTextStyle(currentIndex + tPrefix.length, currentIndex + line.length, style); let trkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#0284c7").setBold(true).build(); richTextBuilder.setTextStyle(currentIndex, currentIndex + "[Tracker]".length, trkStyle); } currentIndex += line.length + 1; }); }
function drawProgressBar(percent) { const bars = 10; const fill = Math.round(percent * bars); return "▰".repeat(fill) + "▱".repeat(bars - fill); }
