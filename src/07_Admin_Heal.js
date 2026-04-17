/**
 * FILE: 07_Admin_Heal.js
 * PURPOSE: Surgical healing of the Master Archive and automated safety backups.
 */

/**
 * 🛡️ BACKUP: Exports the current Master Archive to a CSV in the Pending Upload folder.
 * Called automatically before any heal operation.
 */
function backupMasterArchiveToCSV() {
  logMsg("🛡️ STARTING: Master Archive Backup (CSV)");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  
  if (!histSheet) {
    logMsg("❌ BACKUP FAILED: History sheet not found.");
    return null;
  }

  const data = histSheet.getDataRange().getValues();
  let csvContent = "";
  
  data.forEach(row => {
    let csvRow = row.map(cell => {
      let cellStr = "";
      if (cell instanceof Date) {
        cellStr = Utilities.formatDate(cell, "GMT-5", "yyyy-MM-dd");
      } else {
        cellStr = String(cell || "");
      }
      // Escape commas and quotes
      return (cellStr.includes(",") || cellStr.includes("\"") || cellStr.includes("\n")) 
        ? `"${cellStr.replace(/"/g, '""')}"` 
        : cellStr;
    });
    csvContent += csvRow.join(",") + "\n";
  });

  const timestamp = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd_HH-mm");
  const fileName = `BACKUP_Master_Archive_${timestamp}.csv`;
  const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  const file = folder.createFile(fileName, csvContent, MimeType.CSV);
  
  logMsg(`✅ BACKUP COMPLETE: ${fileName} saved to 00_Backups.`);
  return file.getUrl();
}

/**
 * 🛠️ SURGICAL HEAL: Fixes alignment issues in the Master Archive caused by column insertions.
 * Identifies rows where data was shifted 4 columns to the RIGHT and pulls them LEFT to align with the intended layout.
 */
function healMasterArchiveAlignment() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert("🛠️ HEAL MASTER ARCHIVE", "This will shift data in misaligned rows 4 columns to the LEFT to restore Daily UG Footage to column H.\n\nThe 4 extra columns (BSLs, OFS, CX) will be moved to the end of the sheet.\n\nA CSV backup will be created first.\n\nProceed?", ui.ButtonSet.YES_NO);
  
  if (response !== ui.Button.YES) return;

  // 1. Mandatory Backup
  backupMasterArchiveToCSV();

  logMsg("🛠️ STARTING: Master Archive Alignment Healing...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(HISTORY_SHEET);
  const data = sh.getDataRange().getValues();
  
  let healCount = 0;
  let newRows = [HISTORY_HEADERS]; // Use the fresh headers from Config

  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    
    // 🔍 ROBUST HEURISTIC: 
    // Bad rows have the "Vendor Comment" shifted from index 28 to index 32.
    // And index 7-10 (where UG should be) contain BSL strings or are empty.
    
    let colHVal = row[7];  // Expected: UG | Actual in broken: BSL
    let colLVal = row[11]; // Expected: Daily AE | Actual in broken: UG
    let colACVal = String(row[28] || ""); // Expected: Comment | Actual in broken: Total NAPs (Numeric)
    let colAGVal = String(row[32] || ""); // Expected: CX Complete | Actual in broken: Comment (Long String)

    let isMisaligned = false;
    
    // Signal 1: The comment is at index 32 instead of 28
    // (Comments are usually long strings, whereas CX Complete is a date or empty)
    const isComment = (val) => val.length > 5 && !val.includes("/") && isNaN(Date.parse(val));
    const isNumeric = (val) => val !== "" && !isNaN(Number(val));

    if (isComment(colAGVal) && (colACVal === "" || isNumeric(colACVal))) {
      isMisaligned = true;
    } 
    // Signal 2: Column H is empty/BSL while Column L has footage
    else if ((colHVal === "" || isNaN(Number(colHVal))) && isNumeric(colLVal)) {
      isMisaligned = true;
    }
    // Signal 3: Row has data at index 32 but indices 7-10 are curiously empty
    else if (colAGVal !== "" && [7,8,9,10].every(idx => row[idx] === "")) {
      isMisaligned = true;
    }

    if (isMisaligned) {
      let healedRow = new Array(HISTORY_HEADERS.length).fill("");
      
      // 1. Copy first 7 columns (0-6: Date, Contractor, ID, Locates, Cabinets, Light, Target Date)
      for (let j = 0; j < 7; j++) healedRow[j] = row[j];

      // 2. Capture the BSLs/OFS/CX data that was at 7, 8, 9, 10
      let bsls = row[7];
      let ofs  = row[8];
      let cxs  = row[9];
      let cxe  = row[10];

      // 3. Shift the rest of the data (from index 11 to 32) LEFT by 4 columns (to index 7-28)
      // Original 11 (Daily UG) -> 7
      // ...
      // Original 32 (Vendor Comment) -> 28
      for (let j = 11; j <= 32; j++) {
        if (j < row.length) {
          healedRow[j - 4] = row[j];
        }
      }

      // 4. Place the captured BSLs/OFS/CX data at the NEW end of the row (indices 29, 30, 31, 32)
      healedRow[29] = bsls;
      healedRow[30] = ofs;
      healedRow[31] = cxs;
      healedRow[32] = cxe;

      newRows.push(healedRow);
      healCount++;
    } else {
      // If not misaligned, ensure it matches the new length
      let existingRow = [...row];
      while (existingRow.length < HISTORY_HEADERS.length) existingRow.push("");
      newRows.push(existingRow.slice(0, HISTORY_HEADERS.length));
    }
  }

  if (healCount > 0) {
    sh.clear();
    sh.getRange(1, 1, newRows.length, HISTORY_HEADERS.length).setValues(newRows);
    SpreadsheetApp.flush();
    logMsg(`✅ HEAL COMPLETE: ${healCount} rows were realigned.`);
    ui.alert("✅ HEAL COMPLETE", `${healCount} rows were successfully realigned.\n\nA backup CSV was saved to the Pending Upload folder.`, ui.ButtonSet.OK);
  } else {
    logMsg("ℹ️ HEAL SKIPPED: No misaligned rows detected.");
    ui.alert("ℹ️ HEAL SKIPPED", "No misaligned rows were detected in the Master Archive.", ui.ButtonSet.OK);
  }
}

