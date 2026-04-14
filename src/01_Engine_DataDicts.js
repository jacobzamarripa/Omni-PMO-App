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
  // Store import date so dashboard can show staleness
  let importDateStr = Utilities.formatDate(newestDate, "GMT-5", "MM/dd/yy");
  PropertiesService.getScriptProperties().setProperty('refDataImportDate', importDateStr);
  PropertiesService.getScriptProperties().setProperty('refDataFileName', newestFile.getName());

  // 🧠 Clear crossing check history — new ref data is the source of truth.
  // If Special Crossings? is still blank after import, it never made it to QB and needs re-checking.
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if (adminSheet && adminSheet.getLastRow() > 1) {
    adminSheet.getRange(2, 2, adminSheet.getLastRow() - 1, 1).clearContent();
  }

  SpreadsheetApp.getUi().alert(`✅ Successfully imported Reference Data: \n${newestFile.getName()}\n\nCrossing check history has been reset — projects with blank Special Crossings? will be flagged for review.`);
}

function populateDailyReviewFromReference() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const refSheet = ss.getSheetByName(REF_SHEET);
  const drSheet  = ss.getSheetByName(MIRROR_SHEET);
  if (!refSheet || refSheet.getLastRow() < 2) return { updated: 0, added: 0, removed: 0 };
  if (!drSheet  || drSheet.getLastRow()  < 1) return { updated: 0, added: 0, removed: 0 };

  const refData    = refSheet.getDataRange().getValues();
  const refHeaders = refData[0].map(h => h.toString().trim());
  const refFdhIdx  = refHeaders.findIndex(h => h.toUpperCase().includes("FDH"));
  if (refFdhIdx < 0) return { updated: 0, added: 0, removed: 0 };

  const drData    = drSheet.getDataRange().getValues();
  const drHeaders = drData[0].map(h => h.toString().trim());
  const drFdhIdx  = drHeaders.findIndex(h => h.toUpperCase().includes("FDH ENGINEERING ID") || h.toUpperCase().includes("FDH"));

  const PROTECTED = ["Special Crossings?", "Special Crossing Details", "Committed Date", "Crossings Verified Date", "QB Status"];
  const protectedIdx = new Set(PROTECTED.map(name => drHeaders.indexOf(name)).filter(i => i > -1));

  let drLookup = {};
  for (let i = 1; i < drData.length; i++) {
    let key = drFdhIdx > -1 ? drData[i][drFdhIdx].toString().trim().toUpperCase() : "";
    if (key) drLookup[key] = i;
  }

  let refFdhSet = new Set();
  let updated = 0, added = 0;

  for (let r = 1; r < refData.length; r++) {
    let fdhKey = refData[r][refFdhIdx].toString().trim().toUpperCase();
    if (!fdhKey) continue;
    refFdhSet.add(fdhKey);

    let drRowIdx = drLookup[fdhKey];
    if (drRowIdx !== undefined) {
      for (let c = 0; c < refHeaders.length; c++) {
        let drColIdx = drHeaders.indexOf(refHeaders[c]);
        if (drColIdx > -1 && !protectedIdx.has(drColIdx)) {
          drSheet.getRange(drRowIdx + 1, drColIdx + 1).setValue(refData[r][c]);
        }
      }
      updated++;
    } else {
      let newRow = new Array(drHeaders.length).fill("");
      for (let c = 0; c < refHeaders.length; c++) {
        let drColIdx = drHeaders.indexOf(refHeaders[c]);
        if (drColIdx > -1) newRow[drColIdx] = refData[r][c];
      }
      drSheet.appendRow(newRow);
      added++;
    }
  }

  let removed = 0;
  let qsColIdx = drHeaders.indexOf("QB Status");
  if (qsColIdx < 0) {
    drSheet.getRange(1, drHeaders.length + 1).setValue("QB Status");
    qsColIdx = drHeaders.length;
    drHeaders.push("QB Status");
  }
  for (let key in drLookup) {
    if (!refFdhSet.has(key)) {
      drSheet.getRange(drLookup[key] + 1, qsColIdx + 1).setValue("REMOVED FROM QB");
      removed++;
    }
  }

  logMsg("populateDailyReviewFromReference: " + updated + " updated, " + added + " added, " + removed + " flagged removed");
  return { updated: updated, added: added, removed: removed };
}

