/**
 * FILE: 01_Engine.gs
 * PURPOSE: Logic for File Parsing, Fuzzy Matching, Data Retrieval, and Diagnostics.
 */

// --- 1. DATA DICTIONARIES ---

function importReferenceData() {
  const folder = DriveApp.getFolderById(REFERENCE_FOLDER_ID);
  const files = folder.searchFiles('mimeType = "text/csv"');
  let newestFile = null, newestDate = new Date(0);
  while (files.hasNext()) {
    let file = files.next();
    if (file.getDateCreated() > newestDate) { newestDate = file.getDateCreated(); newestFile = file; }
  }
  if (!newestFile) return SpreadsheetApp.getUi().alert("No CSV files found in the Reference Data folder.");

  let csvData = Utilities.parseCsv(newestFile.getBlob().getDataAsString());
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let refSheet = ss.getSheetByName(REF_SHEET);
  if (!refSheet) refSheet = ss.insertSheet(REF_SHEET); else refSheet.clear();

  ensureCapacity(refSheet, csvData.length, csvData[0].length);
  refSheet.getRange(1, 1, csvData.length, csvData[0].length).setValues(csvData);
  refSheet.getRange(1, 1, 1, csvData[0].length).setBackground("#003366").setFontColor("white").setFontWeight("bold");
  refSheet.setFrozenRows(1);
  trimAndFilterSheet(refSheet, csvData.length, csvData[0].length);
  SpreadsheetApp.getUi().alert(`✅ Successfully imported Reference Data: \n${newestFile.getName()}`);
}

function getReferenceDictionary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const refSheet = ss.getSheetByName(REF_SHEET);
  let refDict = {};
  
  // 🧠 ENHANCED PERSISTENT ADMIN LOGS
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if (!adminSheet) {
    adminSheet = ss.insertSheet("Admin_Logs");
    adminSheet.appendRow(["FDH Engineering ID", "Last Checked Date", "Status Sync Date"]);
    adminSheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
    adminSheet.setFrozenRows(1);
    adminSheet.hideSheet();
  }
  // Ensure 3 columns exist for older sheets
  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");

  let adminData = adminSheet.getDataRange().getValues();
  let adminDict = {};
  for (let i = 1; i < adminData.length; i++) {
      let fdhKey = adminData[i][0].toString().trim().toUpperCase();
      if (fdhKey) adminDict[fdhKey] = {
          xingDate: adminData[i][1],
          statusDate: adminData[i][2]
      };
  }

  if (refSheet && refSheet.getLastRow() > 1) {
    let refHeaders = refSheet.getRange(1, 1, 1, refSheet.getLastColumn()).getValues()[0];
    let fdhIdx = refHeaders.findIndex(h => h.toString().toUpperCase().includes("FDH")); 
    
    let getIdx = (name) => refHeaders.findIndex(h => h.toString().trim().toUpperCase() === name.toUpperCase());
    let cityIdx = getIdx("City"), stageIdx = getIdx("Stage"), statusIdx = getIdx("Status"), bslIdx = getIdx("HHPs"); 
    let ofsIdx = getIdx("Forecasted OFS");
    let cxStartIdx = getIdx("CX Start"), cxEndIdx = getIdx("CX Complete");
    let bomUGIdx = getIdx("UG BOM Qty."), bomAEIdx = getIdx("AE BOM Qty."), bomFIBIdx = getIdx("Fiber BOM Qty."), bomNAPIdx = getIdx("NAPs BOM Qty.");
    let sowIdx = getIdx("SOW sent"), bomPoIdx = getIdx("BOM & PO sent"), cdIdx = getIdx("CD Distributed"), specXIdx = getIdx("Special Crossings?");

    const isChecked = (val) => ["true", "1", "yes", "checked"].includes(val.toString().toLowerCase().trim());
    const safeDate = (val) => {
        if (!val) return "";
        if (val instanceof Date) return Utilities.formatDate(val, "GMT-5", "MM/dd/yyyy");
        let d = new Date(val);
        if (!isNaN(d.getTime())) return Utilities.formatDate(d, "GMT-5", "MM/dd/yyyy");
        return String(val).trim();
    };

    if (fdhIdx > -1) {
      let refData = refSheet.getRange(2, 1, refSheet.getLastRow() - 1, refSheet.getLastColumn()).getValues();
      refData.forEach(r => {
         let f = r[fdhIdx].toString().trim().toUpperCase();
         if (f) refDict[f] = { 
           city: cityIdx > -1 ? r[cityIdx].toString() : "-", 
           stage: stageIdx > -1 ? r[stageIdx].toString() : "-", 
           status: statusIdx > -1 ? r[statusIdx].toString() : "-", 
           bsls: bslIdx > -1 ? r[bslIdx].toString() : "-",
           forecastedOFS: ofsIdx > -1 ? safeDate(r[ofsIdx]) : "-",
           cxStart: cxStartIdx > -1 ? safeDate(r[cxStartIdx]) : "",
           cxComplete: cxEndIdx > -1 ? safeDate(r[cxEndIdx]) : "",
           ugBOM: bomUGIdx > -1 ? Number(r[bomUGIdx]) || 0 : 0, 
           aeBOM: bomAEIdx > -1 ? Number(r[bomAEIdx]) || 0 : 0,
           fibBOM: bomFIBIdx > -1 ? Number(r[bomFIBIdx]) || 0 : 0, 
           napBOM: bomNAPIdx > -1 ? Number(r[bomNAPIdx]) || 0 : 0,
           hasSOW: sowIdx > -1 ? isChecked(r[sowIdx]) : true, 
           hasBOM: bomPoIdx > -1 ? isChecked(r[bomPoIdx]) : true,
           hasCD: cdIdx > -1 ? isChecked(r[cdIdx]) : true, 
           rawSpecialX: specXIdx > -1 ? r[specXIdx].toString().trim() : "",
           // Pull both memory dates
           adminDate: adminDict[f] && adminDict[f].xingDate ? safeDate(adminDict[f].xingDate) : "",
           statusSyncDate: adminDict[f] && adminDict[f].statusDate ? safeDate(adminDict[f].statusDate) : ""
         };
      });
    }
  }
  return refDict;
}

function parseTrackerPct(val) {
    if (val === "" || val === null || val === undefined) return 0;
    if (typeof val === 'number') return val > 1 ? val / 100 : val;
    let str = String(val).trim();
    if (str === "-") return 0;
    let num = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return 0;
    if (str.includes('%')) return num / 100;
    return num > 1 ? num / 100 : num;
}

