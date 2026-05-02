/**
 * scripts/validate-reconciliation-engine.js
 * Validates the ReconciliationEngine's ability to detect Stage/Status mismatches and CX date drift.
 */

const fs = require('fs');
const path = require('path');

// Mocking the GAS environment
const Utilities = {
  formatDate: (d, tz, fmt) => {
    if (!d) return "";
    const pad = (n) => String(n).padStart(2, '0');
    if (fmt === "MM/dd/yy") return `${pad(d.getMonth()+1)}/${pad(d.getDate())}/${String(d.getFullYear()).substring(2)}`;
    if (fmt === "yyyy-MM-dd") return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    return d.toISOString();
  }
};

const TEXT_COLORS = { 
  WARN: "#ef4444", 
  MISMATCH: "#b45309", 
  MAGIC: "#8b5cf6", 
  DONE: "#22c55e",
  GHOST: "#64748b"
};

const HISTORY_HEADERS = ["Date", "Contractor", "FDH Engineering ID", "Locates Called In", "Cabinets Set", "Light to Cabinets", "Target Completion Date", "Daily UG Footage", "Total UG Footage Completed", "UG BOM Quantity", "UG Complete?", "Daily Strand Footage", "Total Strand Footage Complete?", "Strand BOM Quantity", "Strand Complete?", "Daily Fiber Footage", "Total Fiber Footage Complete", "Fiber BOM Quantity", "Fiber Complete?", "Daily NAPs/Encl. Completed", "Total NAPs Completed", "NAP/Encl. BOM Qty.", "NAPs/Encl. Complete?", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews", "Vendor Comment", "BSLs", "Budget OFS", "CX Start", "CX Complete"];

function createSchemaAdapter(headers) {
  const headerMap = {};
  headers.forEach((h, i) => headerMap[h] = i);
  return {
    getIdx: (name) => {
        if (name === "DATE") return headerMap["Date"];
        if (name === "FDH") return headerMap["FDH Engineering ID"];
        if (name === "COMMENT") return headerMap["Vendor Comment"];
        if (name === "DAILY_UG") return headerMap["Daily UG Footage"];
        if (name === "DAILY_AE") return headerMap["Daily Strand Footage"];
        if (name === "DAILY_FIB") return headerMap["Daily Fiber Footage"];
        if (name === "DAILY_NAP") return headerMap["Daily NAPs/Encl. Completed"];
        if (name === "CX_START") return headerMap["CX Start"];
        if (name === "CX_COMPLETE") return headerMap["CX Complete"];
        return headerMap[name] !== undefined ? headerMap[name] : -1;
    }
  };
}

// Load the engine
const engineSource = fs.readFileSync(path.join(__dirname, '../src/01_Engine_Reconciliation.js'), 'utf8');

// We need to strip the "const ReconciliationEngine = (function() {" and "})();" 
// or just eval it in a context where it becomes available.
let ReconciliationEngine;
const context = { 
  Utilities, 
  TEXT_COLORS, 
  HISTORY_HEADERS,
  resolveMissingReferenceState: (ctx) => ({ stage: "Field CX", status: "Construction", flag: "INFERRED STATE", note: "Mocked Inference" }),
  getRecentInferenceSignals: () => ({ hasRecentActivity: false }),
  _normalizeFdhId: (id) => id,
  _normalizeVendor: (v) => v
};

const factory = new Function('context', 'const { Utilities, TEXT_COLORS, HISTORY_HEADERS, resolveMissingReferenceState, getRecentInferenceSignals, _normalizeFdhId, _normalizeVendor } = context;' + engineSource + '; return ReconciliationEngine;');
ReconciliationEngine = factory(context);

function testReconciliation() {
  const adapter = createSchemaAdapter(HISTORY_HEADERS);
  const row = new Array(HISTORY_HEADERS.length).fill("");
  row[adapter.getIdx("Date")] = new Date("2026-05-02");
  row[adapter.getIdx("FDH")] = "TST01-F01";
  
  const metrics = {
    dailyUG: 100,
    totalUG: 100,
    bomUG: 500,
    dailyAE: 0, totalAE: 0, bomAE: 0,
    dailyFIB: 0, totalFIB: 0, bomFIB: 0,
    dailyNAP: 0, totalNAP: 0, bomNAP: 0
  };

  // Case 1: Stage Mismatch (Activity in Permitting)
  const refData1 = {
    stage: "Permitting",
    status: "Permitting",
    ugBOM: 500
  };
  const res1 = ReconciliationEngine.reconcile(row, adapter, refData1, metrics, { fdhId: "TST01-F01", rowState: "ACTIVE" });
  console.log("Test 1 (Stage Mismatch):", res1.flags.includes("STAGE MISMATCH") ? "PASS" : "FAIL");

  // Case 2: BOM Overrun
  const metrics2 = { ...metrics, totalUG: 600 };
  const res2 = ReconciliationEngine.reconcile(row, adapter, refData1, metrics2, { fdhId: "TST01-F01", rowState: "ACTIVE" });
  console.log("Test 2 (BOM Overrun):", res2.flags.includes("BOM OVERRUN") ? "PASS" : "FAIL");

  // Case 3: Invalid Date Chronology
  row[adapter.getIdx("CX Start")] = new Date("2026-06-01");
  row[adapter.getIdx("CX Complete")] = new Date("2026-05-01");
  const res3 = ReconciliationEngine.reconcile(row, adapter, refData1, metrics, { fdhId: "TST01-F01", rowState: "ACTIVE" });
  console.log("Test 3 (Chronology Error):", res3.flags.includes("INVALID DATE CHRONOLOGY") ? "PASS" : "FAIL");
  if (!res3.flags.includes("INVALID DATE CHRONOLOGY")) console.log("  Flags found:", res3.flags);

  // Case 4: Missing BOM (Both QB and Vendor report 0 BOM, but activity exists)
  const refData4 = { stage: "Field CX", status: "Construction", ugBOM: 0, aeBOM: 0, fibBOM: 0, napBOM: 0 };
  const metrics4 = { ...metrics, bomUG: 0 };
  const res4 = ReconciliationEngine.reconcile(row, adapter, refData4, metrics4, { fdhId: "TST01-F01", rowState: "ACTIVE" });
  console.log("Test 4 (Missing BOM):", res4.flags.includes("MISSING BOM") ? "PASS" : "FAIL");
  if (!res4.flags.includes("MISSING BOM")) console.log("  Flags found:", res4.flags);
}

testReconciliation();