function getReferenceDictionary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const refSheet = ss.getSheetByName(REF_SHEET);
  let refDict = {};
  
  let adminSheet = ss.getSheetByName("Admin_Logs");
  if (!adminSheet) {
    adminSheet = ss.insertSheet("Admin_Logs");
    adminSheet.appendRow(["FDH Engineering ID", "Last Checked Date", "Status Sync Date"]);
    adminSheet.getRange("1:1").setBackground("#0f172a").setFontColor("white").setFontWeight("bold");
    adminSheet.setFrozenRows(1);
    adminSheet.hideSheet();
  }
  if (adminSheet.getLastColumn() < 3) adminSheet.getRange(1, 3).setValue("Status Sync Date");

  let adminData = adminSheet.getDataRange().getValues();
  let aHeaders = adminData[0];
  let aInsightIdx = aHeaders.indexOf("Gemini Insight");
  let aInsightDateIdx = aHeaders.indexOf("Gemini Insight Date");

  let adminDict = {};
  for (let i = 1; i < adminData.length; i++) {
      let fdhKey = adminData[i][0].toString().trim().toUpperCase();
      if (fdhKey) adminDict[fdhKey] = {
          xingDate: adminData[i][1],
          statusDate: adminData[i][2],
          geminiInsight: aInsightIdx > -1 ? adminData[i][aInsightIdx].toString().trim() : "",
          geminiDate: aInsightDateIdx > -1 ? adminData[i][aInsightDateIdx].toString().trim() : ""
      };
  }

  if (refSheet && refSheet.getLastRow() > 1) {
    let refHeaders = refSheet.getRange(1, 1, 1, refSheet.getLastColumn()).getValues()[0].map(String);
    let fdhIdx = refHeaders.findIndex(h => h.toUpperCase().includes("FDH")); 
    
    // 🧠 FIX: Bulletproof indexing against nulls
    let getIdx = (name) => refHeaders.findIndex(h => h != null && h.trim().toUpperCase() === name.toUpperCase());
    
    let getIdxByAliases = (aliases) => aliases
      .map(getIdx)
      .find(function(idx) { return idx > -1; });

    let cityIdx = getIdx("City"), stageIdx = getIdx("Stage"), statusIdx = getIdx("Status"), bslIdx = Math.max(getIdx("BSLs"), getIdx("HHPs"), getIdx("BSL")); 
    let ofsIdx = getIdxByAliases(["OFS DATE", "Budget OFS"]), cxStartIdx = getIdx("CX Start"), cxEndIdx = getIdx("CX Complete");
    let bomUGIdx = getIdx("UG BOM Qty."), bomAEIdx = getIdx("AE BOM Qty."), bomFIBIdx = getIdx("Fiber BOM Qty."), bomNAPIdx = getIdx("NAPs BOM Qty.");
    let ridIdx = getIdx("Record ID#"), bomDelIdx = getIdx("BOM in Deliverables"), spliceDelIdx = getIdx("Splice Sheet in Deliverables");
    let standDelIdx = getIdx("Stand Map in Deliverables"), cdDelIdx = getIdx("CD in Deliverables"), spliceDistIdx = getIdx("Splice Docs Distributed");
    let strandDistIdx = getIdx("Strand Maps"), cdDistIdx = getIdx("CD Distributed"), bomPoIdx = getIdx("BOM & PO sent"), sowIdx = getIdx("SOW sent");
    let cdIdx = cdDistIdx, specXIdx = getIdx("Special Crossings?"), specXDetailsIdx = getIdx("Special Crossing Details");

    // Deck reference values from QB multi-table join (populated by syncFromQBWebApp enrichment)
    let qbPermitSentIdx = getIdx("QB_Permit_Sent");
    let qbPermitApprIdx = getIdx("QB_Permit_Appr");
    let qbCrossSubIdx   = getIdx("QB_Cross_Sub");
    let qbCrossApprIdx  = getIdx("QB_Cross_Appr");
    let qbCrossDistIdx  = getIdx("QB_Cross_Dist");
    let qbXingExistIdx  = getIdx("QB_Xing_Exist");
    let qbPmRidIdx      = getIdx("QB_PM_RID");
    let qbActiveSetIdx  = getIdx("QB_Active_Set");
    let qbActivePwrIdx  = getIdx("QB_Active_Pwr");
    let qbLegIdx        = getIdx("QB_Leg");
    let qbTransportIdx  = getIdx("QB_Transport");
    let qbHowFedIdx     = getIdx("QB_How_Fed");
    let qbWhatFeedsIdx  = getIdx("QB_What_Feeds");
    let qbIslandIdx     = getIdx("QB_Island");
    let qbOfsChangeIdx  = getIdx("QB_Ofs_Change");
    let qbCdDistIdx     = getIdx("QB_CD_Dist");
    let qbSpliceDistIdx = getIdx("QB_Splice_Dist");
    let qbStrandDistIdx = getIdx("QB_Strand_Dist");
    let qbBomSentIdx    = getIdx("QB_BOM_Sent");
    let qbSowSignIdx    = getIdx("QB_SOW_Sign");
    let qbOfsReasonIdx  = getIdx("QB_Ofs_Reason");
    let drgIdx          = ["DRG", "Direct Vendor", "Direct Vendor Tracking", "DRG Tracker", "Direct Vendor Tracker"]
      .map(getIdx)
      .find(function(idx) { return idx > -1; });
    let drgUrlIdx       = ["DRG Tracker URL", "Direct Vendor Tracker URL", "DRG URL", "Direct Vendor URL", "Tracker URL"]
      .map(getIdx)
      .find(function(idx) { return idx > -1; });
    let vendorIdx = getIdx("CX Vendor");
    if (vendorIdx === -1) vendorIdx = getIdx("Contractor");
    if (vendorIdx === -1) vendorIdx = getIdx("Vendor");

    const isChecked = (val) => val != null && ["true", "1", "yes", "checked"].includes(String(val).toLowerCase().trim());
    const safeDate = (val) => {
        if (!val) return "";
        if (val instanceof Date) return Utilities.formatDate(val, "GMT-5", "MM/dd/yy");
        let d = new Date(val);
        if (!isNaN(d.getTime())) return Utilities.formatDate(d, "GMT-5", "MM/dd/yy");
        return String(val).trim();
    };

    if (fdhIdx > -1) {
      let refData = refSheet.getRange(2, 1, refSheet.getLastRow() - 1, refSheet.getLastColumn()).getValues();
      refData.forEach(r => {
         let f = r[fdhIdx] != null ? String(r[fdhIdx]).trim().toUpperCase() : "";
         let xingVal = specXIdx > -1 ? String(r[specXIdx] || "").trim() : "";
         if (f) refDict[f] = { 
           city: cityIdx > -1 ? String(r[cityIdx] || "-") : "-", 
           stage: stageIdx > -1 ? String(r[stageIdx] || "-") : "-", 
           status: statusIdx > -1 ? String(r[statusIdx] || "-") : "-", 
           bsls: bslIdx > -1 ? String(r[bslIdx] || "-") : "-",
           forecastedOFS: ofsIdx > -1 ? safeDate(r[ofsIdx]) : "-",
           canonicalOfsDate: ofsIdx > -1 ? safeDate(r[ofsIdx]) : "",
           cxStart: cxStartIdx > -1 ? safeDate(r[cxStartIdx]) : "",
           cxComplete: cxEndIdx > -1 ? safeDate(r[cxEndIdx]) : "",
           ugBOM: bomUGIdx > -1 ? Number(r[bomUGIdx]) || 0 : 0, 
           aeBOM: bomAEIdx > -1 ? Number(r[bomAEIdx]) || 0 : 0,
           fibBOM: bomFIBIdx > -1 ? Number(r[bomFIBIdx]) || 0 : 0, 
           napBOM: bomNAPIdx > -1 ? Number(r[bomNAPIdx]) || 0 : 0,
           rid: ridIdx > -1 ? String(r[ridIdx] || "").trim() : "",
           hasSOW: sowIdx > -1 ? isChecked(r[sowIdx]) : true, 
           hasBOM: bomPoIdx > -1 ? isChecked(r[bomPoIdx]) : true,
           hasCD: cdIdx > -1 ? isChecked(r[cdIdx]) : true, 
           hasBOMDel: bomDelIdx > -1 ? isChecked(r[bomDelIdx]) : false,
           hasSpliceDel: spliceDelIdx > -1 ? isChecked(r[spliceDelIdx]) : false,
           hasStandDel: standDelIdx > -1 ? isChecked(r[standDelIdx]) : false,
           hasCDDel: cdDelIdx > -1 ? isChecked(r[cdDelIdx]) : false,
           hasSpliceDist: spliceDistIdx > -1 ? isChecked(r[spliceDistIdx]) : false,
           hasStrandDist: strandDistIdx > -1 ? isChecked(r[strandDistIdx]) : false,
           hasCDDist: cdDistIdx > -1 ? isChecked(r[cdDistIdx]) : false,
           hasBOMPo: bomPoIdx > -1 ? isChecked(r[bomPoIdx]) : false,
           rawSpecialX: xingVal,
           isSpecialX: (xingVal.toLowerCase() === "yes" || xingVal.toLowerCase() === "true"),
           specXDetails: specXDetailsIdx > -1 ? String(r[specXDetailsIdx] || "").trim() : "",
           isDrgTracked: drgIdx > -1 ? isChecked(r[drgIdx]) : false,
           drgTrackerUrl: drgUrlIdx > -1 ? String(r[drgUrlIdx] || "").trim() : "",
           adminDate: adminDict[f] ? safeDate(adminDict[f].xingDate) : "",
           statusSyncDate: adminDict[f] && adminDict[f].statusDate ? safeDate(adminDict[f].statusDate) : "",
           geminiInsight: adminDict[f] ? String(adminDict[f].geminiInsight || "") : "",
           geminiDate: adminDict[f] ? String(adminDict[f].geminiDate || "") : "",
           qbRef: {
             permitSent: qbPermitSentIdx > -1 ? String(r[qbPermitSentIdx] || "") : "",
             permitAppr: qbPermitApprIdx > -1 ? String(r[qbPermitApprIdx] || "") : "",
             xingExist:  qbXingExistIdx  > -1 ? String(r[qbXingExistIdx]  || "") : "",
             crossSub:   qbCrossSubIdx   > -1 ? String(r[qbCrossSubIdx]   || "") : "",
             crossAppr:  qbCrossApprIdx  > -1 ? String(r[qbCrossApprIdx]  || "") : "",
             crossDist:  qbCrossDistIdx  > -1 ? String(r[qbCrossDistIdx]  || "") : "",
             pmRid:      qbPmRidIdx      > -1 ? String(r[qbPmRidIdx]      || "") : "",
             activeSet:  qbActiveSetIdx  > -1 ? String(r[qbActiveSetIdx]  || "") : "",
             activePwr:  qbActivePwrIdx  > -1 ? String(r[qbActivePwrIdx]  || "") : "",
             leg:        qbLegIdx        > -1 ? String(r[qbLegIdx]        || "") : "",
             transport:  qbTransportIdx  > -1 ? String(r[qbTransportIdx]  || "") : "",
             howFed:     qbHowFedIdx     > -1 ? String(r[qbHowFedIdx]     || "") : "",
             whatFeeds:  qbWhatFeedsIdx  > -1 ? String(r[qbWhatFeedsIdx]  || "") : "",
             island:     qbIslandIdx     > -1 ? String(r[qbIslandIdx]     || "") : "",
             ofsChange:  qbOfsChangeIdx  > -1 ? String(r[qbOfsChangeIdx]  || "") : "",
             ofsReason:  qbOfsReasonIdx  > -1 ? String(r[qbOfsReasonIdx]  || "") : "",
             cdDist:     qbCdDistIdx     > -1 ? String(r[qbCdDistIdx]     || "") : "",
             spliceDist: qbSpliceDistIdx > -1 ? String(r[qbSpliceDistIdx] || "") : "",
             strandDist: qbStrandDistIdx > -1 ? String(r[qbStrandDistIdx] || "") : "",
             bomSent:    qbBomSentIdx    > -1 ? String(r[qbBomSentIdx]    || "") : "",
             poSent:     bomPoIdx        > -1 ? String(r[bomPoIdx]        || "") : "",
             sowSign:    qbSowSignIdx    > -1 ? String(r[qbSowSignIdx]    || "") : "",
             phase:      stageIdx > -1 ? String(r[stageIdx] || "") : "", 
             stage:      stageIdx > -1 ? String(r[stageIdx] || "") : "", 
             status:     statusIdx > -1 ? String(r[statusIdx] || "") : "",
             // FID mapping for collision engine
             "513": qbBomSentIdx    > -1 ? String(r[qbBomSentIdx]    || "") : "",
             "525": specXIdx        > -1 ? String(r[specXIdx]        || "") : "",
             "526": specXDetailsIdx > -1 ? String(r[specXDetailsIdx] || "") : "",
             "742": "", 
             "744": stageIdx > -1 ? String(r[stageIdx] || "") : "",
             "746": statusIdx > -1 ? String(r[statusIdx] || "") : ""
           },
           vendor: vendorIdx > -1 ? String(r[vendorIdx] || "").trim() : ""
         };
      });
    }
  }
  return refDict;
}