function getVendorLiveDictionary(refDict) {
  let vendorDict = {};
  let officialFDHs = refDict ? Object.keys(refDict) : [];
  try {
    let vSS = SpreadsheetApp.openById(VENDOR_TRACKER_ID);
    let sheets = vSS.getSheets(); 
    
    for (let s = 0; s < sheets.length; s++) {
      let vSheet = sheets[s];
      let sheetName = vSheet.getName().toUpperCase().trim();
      let vData = vSheet.getDataRange().getValues();
      if (vData.length < 2) continue;
      
      let headers = [];
      let headerRowIdx = -1;
      for(let i=0; i<Math.min(10, vData.length); i++){
        if (vData[i].map(h => h.toString().trim().toUpperCase()).includes("FDH")) { 
            headerRowIdx = i; 
            headers = vData[i].map(h => h.toString().trim()); 
            break; 
        }
      }
      if (headerRowIdx === -1) continue;
      
      let fdhIdx = headers.findIndex(h => h.toUpperCase() === "FDH");
      let ugStart = headers.findIndex(h => h.toUpperCase().includes("UNDERGROUND"));
      let ugPctIdx = ugStart > -1 ? headers.indexOf("% Com.", ugStart) : -1;
      let aeStart = headers.findIndex(h => h.toUpperCase().includes("AERIAL"));
      let aePctIdx = aeStart > -1 ? headers.indexOf("% Com.", aeStart) : -1;
      let fibStart = headers.findIndex(h => h.toUpperCase().includes("FIBER PLACEMENT"));
      let fibPctIdx = fibStart > -1 ? headers.indexOf("% Com.", fibStart) : -1;
      let napStart = headers.findIndex(h => h.toUpperCase().includes("SPLICING"));
      let napPctIdx = napStart > -1 ? headers.indexOf("% Com.", napStart) : -1;
      let notesIdx = headers.findIndex(h => h.toUpperCase() === "NOTES");

      for (let i = headerRowIdx + 1; i < vData.length; i++) {
         let rawFdh = vData[i][fdhIdx] ? vData[i][fdhIdx].toString().trim().toUpperCase() : "";
         if (!rawFdh) continue;
         let finalFdh = rawFdh;
         let matched = attemptFuzzyMatch(rawFdh, officialFDHs);
         if (matched) finalFdh = matched;
         else if (officialFDHs.length > 0) {
             let fMatch = rawFdh.match(/F0*(\d+)/i);
             if (fMatch) {
                 let fNum = fMatch[1];
                 let candidates = officialFDHs.filter(k => k.match(new RegExp(`F0*${fNum}$`)));
                 for (let c of candidates) {
                     let cCity = (refDict[c].city || "").toUpperCase().trim();
                     if (cCity && cCity !== "-" && sheetName.includes(cCity)) { finalFdh = c; break; }
                 }
             }
         }
         
         vendorDict[finalFdh] = { 
             ugPct: ugPctIdx > -1 ? parseTrackerPct(vData[i][ugPctIdx]) : 0,
             aePct: aePctIdx > -1 ? parseTrackerPct(vData[i][aePctIdx]) : 0,
             fibPct: fibPctIdx > -1 ? parseTrackerPct(vData[i][fibPctIdx]) : 0,
             napPct: napPctIdx > -1 ? parseTrackerPct(vData[i][napPctIdx]) : 0,
             notes: notesIdx > -1 ? vData[i][notesIdx].toString().trim() : ""
         };
      }
    }
    logMsg(`📉 Vendor Tracker Coverage: Successfully matched ${Object.keys(vendorDict).length} projects.`);
  } catch (e) { logMsg(`⚠️ Vendor Tracker Error: ${e.toString()}`); }
  return vendorDict;
}

// --- 2. LOGIC & MATCHING ---

function attemptFuzzyMatch(badId, officialKeys) {
  let match = badId.match(/^([A-Z]{3}).*?F0*(\d+)/i);
  if (!match) return null;
  let market = match[1].toUpperCase();
  let fNumInt = match[2]; 
  let candidates = officialKeys.filter(dbKey => {
      let dbMatch = dbKey.match(/^([A-Z]{3}).*?F0*(\d+)/i);
      if (dbMatch) return dbMatch[1].toUpperCase() === market && dbMatch[2] === fNumInt;
      return false;
  });
  if (candidates.length === 1) return candidates[0]; 
  return null;
}

// --- 🧠 MASTER ARCHIVE DEDUPLICATION ENGINE ---
function getExistingKeys() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  let keys = new Set();
  
  if (!histSheet || histSheet.getLastRow() < 2) return keys;
  
  let data = histSheet.getDataRange().getValues();
  let fdhIdx = HISTORY_HEADERS.indexOf("FDH Engineering ID");
  let dateIdx = HISTORY_HEADERS.indexOf("Date");
  
  if (fdhIdx === -1 || dateIdx === -1) return keys;
  
  for (let i = 1; i < data.length; i++) {
     let d = data[i][dateIdx];
     let f = data[i][fdhIdx] ? data[i][fdhIdx].toString().trim().toUpperCase() : "";
     if (!f) continue;
     
     let dStr = "";
     if (d instanceof Date) {
         dStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd");
     } else {
         let tempD = new Date(d);
         if (!isNaN(tempD.getTime())) dStr = Utilities.formatDate(tempD, "GMT-5", "yyyy-MM-dd");
         else dStr = String(d).trim();
     }
     keys.add(dStr + "_" + f);
  }
  return keys;
}

function processIncomingForQuickBase(isSilent = false) {
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  
  // 🧠 Smart Failsafe: If the archive was manually emptied, force re-process!
  let forceReprocess = getTrueLastDataRow(histSheet) < 2; 

  const keys = getExistingKeys(); 
  const refDict = getReferenceDictionary(); 
  let newRowsAppended = []; 
  let allProcessedDates = []; 
  
  processFolderRecursive(DriveApp.getFolderById(INCOMING_FOLDER_ID), keys, refDict, "", false, newRowsAppended, allProcessedDates, forceReprocess);
  
  // 🧠 Pass ALL unique dates found in the batch to the QuickBase tab
  if (allProcessedDates.length > 0) {
     let uniqueDates = [...new Set(allProcessedDates)].filter(d => d !== "");
     populateQuickBaseTabCore(uniqueDates);
  }

  if (!isSilent) {
      let uniqueCount = [...new Set(allProcessedDates)].filter(d => d !== "").length;
      SpreadsheetApp.getUi().alert(`Done scanning.\n\nFiltered duplicates and appended ${newRowsAppended.length} new rows to the Archive.\nQuickBase Upload tab refreshed with data from ${uniqueCount} day(s).`);
  }
}