/**
 * 🔍 AUDIT TOOL: Compares the Master Archive against a backup CSV to verify alignment.
 * Run this manually from the script editor if you have the CSV File ID.
 */
function auditArchiveAgainstBackup(fileId) {
  if (!fileId) {
    Logger.log("Please provide a File ID.");
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(HISTORY_SHEET);
  const currentData = sh.getDataRange().getValues();
  
  const file = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();
  let backupData = [];

  if (mimeType === MimeType.GOOGLE_SHEETS) {
    // 📊 Handle Google Sheet backup
    const backupSS = SpreadsheetApp.openById(fileId);
    const backupSh = backupSS.getSheets()[0]; // Assume first sheet
    backupData = backupSh.getDataRange().getValues();
    Logger.log(`Targeting Google Sheet: ${file.getName()}`);
  } else {
    // 📄 Handle CSV backup
    const csvContent = file.getBlob().getDataAsString();
    const lines = csvContent.split(/\r?\n/);
    backupData = lines.map(line => {
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      return matches ? matches.map(m => m.replace(/^"|"$/g, "").trim()) : [];
    });
    Logger.log(`Targeting CSV File: ${file.getName()}`);
  }
  
  Logger.log(`Starting Audit: ${currentData.length} current rows vs ${backupData.length} backup rows.`);
  
  let mismatches = 0;
  let logLimit = 30;
  let logged = 0;

  const backupMap = new Map();
  backupData.forEach(bak => {
    if (bak.length < 3) return;
    // Keys in backup are either Date objects or Date strings
    let bDate = bak[0];
    let fmtBDate = (bDate instanceof Date) ? Utilities.formatDate(bDate, "GMT-5", "yyyy-MM-dd") : String(bDate).split("T")[0];
    let key = fmtBDate.trim() + "_" + String(bak[2]).trim();
    backupMap.set(key, bak);
  });

  currentData.forEach((cur, i) => {
    if (i === 0) return; 

    let fmtDate = (d) => (d instanceof Date) ? Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd") : String(d).split("T")[0];
    let curKey = fmtDate(cur[0]) + "_" + String(cur[2]).trim();
    
    if (!backupMap.has(curKey)) {
        if (logged < logLimit) {
            Logger.log(`Row ${i+1}: Key [${curKey}] not found in backup.`);
            logged++;
        }
        mismatches++;
        return;
    }

    let bak = backupMap.get(curKey);
    
    // Check if UG Footage matches
    let curUG = Number(cur[7]) || 0;
    let bakUG_Shifted = Number(bak[11]) || 0; // The bad position
    let bakUG_Normal = Number(bak[7]) || 0;   // The original position
    
    if (curUG !== bakUG_Normal && curUG !== bakUG_Shifted) {
      if (logged < logLimit) {
        Logger.log(`🚩 Row ${i+1} [${curKey}]: UG Footage Mismatch!
           Current Col H: [${curUG}]
           Backup Col H:  [${bakUG_Normal}]
           Backup Col L:  [${bakUG_Shifted}]`);
        logged++;
      }
      mismatches++;
    }
  });
  
  Logger.log(`Audit Finished: Found ${mismatches} issues.`);
  return mismatches;
}

/**
 * 🛠️ UI PROMPT: Triggers the audit tool with a user-provided File ID or latest from backup folder.
 */
function promptAuditArchive() {
  const ui = SpreadsheetApp.getUi();
  
  // 1. Check backup folder for most recent file
  let latestFile = null;
  try {
    const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    const files = folder.getFiles();
    let newestDate = 0;
    while (files.hasNext()) {
      let file = files.next();
      if (file.getName().includes("BACKUP_Master_Archive") && file.getLastUpdated().getTime() > newestDate) {
        newestDate = file.getLastUpdated().getTime();
        latestFile = file;
      }
    }
  } catch (e) {
    logMsg("WARN", "promptAuditArchive", "Could not scan backup folder: " + e.message);
  }

  let promptMsg = "Enter a Backup File ID (CSV or Google Sheet) to compare against the current Master Archive.";
  if (latestFile) {
    promptMsg += `\n\nLatest Backup Found:\n${latestFile.getName()}\nID: ${latestFile.getId()}\n\nLeave blank to use the latest found above.`;
  }

  const response = ui.prompt("🔍 AUDIT MASTER ARCHIVE", promptMsg, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  let fileId = response.getResponseText().trim();
  if (fileId === "" && latestFile) {
    fileId = latestFile.getId();
  }

  if (fileId === "") {
    ui.alert("❌ No File ID provided and no automatic backup found.");
    return;
  }

  ui.showModelessDialog(HtmlService.createHtmlOutput("<p>Audit in progress... check the Execution Log (Cmd+Enter) for details.</p>").setHeight(100).setWidth(300), "🔍 Audit Started");
  
  try {
    const mismatches = auditArchiveAgainstBackup(fileId);
    if (mismatches === 0) {
      ui.alert("✅ AUDIT SUCCESS", "No alignment issues found! The current archive matches the backup perfectly.", ui.ButtonSet.OK);
    } else {
      ui.alert("🚩 AUDIT COMPLETE", `Found ${mismatches} potential alignment issues. Please check the Execution Log (Cmd+Enter) for details.`, ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert("❌ AUDIT FAILED", e.message, ui.ButtonSet.OK);
  }
}

/**
 * 🔍 VERIFICATION AUDIT: Compares the Master Archive against your specific backup.
 * Run this from the GAS Editor to see the results in the log.
 */
function runSpecificVerificationAudit() {
  const backupId = "1TZXT-XQfxDQGlLqPDQVV-5UFEpz94HUHAAk6AepJnEo";
  
  const file = DriveApp.getFileById(backupId);
  const csvContent = file.getBlob().getDataAsString();
  const lines = csvContent.split(/\r?\n/);
  Logger.log("--- BACKUP SAMPLE (First 5 lines) ---");
  lines.slice(0, 5).forEach((line, i) => Logger.log(`Line ${i+1}: ${line}`));
  Logger.log("-------------------------------------");

  auditArchiveAgainstBackup(backupId);
}