/**
 * 🧠 CORE FEATURE: Reads the Special Crossings data (populated locally)
 * and maps it to Project IDs for frontend injection.
 */
function getSpecialXingsDictionary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(XING_SHEET);
  let dict = {};
  if (!sheet || sheet.getLastRow() < 2) return dict;

  let data = sheet.getDataRange().getValues();
  let headers = data[0].map(h => h.toString().trim());

  let fdhIdx = headers.indexOf("Project ID / FDH");
  let sumIdx = headers.indexOf("AI Summary / Major Flags");
  let hwIdx  = headers.indexOf("Highway / RR / DOT Crossings");
  let parIdx = headers.indexOf("Parallel HWY/RR Work & Long Bores");
  let rivIdx = headers.indexOf("River / Water Crossings");
  let pmtIdx = headers.indexOf("Presumed Permits Needed");

  if (fdhIdx === -1) return dict;

  for (let i = 1; i < data.length; i++) {
    let fdh = data[i][fdhIdx] ? data[i][fdhIdx].toString().trim().toUpperCase() : "";
    if (fdh) {
      let summary = sumIdx > -1 ? data[i][sumIdx].toString().trim() : "";
      let highway = hwIdx > -1 ? data[i][hwIdx].toString().trim() : "";
      let parallel = parIdx > -1 ? data[i][parIdx].toString().trim() : "";
      let river = rivIdx > -1 ? data[i][rivIdx].toString().trim() : "";
      let permits = pmtIdx > -1 ? data[i][pmtIdx].toString().trim() : "";

      dict[fdh] = {
        summary: summary,
        highway: highway,
        parallel: parallel,
        river: river,
        permits: permits,
        hasFindings: (highway.toLowerCase() !== "none" && highway !== "") || 
                     (parallel.toLowerCase() !== "none" && parallel !== "") || 
                     (river.toLowerCase() !== "none" && river !== "")
      };
    }
  }
  return dict;
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