function processFolderRecursive(folder, existingKeys, refDict, folderDate, isArchive, newRowsAppended = null, allProcessedDates = null, forceReprocess = false) {
  let dateMatch = folder.getName().match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})/);
  if (dateMatch) { 
    let yr = dateMatch[3].length === 2 ? "20" + dateMatch[3] : dateMatch[3];
    folderDate = `${yr}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
  }
  const files = folder.getFiles();
  while (files.hasNext()) {
    let file = files.next();
    if (!file.getName().toLowerCase().endsWith(".xlsx")) continue;
    
    // 🧠 ALWAYS extract the date for the QB Tab, even if we skip parsing!
    let fDate = folderDate;
    let fileDateMatch = file.getName().match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})/);
    if (fileDateMatch) { 
        let yr = fileDateMatch[3].length === 2 ? "20" + fileDateMatch[3] : fileDateMatch[3]; 
        fDate = `${yr}-${fileDateMatch[1].padStart(2, '0')}-${fileDateMatch[2].padStart(2, '0')}`; 
    }
    if (fDate && allProcessedDates !== null) allProcessedDates.push(fDate);

    // 🧠 Skip processed files UNLESS the archive was emptied
    if (!forceReprocess && file.getDescription() === "PROCESSED") continue;
    
    try { 
        parseFileToRows(file, existingKeys, refDict, folderDate, newRowsAppended, allProcessedDates); 
        file.setDescription("PROCESSED"); 
    } catch (e) {
        logMsg(`Failed to process file ${file.getName()}: ${e.message}`);
    }
  }
  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) processFolderRecursive(subfolders.next(), existingKeys, refDict, folderDate, isArchive, newRowsAppended, allProcessedDates, forceReprocess);
}

function parseFileToRows(file, existingKeys, refDict, folderDate, newRowsAppended, allProcessedDates) {
  let tempFile = Drive.Files.insert({ title: "[TEMP]_" + file.getName(), parents: [{id: file.getParents().next().getId()}] }, file.getBlob(), {convert: true});
  let tempSS = SpreadsheetApp.openById(tempFile.id);
  let reportTab = tempSS.getSheetByName("Daily Report") || tempSS.getSheets()[0];
  const fullData = reportTab.getDataRange().getValues();
  
  if (fullData.length < 2) { Drive.Files.remove(tempFile.id); return; }
  
  let headerRowIndex = 0, fileHeaders = [], fdhIdx = -1;
  for (let i = 0; i < Math.min(5, fullData.length); i++) {
    let tempHeaders = fullData[i].map(h => h.toString().trim().toLowerCase());
    let foundIdx = tempHeaders.findIndex(h => h.includes("fdh") || h.includes("engineering id"));
    if (foundIdx !== -1) { headerRowIndex = i; fileHeaders = tempHeaders; fdhIdx = foundIdx; break; }
  }
  if (fdhIdx === -1) { Drive.Files.remove(tempFile.id); return; }

  const getIdx = (name) => {
    let n = name.toLowerCase().trim();
    let exact = fileHeaders.indexOf(n);
    if (exact !== -1) return exact;
    if (n === "date") return fileHeaders.findIndex(h => h === "date" || h === "report date" || h === "daily date");
    if (n.includes("ug complete")) return fileHeaders.findIndex(fh => fh.includes("ug") && fh.includes("complete"));
    if (n.includes("strand complete")) return fileHeaders.findIndex(fh => fh.includes("strand") && fh.includes("complete"));
    if (n.includes("fiber complete")) return fileHeaders.findIndex(fh => fh.includes("fiber") && fh.includes("complete"));
    if (n === "vendor comment") return fileHeaders.findIndex(fh => fh.includes("comment") || fh.includes("note"));
    return -1;
  };

  const rows = fullData.slice(headerRowIndex + 1);
  let lastValidDate = folderDate, dataToAppend = [];
  let fileDateMatch = file.getName().match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})/);
  let filenameDate = "";
  if (fileDateMatch) { let yr = fileDateMatch[3].length === 2 ? "20" + fileDateMatch[3] : fileDateMatch[3]; filenameDate = `${yr}-${fileDateMatch[1].padStart(2, '0')}-${fileDateMatch[2].padStart(2, '0')}`; }

  rows.forEach(row => {
    let fdhId = row[fdhIdx] ? row[fdhIdx].toString().trim().toUpperCase() : ""; 
    if (!fdhId || fdhId === "NAN" || fdhId === "0" || fdhId.includes("ID")) return;
    
    let originalFdh = fdhId;
    if (refDict && Object.keys(refDict).length > 0 && !refDict[fdhId]) {
        let matched = attemptFuzzyMatch(fdhId, Object.keys(refDict));
        if (matched) { logMsg(`🪄 AUTO-CORRECT (Ingestion): ${fdhId} -> ${matched}`); fdhId = matched; }
    }
    let wasCorrected = (originalFdh !== fdhId);
    
    let rowMapped = HISTORY_HEADERS.map(h => {
      if (h === "FDH Engineering ID") return fdhId; 
      let idx = getIdx(h);
      let val = (idx === -1) ? "" : row[idx];
      
      if (h === "Vendor Comment") { if (wasCorrected) val = `[Auto-Fixed FDH: ${originalFdh}] ` + (val || ""); return val; }
      
      if (h === "Date") {
        let parsedDateStr = "";
        if (val) {
          if (val instanceof Date) {
              parsedDateStr = Utilities.formatDate(val, "GMT-5", "yyyy-MM-dd");
          } else {
            let d = new Date(val);
            if (!isNaN(d.getTime())) {
                parsedDateStr = Utilities.formatDate(d, "GMT-5", "yyyy-MM-dd");
            } else { 
                let m = String(val).match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/); 
                if(m) { let yr = m[3].length === 2 ? "20"+m[3] : m[3]; parsedDateStr = `${yr}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; } 
            }
          }
        }
        if (parsedDateStr !== "") lastValidDate = parsedDateStr;
        else if (filenameDate !== "") lastValidDate = filenameDate;
        else if (folderDate && folderDate !== "") lastValidDate = folderDate;
        else if (!lastValidDate || lastValidDate === "") { 
            let creationDate = new Date(file.getDateCreated()); 
            if (creationDate.getDay() === 1) creationDate.setDate(creationDate.getDate() - 3); 
            else creationDate.setDate(creationDate.getDate() - 1); 
            lastValidDate = Utilities.formatDate(creationDate, "GMT-5", "yyyy-MM-dd"); 
        }
        return lastValidDate;
      }
      if (isBooleanColumn(h) && typeof val === "string") { let cleanStr = val.trim().toLowerCase(); if (cleanStr === "true" || cleanStr === "yes") return true; if (cleanStr === "false" || cleanStr === "no") return false; }
      return val;
    });
    
    if (allProcessedDates !== null && rowMapped[0]) {
        allProcessedDates.push(rowMapped[0]);
    }
    
    let key = rowMapped[0] + "_" + fdhId;
    if (!existingKeys.has(key)) { 
        dataToAppend.push(rowMapped); 
        existingKeys.add(key); 
        if (newRowsAppended !== null) newRowsAppended.push(rowMapped); 
    }
  });

  if (dataToAppend.length > 0) {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET);
    const trueLastRow = getTrueLastDataRow(sh);
    ensureCapacity(sh, trueLastRow + dataToAppend.length, HISTORY_HEADERS.length);
    sh.getRange(trueLastRow + 1, 1, dataToAppend.length, HISTORY_HEADERS.length).setValues(dataToAppend);
    SpreadsheetApp.flush(); 
  }
  Drive.Files.remove(tempFile.id);
}

// 🧠 UPGRADED TO HANDLE BATCH ARRAYS & STYLE MASTER FORMATTING
function populateQuickBaseTabCore(targetDates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  const styleSheet = ss.getSheetByName(STYLE_MASTER);
  
  let dateArr = Array.isArray(targetDates) ? targetDates : [targetDates];
  dateArr = dateArr.map(d => d.toString().trim());

  const filteredRows = histSheet.getDataRange().getValues().filter((row, idx) => {
    if (idx === 0) return false; 
    let rowDate = (row[0] instanceof Date) ? Utilities.formatDate(row[0], "GMT-5", "yyyy-MM-dd") : String(row[0]).split("T")[0].trim();
    
    let altDate = "";
    try { 
        let dObj = new Date(rowDate);
        if(!isNaN(dObj.getTime())) altDate = Utilities.formatDate(dObj, "GMT-5", "M/d/yyyy"); 
    } catch(e) {}
    
    return dateArr.includes(rowDate) || (altDate !== "" && dateArr.includes(altDate));
  });

  qbSheet.clear();
  qbSheet.getRange(1, 1, 1, QB_HEADERS.length).setValues([QB_HEADERS]);
  
  if (filteredRows.length > 0) {
    const qbData = filteredRows.map(row => QB_HEADERS.map(h => {
      let lookupH = h === "Construction Comments" ? "Vendor Comment" : h;
      let hIdx = HISTORY_HEADERS.indexOf(lookupH);
      let val = (hIdx > -1) ? row[hIdx] : "";
      if (lookupH === "Vendor Comment" && typeof val === "string") return val.replace(/\[Auto-Fixed FDH: .*?\]\s*/, ""); 
      return typeof val === "boolean" ? (val ? "TRUE" : "FALSE") : val;
    }));
    ensureCapacity(qbSheet, qbData.length + 1, QB_HEADERS.length);
    qbSheet.getRange(2, 1, qbData.length, QB_HEADERS.length).setValues(qbData);
  } else {
    logMsg(`⚠️ populateQuickBaseTab: No data found for dates: ${dateArr.join(", ")}`);
  }
  
  if (typeof applyFormatting === "function") {
      try { applyFormatting(qbSheet); } catch(e) {}
  } else {
      qbSheet.getRange(1, 1, 1, QB_HEADERS.length).setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
  }
  
  // 🧠 DYNAMICALLY APPLY WIDTHS FROM STYLE MASTER
  if (styleSheet && styleSheet.getLastColumn() > 0) {
    let styleHeaders = styleSheet.getRange(1, 1, 1, styleSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    QB_HEADERS.forEach((h, i) => {
       let lookupH = h === "Construction Comments" ? "Vendor Comment" : h;
       let styleIdx = styleHeaders.indexOf(h);
       if (styleIdx === -1) styleIdx = styleHeaders.indexOf(lookupH);
       if (styleIdx > -1) {
           let width = styleSheet.getColumnWidth(styleIdx + 1);
           if (width) qbSheet.setColumnWidth(i + 1, width);
       }
    });
  }
}

function exportQuickBaseCSVCore(isSilent = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qbSheet = ss.getSheetByName(QB_UPLOAD_SHEET);
  if (getTrueLastDataRow(qbSheet) < 2) return;
  const data = qbSheet.getRange(1, 1, getTrueLastDataRow(qbSheet), QB_HEADERS.length).getValues();
  let csvContent = "";
  data.forEach(row => {
    let csvRow = row.map(cell => {
      let cellStr = (cell instanceof Date) ? Utilities.formatDate(cell, "GMT-5", "MM/dd/yyyy") : cell.toString();
      if (typeof cellStr === 'string') cellStr = cellStr.replace(/\[Auto-Fixed FDH: .*?\]\s*/, "");
      return (cellStr.includes(",") || cellStr.includes("\"") || cellStr.includes("\n")) ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
    });
    csvContent += csvRow.join(",") + "\n";
  });
  let rawDate = data[1][0];
  let fileDate = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "GMT-5", "M.d.yy") : String(rawDate).split("T")[0].replace(/-/g, ".");
  let fileName = `Daily_Production_Report_${fileDate}.csv`;
  DriveApp.getFolderById(COMPILED_FOLDER_ID).createFile(fileName, csvContent, MimeType.CSV);
  if (!isSilent) SpreadsheetApp.getUi().alert(`✅ CSV Exported: ${fileName}`);
}