/**
 * FILE: 01_Engine.gs
 * Updated: getVendorLiveDictionary
 * Purpose: Robust extraction of percentages, multiple notes, and milestone dates.
 */

function getVendorLiveDictionary(refDict) {
  let vendorDict = {};
  let officialFDHs = refDict ? Object.keys(refDict) : [];
  let fuzzyCorrectionCount = 0;
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
      let fdhIdx = -1;
      
      // 🧠 FIX: Smarter Header Detection (Don't rely just on "FDH")
      for(let i=0; i<Math.min(10, vData.length); i++){
        let rowUpper = vData[i].map(h => h.toString().trim().toUpperCase());
        if (rowUpper.includes("FDH") || rowUpper.includes("ISSUE DATE") || rowUpper.includes("UNDERGROUND")) { 
            headerRowIdx = i; 
            headers = vData[i].map(h => h.toString().trim()); 
            
            fdhIdx = rowUpper.indexOf("FDH");
            // If the vendor deleted the "FDH" header (like in Bucyrus), default to Column A
            if (fdhIdx === -1) fdhIdx = 0;
            break; 
        }
      }
      if (headerRowIdx === -1) continue;
      
      const findFlexiblePctCol = (colKeywordsArray) => {
          return headers.findIndex(h => {
              let hUpper = h.toUpperCase();
              let containsAllKeywords = colKeywordsArray.every(kw => hUpper.includes(kw));
              let containsPct = hUpper.includes("%") || hUpper.includes("PCT");
              let containsCom = hUpper.includes("C"); 
              return containsAllKeywords && containsPct && containsCom;
          });
      };

      let ugPctIdx = findFlexiblePctCol(["UG"]);
      let aePctIdx = findFlexiblePctCol(["AE"]);
      let fibPctIdx = findFlexiblePctCol(["FIBER"]);
      let napPctIdx = findFlexiblePctCol(["NAP"]);
      
      let cabSetIdx = headers.findIndex(h => h.toUpperCase().includes("CABINET SET"));
      let locIdx = headers.findIndex(h => h.toUpperCase().includes("LOCATE"));

      let noteIndices = [];
      headers.forEach((h, idx) => { if (h.toUpperCase().includes("NOTE")) noteIndices.push(idx); });

      for (let i = headerRowIdx + 1; i < vData.length; i++) {
         let rawFdh = vData[i][fdhIdx] ? vData[i][fdhIdx].toString().trim().toUpperCase() : "";
         if (!rawFdh) continue;
         let finalFdh = rawFdh;
         
         // 🧠 NEW: Advanced Triangulation Matching
         let matched = attemptFuzzyMatch(rawFdh, officialFDHs, sheetName, refDict);
         if (matched) {
             finalFdh = matched;
             if (matched !== rawFdh) fuzzyCorrectionCount++;
         }
         
         let combinedNotes = noteIndices
             .map(idx => vData[i][idx].toString().trim())
             .filter(n => n !== "")
             .join(" | ");

         let milestonesStr = "";
         let milestonesArr = [];

         if (cabSetIdx > -1) {
             let cabVal = vData[i][cabSetIdx];
             if (cabVal && cabVal.toString().trim() !== "" && cabVal.toString().trim() !== "FALSE") {
                 let dateFormatted = cabVal instanceof Date ? Utilities.formatDate(cabVal, "GMT-5", "M/d") : cabVal;
                 milestonesArr.push(`Cab Set: ${dateFormatted}`);
             }
         }
         
         if (locIdx > -1) {
             let locVal = vData[i][locIdx];
             if (locVal && locVal.toString().trim() !== "" && locVal.toString().trim() !== "FALSE") {
                 let dateFormatted = locVal instanceof Date ? Utilities.formatDate(locVal, "GMT-5", "M/d") : locVal;
                 milestonesArr.push(`Locates: ${dateFormatted}`);
             }
         }

         if (milestonesArr.length > 0) milestonesStr = `[${milestonesArr.join(" • ")}] `;

         let finalTrackerNote = (milestonesStr + combinedNotes).trim();

         vendorDict[finalFdh] = { 
             ugPct: ugPctIdx > -1 ? parseTrackerPct(vData[i][ugPctIdx]) : 0,
             aePct: aePctIdx > -1 ? parseTrackerPct(vData[i][aePctIdx]) : 0,
             fibPct: fibPctIdx > -1 ? parseTrackerPct(vData[i][fibPctIdx]) : 0,
             napPct: napPctIdx > -1 ? parseTrackerPct(vData[i][napPctIdx]) : 0,
             notes: finalTrackerNote
         };
      }
    }
    logMsg(`📉 Vendor Tracker Coverage: Successfully matched ${Object.keys(vendorDict).length} projects. Same-market fuzzy corrections: ${fuzzyCorrectionCount}.`);
  } catch (e) { logMsg(`⚠️ Vendor Tracker Error: ${e.toString()}`); }
  return vendorDict;
}