function runBennyDiagnostics(row, refDict, vendorDict) {
  let flags = [], drafts = [], summary = [], qbGaps = [], hCols = { warn: [], mismatch: [], ug: [], ae: [], fib: [], nap: [] }, flagColors = [], healedId = null;
  let fdhId = row[HISTORY_HEADERS.indexOf("FDH Engineering ID")] ? row[HISTORY_HEADERS.indexOf("FDH Engineering ID")].toString().toUpperCase().trim() : "";
  let vendorComment = row[HISTORY_HEADERS.indexOf("Vendor Comment")] ? row[HISTORY_HEADERS.indexOf("Vendor Comment")].toString().trim() : "";
  
  let dailyUG = Number(row[HISTORY_HEADERS.indexOf("Daily UG Footage")]) || 0;
  let totalUG = Number(row[HISTORY_HEADERS.indexOf("Total UG Footage Completed")]) || 0;
  let vendorBOMUG = Number(row[HISTORY_HEADERS.indexOf("UG BOM Quantity")]) || 0;
  let drills = Number(row[HISTORY_HEADERS.indexOf("Drills")]) || 0;
  
  let dailyAE = Number(row[HISTORY_HEADERS.indexOf("Daily Strand Footage")]) || 0;
  let totalAE = Number(row[HISTORY_HEADERS.indexOf("Total Strand Footage Complete?")]) || 0;
  let vendorBOMAE = Number(row[HISTORY_HEADERS.indexOf("Strand BOM Quantity")]) || 0;
  let crewsAE = Number(row[HISTORY_HEADERS.indexOf("AE Crews")]) || 0;
  
  let dailyFIB = Number(row[HISTORY_HEADERS.indexOf("Daily Fiber Footage")]) || 0;
  let totalFIB = Number(row[HISTORY_HEADERS.indexOf("Total Fiber Footage Complete")]) || 0;
  let vendorBOMFIB = Number(row[HISTORY_HEADERS.indexOf("Fiber BOM Quantity")]) || 0;
  let crewsFIB = Number(row[HISTORY_HEADERS.indexOf("Fiber Pulling Crews")]) || 0;
  
  let dailyNAP = Number(row[HISTORY_HEADERS.indexOf("Daily NAPs/Encl. Completed")]) || 0;
  let totalNAP = Number(row[HISTORY_HEADERS.indexOf("Total NAPs Completed")]) || 0;
  let vendorBOMNAP = Number(row[HISTORY_HEADERS.indexOf("NAP/Encl. BOM Qty.")]) || 0;
  let crewsNAP = Number(row[HISTORY_HEADERS.indexOf("Splicing Crews")]) || 0;
  
  let lightToCab = row[HISTORY_HEADERS.indexOf("Light to Cabinets")] === true;
  let targetDateRaw = row[HISTORY_HEADERS.indexOf("Target Completion Date")];
  let targetDate = (targetDateRaw instanceof Date) ? targetDateRaw : new Date(targetDateRaw);
  
  let origMatch = vendorComment.match(/\[Auto-Fixed FDH: (.*?)\]/);
  if (origMatch) { flags.push(`🪄 ID AUTO-CORRECTED`); flagColors.push(TEXT_COLORS.MAGIC); drafts.push(`Vendor submitted ${origMatch[1]}, auto-corrected to ${fdhId}.`); vendorComment = vendorComment.replace(/\[Auto-Fixed FDH: .*?\]\s*/, ""); }
  if (!refDict[fdhId]) {
      let softHeal = attemptFuzzyMatch(fdhId, Object.keys(refDict));
      if (softHeal) { fdhId = softHeal; healedId = softHeal; flags.push(`🪄 SOFT MATCH`); flagColors.push(TEXT_COLORS.MAGIC); drafts.push(`Archive has typo. Matched to ${softHeal}.`); }
  }
  let rowState = "ACTIVE", adaePaletteIdx = "CLEAN";
  let refData = refDict[fdhId]; 
  
  if (refData) {
    let status = refData.status.toLowerCase();
    if (status.includes("complete")) rowState = "COMPLETE"; else if (status.includes("on hold")) rowState = "ON_HOLD"; else if (refData.stage.toLowerCase().includes("ofs")) rowState = "OFS"; else if (refData.stage.toLowerCase().includes("permitting")) rowState = "PERMITTING";
    if (rowState !== "COMPLETE" && rowState !== "OFS") { qbGaps.push((refData.hasSOW ? "✅📄 SOW" : "❌📄 SOW")); qbGaps.push((refData.hasCD ? "✅💿 CD" : "❌💿 CD")); qbGaps.push((refData.hasBOM ? "✅📦 BOM" : "❌📦 BOM")); }
    if (refData.isSpecialX) qbGaps.push("⚠️ X-ING");
  }
  
  let vTracker = vendorDict[fdhId];

  const addPhaseSummary = (phaseName, daily, total, bom, trkPct) => {
      let hasDaily = daily > 0;
      let hasTracker = trkPct && trkPct > 0;
      if (hasDaily) {
          let pct = bom > 0 ? (total/bom) : 0;
          let star = pct >= 1 ? " ★" : "";
          summary.push(`${phaseName}: ${daily}' ${drawProgressBar(Math.min(1, pct))} ${Math.round(pct*100)}%${star}`);
      }
      if (hasTracker) {
          let star = trkPct >= 1 ? " ★" : "";
          summary.push(`[Tracker] ${phaseName}: ${drawProgressBar(Math.min(1, trkPct))} ${Math.round(trkPct*100)}%${star}`);
      }
  };
  
  const addNapSummary = (phaseName, daily, total, bom, trkPct) => {
      let hasDaily = daily > 0;
      let hasTracker = trkPct && trkPct > 0;
      if (hasDaily) {
          let pct = bom > 0 ? (total/bom) : 0;
          let star = pct >= 1 ? " ★" : "";
          summary.push(`${phaseName}: ${daily} ${drawProgressBar(Math.min(1, pct))} ${Math.round(pct*100)}%${star}`);
      }
      if (hasTracker) {
          let star = trkPct >= 1 ? " ★" : "";
          summary.push(`[Tracker] ${phaseName}: ${drawProgressBar(Math.min(1, trkPct))} ${Math.round(trkPct*100)}%${star}`);
      }
  };

  if (vTracker) {
     addPhaseSummary("UG", dailyUG, totalUG, vendorBOMUG, vTracker.ugPct);
     addPhaseSummary("AE", dailyAE, totalAE, vendorBOMAE, vTracker.aePct);
     addPhaseSummary("FIB", dailyFIB, totalFIB, vendorBOMFIB, vTracker.fibPct);
     addNapSummary("NAP", dailyNAP, totalNAP, vendorBOMNAP, vTracker.napPct);
  } else {
     addPhaseSummary("UG", dailyUG, totalUG, vendorBOMUG, 0);
     addPhaseSummary("AE", dailyAE, totalAE, vendorBOMAE, 0);
     addPhaseSummary("FIB", dailyFIB, totalFIB, vendorBOMFIB, 0);
     addNapSummary("NAP", dailyNAP, totalNAP, vendorBOMNAP, 0);
  }
  
  let isFormatValid = /^[A-Z]{3}\d{2,3}-F\d{2,4}$/i.test(fdhId);
  if (fdhId !== "" && !isFormatValid) { flags.push(`🖍️ FORMAT ERROR`); flagColors.push(TEXT_COLORS.WARN); hCols.warn.push("FDH Engineering ID"); } else if (fdhId !== "" && !refData) { flags.push(`🛑 NOT IN QB`); flagColors.push(TEXT_COLORS.WARN); hCols.warn.push("FDH Engineering ID"); }
  
  if (targetDate && !isNaN(targetDate.getTime()) && !lightToCab && rowState !== "COMPLETE") { let daysToTarget = Math.ceil((targetDate - new Date()) / (1000 * 60 * 60 * 24)); if (daysToTarget <= 14) { flags.push(`🚨 LIGHTING RISK`); flagColors.push(TEXT_COLORS.WARN); hCols.warn.push("Target Completion Date", "Light to Cabinets"); } }
  
  if (dailyUG > 0 && drills === 0) { flags.push("🚩 GHOST UG"); flagColors.push(TEXT_COLORS.UG); hCols.ug.push("Daily UG Footage", "Drills"); adaePaletteIdx = "UG"; }
  if (drills > 0 && (dailyUG / drills) > 800) { flags.push(`⚠️ UG PACE ANOMALY`); flagColors.push(TEXT_COLORS.UG); drafts.push(`UG Pace is ${Math.round(dailyUG/drills)}ft/drill.`); hCols.ug.push("Daily UG Footage", "Drills"); adaePaletteIdx = "UG"; }
  if (dailyAE > 0 && crewsAE === 0) { flags.push("🚩 GHOST AE"); flagColors.push(TEXT_COLORS.AE); hCols.ae.push("Daily Strand Footage", "AE Crews"); adaePaletteIdx = "AE"; }
  if (crewsAE > 0 && (dailyAE / crewsAE) > 5000) { flags.push(`⚠️ AE PACE ANOMALY`); flagColors.push(TEXT_COLORS.AE); drafts.push(`AE Pace is ${Math.round(dailyAE/crewsAE)}ft/crew.`); hCols.ae.push("Daily Strand Footage", "AE Crews"); adaePaletteIdx = "AE"; }
  if (dailyFIB > 0 && crewsFIB === 0) { flags.push("🚩 GHOST FIBER"); flagColors.push(TEXT_COLORS.FIB); hCols.fib.push("Daily Fiber Footage", "Fiber Pulling Crews"); adaePaletteIdx = "FIB"; }
  if (crewsFIB > 0 && (dailyFIB / crewsFIB) > 10000) { flags.push(`⚠️ FIBER PACE`); flagColors.push(TEXT_COLORS.FIB); drafts.push(`Fiber Pace is ${Math.round(dailyFIB/crewsFIB)}ft/crew.`); hCols.fib.push("Daily Fiber Footage", "Fiber Pulling Crews"); adaePaletteIdx = "FIB"; }
  if (dailyNAP > 0 && crewsNAP === 0) { flags.push("🚩 GHOST SPLICING"); flagColors.push(TEXT_COLORS.NAP); hCols.nap.push("Daily NAPs/Encl. Completed", "Splicing Crews"); adaePaletteIdx = "NAP"; }
  if (crewsNAP > 0 && (dailyNAP / crewsNAP) > 6) { flags.push(`⚠️ SPLICE PACE`); flagColors.push(TEXT_COLORS.NAP); drafts.push(`Splicing Pace is ${Math.round(dailyNAP/crewsNAP)} NAPs/crew.`); hCols.nap.push("Daily NAPs/Encl. Completed", "Splicing Crews"); adaePaletteIdx = "NAP"; }
  
  if (refData && rowState !== "COMPLETE") {
     const checkPhase = (name, vBom, rBom, vDaily, vTot, bomColName, totColName) => {
         if (rBom === 0 && (vBom > 0 || vDaily > 0 || vTot > 0)) {
             flags.push(`🚧 POSSIBLE REROUTE (${name})`);
             flagColors.push(TEXT_COLORS.MISMATCH);
             drafts.push(`QB shows 0 BOM for ${name}, but vendor reported activity. Verify if a reroute occurred.`);
             hCols.mismatch.push(totColName);
         } else if (rBom > 0 && vBom > 0 && vBom !== rBom) {
             flags.push(`🖍️ BOM DISCREPANCY (${name})`);
             flagColors.push(TEXT_COLORS.MISMATCH);
             hCols.mismatch.push(bomColName);
         }
         
         if (vTot > 0 && rBom > 0 && (vTot / rBom) > OVERAGE_THRESHOLD) {
             flags.push(`🛑 OVERRUN (${name})`);
             flagColors.push(TEXT_COLORS.WARN);
             hCols.warn.push(totColName, bomColName);
         }
     };
     
     checkPhase("UG", vendorBOMUG, refData.ugBOM, dailyUG, totalUG, "UG BOM Quantity", "Total UG Footage Completed");
     checkPhase("AE", vendorBOMAE, refData.aeBOM, dailyAE, totalAE, "Strand BOM Quantity", "Total Strand Footage Complete?");
     checkPhase("Fiber", vendorBOMFIB, refData.fibBOM, dailyFIB, totalFIB, "Fiber BOM Quantity", "Total Fiber Footage Complete");
     checkPhase("NAP", vendorBOMNAP, refData.napBOM, dailyNAP, totalNAP, "NAP/Encl. BOM Qty.", "Total NAPs Completed");
  }
  
  if (vTracker && rowState !== "COMPLETE") {
     const evalTrackerPhase = (phaseName, totalColName, bomVal, repTotal, trkPct) => {
        if (!trkPct || trkPct <= 0 || !bomVal || bomVal <= 0) return;
        let repPct = repTotal / bomVal;
        let diff = trkPct - repPct;

        if (diff > 0.05) { 
            flags.push(`💡 TRACKER UPDATE (${phaseName})`);
            flagColors.push(TEXT_COLORS.MAGIC); 
            drafts.push(`Tracker shows ${phaseName} higher at ${Math.round(trkPct*100)}%. Suggested: Update to match their tracker.`);
        } else if (diff < -0.15) { 
            flags.push(`🔍 TRACKER VARIANCE (${phaseName})`);
            flagColors.push(TEXT_COLORS.MISMATCH); 
            drafts.push(`Daily reports ${Math.round(repPct*100)}% ${phaseName}, but Tracker shows ${Math.round(trkPct*100)}%. Check if tracker is lagging.`);
            hCols.mismatch.push(totalColName);
        }
     };

     if (refData) {
         evalTrackerPhase("UG", "Total UG Footage Completed", refData.ugBOM, totalUG, vTracker.ugPct);
         evalTrackerPhase("AE", "Total Strand Footage Complete?", refData.aeBOM, totalAE, vTracker.aePct);
         evalTrackerPhase("FIB", "Total Fiber Footage Complete", refData.fibBOM, totalFIB, vTracker.fibPct);
         evalTrackerPhase("NAP", "Total NAPs Completed", refData.napBOM, totalNAP, vTracker.napPct);
     }
     
     if (vTracker.notes && vTracker.notes !== "") {
         let spacing = vendorComment === "" ? "" : "\n\n";
         vendorComment += spacing + `[Tracker Note]: "${vTracker.notes}"`;
     }
  }
  
  if (summary.length === 0) {
      let linkedStatus = vTracker ? "\n[📡 Tracker Linked]" : "";
      summary.push("No new production reported today." + linkedStatus);
  } else if (vTracker) {
      summary.push("\n[📡 Tracker Linked]");
  }

  if (rowState !== "ACTIVE") { flags.push(`${ROW_THEMES[rowState].label}`); flagColors.push(ROW_THEMES[rowState].text); drafts.push(`QB shows this FDH as ${refData ? refData.status : "Unknown"}.`); }

  if (hCols.warn.length > 0) adaePaletteIdx = "RED"; else if (hCols.mismatch.length > 0) adaePaletteIdx = "YELLOW";
  
  let overrides = {};
  if (refData) {
      const map = [{h: "UG BOM Quantity", dbVal: refData.ugBOM}, {h: "Strand BOM Quantity", dbVal: refData.aeBOM}, {h: "Fiber BOM Quantity", dbVal: refData.fibBOM}, {h: "NAP/Encl. BOM Qty.", dbVal: refData.napBOM}];
      map.forEach(item => {
          let vendorVal = Number(row[HISTORY_HEADERS.indexOf(item.h)]) || 0;
          if (vendorVal > 0 && vendorVal !== item.dbVal) {
              overrides[item.h] = `${vendorVal}\n(BOM: ${item.dbVal})`;
          }
      });
  }

  return { 
      rowState: rowState, adaePaletteIdx: adaePaletteIdx, flags: flags.join("\n"), 
      flagColors: flagColors, draft: drafts.join("\n"), summary: summary.join("\n").trim(), 
      gaps: qbGaps.join("  "), colors: hCols, cleanComment: vendorComment, 
      healedId: healedId, overrides: overrides 
  };
}

function generateDailyReviewCore(targetDateStr, optionalRefDict = null, isSilent = false) {
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(HISTORY_SHEET);
  const mirrorSheet = ss.getSheetByName(MIRROR_SHEET);
  const styleSheet = ss.getSheetByName(STYLE_MASTER);
  
  let refDict = optionalRefDict || getReferenceDictionary();
  let vendorDict = getVendorLiveDictionary(refDict); 
  
  const histData = histSheet.getDataRange().getValues();
  let benchmarkDict = buildBenchmarkDictionary(histData, HISTORY_HEADERS, refDict);

  let currentMirrorHeaders = mirrorSheet.getLastColumn() > 0 ? mirrorSheet.getRange(1, 1, 1, mirrorSheet.getLastColumn()).getValues()[0] : [];
  let defaultHeaders = [...HISTORY_HEADERS, ...REVIEW_EXTRA_HEADERS, ...ANALYTICS_QUADRANT, "Archive_Row"];
  let finalMirrorHeaders = defaultHeaders;
  
  if (currentMirrorHeaders.includes("FDH Engineering ID")) {
    let missingHeaders = defaultHeaders.filter(h => !currentMirrorHeaders.includes(h));
    finalMirrorHeaders = [...currentMirrorHeaders, ...missingHeaders]; 
  }
  
  let reviewData = [], highlightsData = []; 
  
  histData.forEach((row, idx) => {
    if (idx === 0) return; 
    let rowDate = (row[0] instanceof Date) ? Utilities.formatDate(row[0], "GMT-5", "yyyy-MM-dd") : String(row[0]).split("T")[0].trim();
    if (rowDate === targetDateStr || Utilities.formatDate(new Date(rowDate), "GMT-5", "M/d/yyyy") === targetDateStr) {
      let fdhId = row[HISTORY_HEADERS.indexOf("FDH Engineering ID")].toString().toUpperCase().trim();
      let diag = runBennyDiagnostics(row, refDict, vendorDict); 
      
      if (diag.flags.includes("POSSIBLE REROUTE (NAP)")) {
          diag.flags = diag.flags.replace(/POSSIBLE REROUTE \(NAP\)/g, "SCOPE DEVIATION (NAP)");
          diag.draft = diag.draft.replace(/QB shows 0 BOM for NAP, but vendor reported activity\. Verify if a reroute occurred\./g, "Vendor reported Splicing activity, but BOM shows 0 NAPs. Verify if scope was expanded.");
      }
      
      // 🧠 NEW: STRICT QB REFERENCE WORDING
      if (diag.flags.includes("NOT IN QB")) {
          diag.flags = diag.flags.replace(/NOT IN QB/g, "NOT IN QB REFERENCE");
          diag.draft = diag.draft.replace(/Not found in QuickBase/g, "Not found in QuickBase Reference Data");
      }

      if (benchmarkDict[fdhId] && benchmarkDict[fdhId].includes("Possible Reroute")) {
          benchmarkDict[fdhId] = benchmarkDict[fdhId].replace(/NAP: Pending \[Possible Reroute\]/g, "NAP: Pending [Scope Deviation]");
      }

      let refData = null;
      if (diag.healedId) { fdhId = diag.healedId; refData = refDict[fdhId]; }
      else refData = refDict[fdhId];
      
      let rowObj = {};
      HISTORY_HEADERS.forEach((h, i) => {
        if (h === "Vendor Comment") rowObj[h] = diag.cleanComment;
        else if (h === "FDH Engineering ID") rowObj[h] = fdhId;
        else if (diag.overrides && diag.overrides[h]) rowObj[h] = diag.overrides[h];
        else rowObj[h] = row[i];
      });
      
      rowObj["City"] = refData ? refData.city : "-"; 
      rowObj["Stage"] = refData ? refData.stage : "-"; 
      rowObj["Status"] = refData ? refData.status : "-"; 
      rowObj["BSLs"] = refData ? refData.bsls : "-";
      rowObj["Forecasted OFS"] = refData ? refData.forecastedOFS : "-";
      rowObj["CX Start"] = refData && refData.cxStart ? refData.cxStart : "";
      rowObj["CX Complete"] = refData && refData.cxComplete ? refData.cxComplete : "";

      const parseNum = (val) => {
          if (val === null || val === undefined || val === "") return 0;
          if (typeof val === 'number') return val;
          let match = String(val).split('(')[0].replace(/,/g, '').trim().match(/-?\d+(\.\d+)?/);
          return match ? Number(match[0]) : 0;
      };
      
      let locIdx = HISTORY_HEADERS.indexOf("Locates Called In");
      let hasLocates = locIdx > -1 && ["true", "yes", "1"].includes(String(row[locIdx]).toLowerCase().trim());
      let dUG = parseNum(row[HISTORY_HEADERS.indexOf("Daily UG Footage")]);
      let dAE = parseNum(row[HISTORY_HEADERS.indexOf("Daily Strand Footage")]);
      let dFIB = parseNum(row[HISTORY_HEADERS.indexOf("Daily Fiber Footage")]);
      let dNAP = parseNum(row[HISTORY_HEADERS.indexOf("Daily NAPs/Encl. Completed")]);
      let hasActivity = hasLocates || dUG > 0 || dAE > 0 || dFIB > 0 || dNAP > 0;

      let adminGapsStr = diag.gaps; 
      if (refData) {
          let xingVal = (refData.rawSpecialX || "").toString().trim().toLowerCase();
          let xingString = "🚨 X-ING UNCHECKED"; 
          if (xingVal === "yes" || xingVal === "true") xingString = "⚠️ X-ING YES";
          else if (xingVal === "no" || xingVal === "false") xingString = "✅ X-ING CLEAR";
          
          let hasBeenChecked = refData.adminDate && refData.adminDate !== "";
          
          if (xingVal === "" && !hasBeenChecked) {
              if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n🚩 ADMIN: CHECK CROSSINGS";
              else diag.flags = "🚩 ADMIN: CHECK CROSSINGS";
              diag.flagColors.push("#991b1b"); 
          }

          let adminDateStr = hasBeenChecked ? `[Chk: ${refData.adminDate}]` : `[Chk: NEVER]`;
          adminGapsStr = `${adminDateStr}  |  ${refData.hasSOW ? "✅ SOW" : "❌ SOW"}  ${refData.hasCD ? "✅ CD" : "❌ CD"}  ${refData.hasBOM ? "✅ BOM" : "❌ BOM"}  |  ${xingString}`;
          
          let stageStr = (refData.stage || "").toUpperCase().trim();
          let statusStr = (refData.status || "").toUpperCase().trim();
          let isFieldCx = stageStr.includes("FIELD CX") || stageStr.includes("OFS") || statusStr.includes("COMPLETE");

          if (stageStr === "" || stageStr === "-" || statusStr === "" || statusStr === "-") {
              if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n🚩 MISSING QB STATUS";
              else diag.flags = "🚩 MISSING QB STATUS";
              diag.flagColors.push("#991b1b"); 
              diag.draft = `Project is missing Stage or Status in QB. Please update QuickBase.`;
          } 
          else if (hasActivity && !isFieldCx) {
              let todayStr = Utilities.formatDate(new Date(), "GMT-5", "MM/dd/yyyy");
              let hasSyncedToday = refData.statusSyncDate === todayStr;

              if (hasSyncedToday) {
                  if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n⚠️ ADMIN: REFRESH REF DATA";
                  else diag.flags = "⚠️ ADMIN: REFRESH REF DATA";
                  diag.flagColors.push("#b45309"); 
                  diag.draft = `QB marked as updated on ${todayStr}. Import new Reference Data to clear this flag.`;
              } else {
                  if (diag.flags !== "✅ No Anomalies" && diag.flags !== "") diag.flags += "\n🚩 STATUS MISMATCH";
                  else diag.flags = "🚩 STATUS MISMATCH";
                  diag.flagColors.push("#991b1b"); 
                  diag.draft = `Vendor reported activity, but QB shows ${refData.stage} | ${refData.status}. Please update QB to Field CX | In Progress.`;
              }
          }
      }
      
      rowObj["Health Flags"] = diag.flags; 
      rowObj["Action Required"] = diag.draft; 
      rowObj["Field Production"] = diag.summary; 
      rowObj["QB Context & Gaps"] = adminGapsStr; 
      rowObj["Historical Milestones"] = benchmarkDict[fdhId] || "No history logged.";
      rowObj["Archive_Row"] = idx + 1;
      
      let mappedRow = finalMirrorHeaders.map(h => rowObj[h] !== undefined ? rowObj[h] : "");
      reviewData.push(mappedRow);
      highlightsData.push({ rowState: diag.rowState, adaePaletteIdx: diag.adaePaletteIdx, colors: diag.colors, summary: diag.summary, gaps: adminGapsStr, flags: diag.flags, flagColors: diag.flagColors, cleanComment: diag.cleanComment, draft: diag.draft, benchmark: benchmarkDict[fdhId] || ""}); 
    }
  });

  if (mirrorSheet.getLastRow() > 1) mirrorSheet.getRange(2,1,mirrorSheet.getLastRow()-1, mirrorSheet.getMaxColumns()).clearContent().clearDataValidations().setBackground(null).setFontColor(null).setFontWeight(null);
  
  if (reviewData.length > 0) {
    ensureCapacity(mirrorSheet, reviewData.length + 1, finalMirrorHeaders.length); 
    mirrorSheet.getRange(1, 1, 1, finalMirrorHeaders.length).setValues([finalMirrorHeaders]);
    mirrorSheet.getRange(2, 1, reviewData.length, finalMirrorHeaders.length).setValues(reviewData);
    applyFormatting(mirrorSheet); 
    
    if (styleSheet) {
      let styleHeaders = styleSheet.getRange(1, 1, 1, styleSheet.getLastColumn()).getValues()[0];
      finalMirrorHeaders.forEach((h, i) => {
         let lookupH = h === "Field Production" ? "Construction Summary" : h;
         let styleIdx = styleHeaders.indexOf(lookupH);
         if (styleIdx > -1) mirrorSheet.setColumnWidth(i + 1, styleSheet.getColumnWidth(styleIdx + 1));
      });
    }
    
    let flagsIdx = finalMirrorHeaders.indexOf("Health Flags") + 1;
    let draftIdx = finalMirrorHeaders.indexOf("Action Required") + 1;
    let summaryIdx = finalMirrorHeaders.indexOf("Field Production") + 1;
    let gapsIdx = finalMirrorHeaders.indexOf("QB Context & Gaps") + 1;
    let vCommentIdx = finalMirrorHeaders.indexOf("Vendor Comment") + 1;
    let fdhIdx = finalMirrorHeaders.indexOf("FDH Engineering ID") + 1;
    let benchIdx = finalMirrorHeaders.indexOf("Historical Milestones") + 1; 
    
    highlightsData.forEach((hData, rIdx) => {
      let rowNum = rIdx + 2;
      if (fdhIdx > 0) mirrorSheet.getRange(rowNum, fdhIdx).setBackground(null).setFontColor(null).setFontWeight("bold");
      
      if (hData.rowState !== "ACTIVE") {
        let rTheme = ROW_THEMES[hData.rowState];
        mirrorSheet.getRange(rowNum, 1, 1, finalMirrorHeaders.length).setBackground(rTheme.bg).setFontColor(rTheme.text).setFontWeight("normal");
      } else {
        let pillTheme = BENNY_COLORS[hData.adaePaletteIdx];
        if (hData.adaePaletteIdx !== "CLEAN") {
            mirrorSheet.getRange(rowNum, flagsIdx, 1, 2).setBackground(pillTheme.bg).setFontColor(pillTheme.text).setFontWeight("bold");
        } else { 
            mirrorSheet.getRange(rowNum, flagsIdx).setFontColor(BENNY_COLORS.CLEAN.text).setFontWeight("bold"); 
            mirrorSheet.getRange(rowNum, draftIdx).setFontColor(ROW_THEMES.ACTIVE.text); 
        }
      }

      if (flagsIdx > 0 && hData.flags !== "✅ No Anomalies" && hData.flags !== "") {
           let richText = SpreadsheetApp.newRichTextValue().setText(hData.flags);
           let parts = hData.flags.split("\n"), start = 0;
           parts.forEach((p, i) => {
             if (hData.flagColors[i]) { let style = SpreadsheetApp.newTextStyle().setForegroundColor(hData.flagColors[i]).setBold(true).build(); richText.setTextStyle(start, start + p.length, style); }
             start += p.length + 1; 
           });
           mirrorSheet.getRange(rowNum, flagsIdx).setRichTextValue(richText.build());
      }
      
      if (draftIdx > 0 && hData.draft !== "") { 
          let richText = SpreadsheetApp.newRichTextValue().setText(hData.draft); 
          colorizeText(richText, hData.draft, "UG", TEXT_COLORS.UG); 
          colorizeText(richText, hData.draft, "Strand", TEXT_COLORS.AE); 
          colorizeText(richText, hData.draft, "Fiber", TEXT_COLORS.FIB); 
          colorizeText(richText, hData.draft, "NAP", TEXT_COLORS.NAP); 
          mirrorSheet.getRange(rowNum, draftIdx).setRichTextValue(richText.build()); 
      }
      
      if(summaryIdx > 0) {
          if (hData.summary.includes("No new production")) {
              mirrorSheet.getRange(rowNum, summaryIdx).setFontColor("#a78bfa").setFontWeight("normal");
          } else {
              let cell = mirrorSheet.getRange(rowNum, summaryIdx); 
              cell.setBackground("#faf5ff").setFontColor("#000000").setFontWeight("bold");
              let richText = SpreadsheetApp.newRichTextValue().setText(hData.summary);
              
              const styleAfter = (rt, fullText, prefix, defaultColor) => {
                  let idx = 0;
                  fullText.split('\n').forEach(line => {
                      let isComplete = line.includes("★");
                      let activeColor = isComplete ? TEXT_COLORS.DONE : defaultColor;

                      if (line.startsWith(prefix)) {
                          let style = SpreadsheetApp.newTextStyle().setForegroundColor(activeColor).setBold(true).build();
                          rt.setTextStyle(idx + prefix.length, idx + line.length, style);
                      } else if (line.startsWith("[Tracker] " + prefix)) {
                          let tPrefix = "[Tracker] " + prefix;
                          let style = SpreadsheetApp.newTextStyle().setForegroundColor(activeColor).setBold(true).build();
                          rt.setTextStyle(idx + tPrefix.length, idx + line.length, style);
                          let trkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#0284c7").setBold(true).build();
                          rt.setTextStyle(idx, idx + "[Tracker]".length, trkStyle);
                      }
                      idx += line.length + 1;
                  });
              };

              styleAfter(richText, hData.summary, "UG: ", TEXT_COLORS.UG);
              styleAfter(richText, hData.summary, "AE: ", TEXT_COLORS.AE);
              styleAfter(richText, hData.summary, "FIB: ", TEXT_COLORS.FIB);
              styleAfter(richText, hData.summary, "NAP: ", TEXT_COLORS.NAP);
              
              colorizeText(richText, hData.summary, "★", TEXT_COLORS.STAR);

              let linkIdx = hData.summary.indexOf("[📡 Tracker Linked]");
              if (linkIdx > -1) {
                  let linkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#64748b").setBold(false).build();
                  richText.setTextStyle(linkIdx, linkIdx + "[📡 Tracker Linked]".length, linkStyle);
              }
              cell.setRichTextValue(richText.build());
          }
      }
      
      if(vCommentIdx > 0 && hData.cleanComment !== "") {
          let cell = mirrorSheet.getRange(rowNum, vCommentIdx); 
          cell.setBackground("#fef3c7").setFontColor("#854d0e").setFontWeight("bold");
          let richText = SpreadsheetApp.newRichTextValue().setText(hData.cleanComment); 
          colorizeText(richText, hData.cleanComment, "UG", TEXT_COLORS.UG); 
          colorizeText(richText, hData.cleanComment, "Strand", TEXT_COLORS.AE); 
          colorizeText(richText, hData.cleanComment, "Fiber", TEXT_COLORS.FIB); 
          
          let trkNoteIdx = hData.cleanComment.indexOf("[Tracker Note]:");
          if (trkNoteIdx > -1) {
              let trkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#0284c7").setBold(true).build();
              richText.setTextStyle(trkNoteIdx, trkNoteIdx + "[Tracker Note]:".length, trkStyle);
          }
          cell.setRichTextValue(richText.build());
      }
      
      if(benchIdx > 0 && hData.benchmark !== "") {
          let cell = mirrorSheet.getRange(rowNum, benchIdx);
          cell.setBackground("#f8fafc").setFontColor("#334155").setFontWeight("normal");
          
          let benchStr = hData.benchmark.replace(/\(100\%\)/g, "(100%) ★");
          let richText = SpreadsheetApp.newRichTextValue().setText(benchStr);
          
          const styleBenchLine = (rt, fullText, prefix, defaultColor) => {
              let idx = 0;
              fullText.split('\n').forEach(line => {
                  if (line.startsWith(prefix)) {
                      let isComplete = line.includes("(100%)");
                      let isPending = line.includes("Pending");
                      let isReroute = line.includes("[Possible Reroute]") || line.includes("[Scope Deviation]");
                      
                      let activeColor = isComplete ? TEXT_COLORS.DONE : 
                                        isReroute ? TEXT_COLORS.MISMATCH : 
                                        isPending ? "#94a3b8" : defaultColor;

                      let style = SpreadsheetApp.newTextStyle().setForegroundColor(activeColor).setBold(!isPending).build();
                      rt.setTextStyle(idx + prefix.length, idx + line.length, style);

                      let prefixStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#000000").setBold(true).build();
                      rt.setTextStyle(idx, idx + prefix.length, prefixStyle);
                  }
                  idx += line.length + 1;
              });
          };

          styleBenchLine(richText, benchStr, "UG: ", TEXT_COLORS.UG);
          styleBenchLine(richText, benchStr, "AE: ", TEXT_COLORS.AE);
          styleBenchLine(richText, benchStr, "FIB: ", TEXT_COLORS.FIB);
          styleBenchLine(richText, benchStr, "NAP: ", TEXT_COLORS.NAP);
          
          colorizeText(richText, benchStr, "★", TEXT_COLORS.STAR);

          let labelStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#000000").setBold(true).build();
          let locIdx = benchStr.indexOf("Loc:");
          if (locIdx > -1) richText.setTextStyle(locIdx, locIdx + 4, labelStyle);
          let cabIdx = benchStr.indexOf("Cab:");
          if (cabIdx > -1) richText.setTextStyle(cabIdx, cabIdx + 4, labelStyle);
          let litIdx = benchStr.indexOf("Lit:");
          if (litIdx > -1) richText.setTextStyle(litIdx, litIdx + 4, labelStyle);
          
          cell.setRichTextValue(richText.build());
      }
      
      if(gapsIdx > 0 && hData.gaps !== "-") {
          let cell = mirrorSheet.getRange(rowNum, gapsIdx);
          cell.setFontColor("#475569").setFontWeight("bold");
          let gRich = SpreadsheetApp.newRichTextValue().setText(hData.gaps);
          let dangerStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#991b1b").setBold(true).build();
          let warnStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#b45309").setBold(true).build();
          
          let alertIdx = hData.gaps.indexOf("🚨");
          if(alertIdx > -1) gRich.setTextStyle(alertIdx, hData.gaps.length, dangerStyle);
          
          let warnIdx = hData.gaps.indexOf("⚠️");
          if(warnIdx > -1) gRich.setTextStyle(warnIdx, hData.gaps.length, warnStyle);
          
          cell.setRichTextValue(gRich.build());
      }
      
      if (hData.rowState === "ACTIVE") {
          const applyColor = (colsArray, paletteColor) => { colsArray.forEach(colName => { let cIdx = finalMirrorHeaders.indexOf(colName); if (cIdx > -1) mirrorSheet.getRange(rowNum, cIdx + 1).setBackground(paletteColor.bg).setFontColor(paletteColor.text).setFontWeight("bold"); }); };
          applyColor(hData.colors.warn, BENNY_COLORS.RED); applyColor(hData.colors.mismatch, BENNY_COLORS.YELLOW); applyColor(hData.colors.ug, BENNY_COLORS.UG); applyColor(hData.colors.ae, BENNY_COLORS.AE); applyColor(hData.colors.fib, BENNY_COLORS.FIB); applyColor(hData.colors.nap, BENNY_COLORS.NAP);
      }
    });
    
    mirrorSheet.hideColumns(finalMirrorHeaders.indexOf("Archive_Row") + 1);
    try { mirrorSheet.getRange(1, 1, 1, mirrorSheet.getMaxColumns()).shiftColumnGroupDepth(-10); } catch(e){} 
    let startGroupCol = finalMirrorHeaders.indexOf("Locates Called In") + 1;
    let endGroupCol = finalMirrorHeaders.indexOf("Splicing Crews") + 1;
    if (startGroupCol > 0 && endGroupCol >= startGroupCol) { try { mirrorSheet.getRange(1, startGroupCol, 1, endGroupCol - startGroupCol + 1).shiftColumnGroupDepth(1); mirrorSheet.collapseAllColumnGroups(); } catch(e) {} }
    
  } else if (!isSilent) {
    SpreadsheetApp.getUi().alert(`No data found in Master Archive for Date: ${targetDateStr}`);
  }
}