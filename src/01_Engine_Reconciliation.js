/**
 * ReconciliationEngine
 * Unifies discrepancy detection between Archive (Vendor) data and Quickbase Reference.
 */
const ReconciliationEngine = (function() {

  const OVERAGE_THRESHOLD = 1.15; // 115% of BOM is considered an overrun

  /**
   * Performs full reconciliation for a single FDH record.
   * 
   * @param {Array} row Raw archive row data
   * @param {Object} adapter Payload field accessors
   * @param {Object} refData Quickbase reference data object
   * @param {Object} metrics Production metrics from ProductionSummarizer
   * @param {Object} options Configuration and context (refDict, lkvDict, rowState, etc.)
   */
  function reconcile(row, adapter, refData, metrics, options) {
    let flags = [];
    let drafts = [];
    let hCols = { warn: [], mismatch: [], ug: [], ae: [], fib: [], nap: [] };
    let flagColors = [];
    let inferredStage = "";
    let inferredStatus = "";

    // 1. Stage & Status Reconciliation
    const stageVerdict = _reconcileStageAndStatus(row, adapter, refData, metrics, options);
    flags = flags.concat(stageVerdict.flags);
    drafts = drafts.concat(stageVerdict.drafts);
    flagColors = flagColors.concat(stageVerdict.flagColors);
    inferredStage = stageVerdict.inferredStage;
    inferredStatus = stageVerdict.inferredStatus;

    // 2. Date & Chronology Reconciliation
    const dateVerdict = _reconcileDates(row, adapter, refData, metrics);
    flags = flags.concat(dateVerdict.flags);
    drafts = drafts.concat(dateVerdict.drafts);
    flagColors = flagColors.concat(dateVerdict.flagColors);
    if (dateVerdict.hCols.warn) hCols.warn = hCols.warn.concat(dateVerdict.hCols.warn);

    // 3. BOM & Production Reconciliation
    const bomVerdict = _reconcileBOM(row, adapter, refData, metrics, options.rowState);
    flags = flags.concat(bomVerdict.flags);
    drafts = drafts.concat(bomVerdict.drafts);
    flagColors = flagColors.concat(bomVerdict.flagColors);
    if (bomVerdict.hCols.mismatch) hCols.mismatch = hCols.mismatch.concat(bomVerdict.hCols.mismatch);
    if (bomVerdict.hCols.warn) hCols.warn = hCols.warn.concat(bomVerdict.hCols.warn);

    // 4. Upstream/Downstream Dependencies
    const depVerdict = _reconcileDependencies(row, adapter, refData, options);
    flags = flags.concat(depVerdict.flags);
    drafts = drafts.concat(depVerdict.drafts);
    flagColors = flagColors.concat(depVerdict.flagColors);

    // 5. Tracker Reconciliation
    const trackerVerdict = _reconcileTracker(row, adapter, refData, metrics, options);
    flags = flags.concat(trackerVerdict.flags);
    drafts = drafts.concat(trackerVerdict.drafts);
    flagColors = flagColors.concat(trackerVerdict.flagColors);
    if (trackerVerdict.hCols.mismatch) hCols.mismatch = hCols.mismatch.concat(trackerVerdict.hCols.mismatch);

    return {
      flags: flags,
      drafts: drafts,
      flagColors: flagColors,
      hCols: hCols,
      inferredStage: inferredStage,
      inferredStatus: inferredStatus
    };
  }

  /**
   * Internal: Reconcile Stage/Status vs. Activity
   */
  function _reconcileStageAndStatus(row, adapter, refData, metrics, options) {
    let flags = [], drafts = [], flagColors = [], inferredStage = "", inferredStatus = "";
    const fdhId = options.fdhId;
    const rowDate = row[adapter.getIdx("DATE")];
    const actualActivity = metrics.dailyUG > 0 || metrics.dailyAE > 0 || metrics.dailyFIB > 0 || metrics.dailyNAP > 0;

    if (!refData) {
      const lkvDict = options.lkvDict || {};
      const inferenceHistoryContext = options.inferenceHistoryContext || {};
      const vendorComment = row[adapter.getIdx("COMMENT")] ? row[adapter.getIdx("COMMENT")].toString().trim() : "";
      const lightToCab = row[adapter.getIdx("Light to Cabinets")] === true;
      const crewsNAP = Number(row[adapter.getIdx("Splicing Crews")]) || 0;

      let inferredState = resolveMissingReferenceState({
          fdhId: fdhId,
          rowDate: rowDate,
          vendorComment: vendorComment,
          dailyUG: metrics.dailyUG,
          dailyAE: metrics.dailyAE,
          dailyFIB: metrics.dailyFIB,
          dailyNAP: metrics.dailyNAP,
          totalUG: metrics.totalUG,
          totalAE: metrics.totalAE,
          totalFIB: metrics.totalFIB,
          totalNAP: metrics.totalNAP,
          vendorBOMUG: metrics.bomUG,
          vendorBOMAE: metrics.bomAE,
          vendorBOMFIB: metrics.bomFIB,
          vendorBOMNAP: metrics.bomNAP,
          splicingCrews: crewsNAP,
          lightToCab: lightToCab,
          vTracker: options.vTracker,
          inferenceHistoryContext: inferenceHistoryContext,
          lastKnownState: (lkvDict && lkvDict[fdhId]) ? lkvDict[fdhId] : null
      });

      if (inferredState.flag) {
        flags.push(inferredState.flag);
        flagColors.push(inferredState.flagColor || TEXT_COLORS.WARN);
      }
      drafts.push(inferredState.note);
      inferredStage = inferredState.stage;
      inferredStatus = inferredState.status;
    } else {
      const stageStr = (refData.stage || "").toUpperCase().trim();
      const statusStr = (refData.status || "").toUpperCase().trim();
      
      // QB STAGE HYGIENE
      if (stageStr === "" || stageStr === "-" || statusStr === "" || statusStr === "-") {
          flags.push("STAGE MISMATCH");
          flagColors.push("#991b1b");
          drafts.push("Action: Update QuickBase. Project is missing a valid Stage or Status.");
      } else if (actualActivity) {
          const isFieldCx = stageStr.includes("FIELD CX");
          if (!isFieldCx) {
              // Cleanup heuristic: Ignore activity if it occurs in the same month as OFS.
              let isOfs = stageStr.includes("OFS") || statusStr.includes("OFS") || statusStr.includes("OPEN FOR SALE");
              let isCleanUp = false;
              if (isOfs && refData.canonicalOfsDate) {
                  let ofsDate = new Date(refData.canonicalOfsDate);
                  let reportDate = rowDate instanceof Date ? rowDate : new Date(rowDate);
                  if (!isNaN(ofsDate.getTime()) && !isNaN(reportDate.getTime())) {
                      if (ofsDate.getUTCMonth() === reportDate.getUTCMonth() && ofsDate.getUTCFullYear() === reportDate.getUTCFullYear()) {
                          isCleanUp = true;
                      }
                  }
              }
              if (!isCleanUp) {
                let hasSyncedToday = false;
                if (refData.statusSyncDate) {
                    let syncDate = new Date(refData.statusSyncDate);
                    let today = new Date();
                    if (syncDate.getDate() === today.getDate() && syncDate.getMonth() === today.getMonth() && syncDate.getFullYear() === today.getFullYear()) {
                        hasSyncedToday = true;
                    }
                }
                if (hasSyncedToday) {
                    flags.push("ADMIN: REFRESH REF DATA");
                    flagColors.push("#991b1b");
                    drafts.push("Action: Refresh Reference Data. QB status was synced today but is still showing " + stageStr + ". Verify if project is truly in Field CX.");
                } else {
                    flags.push("STAGE MISMATCH");
                    flagColors.push("#991b1b");
                    drafts.push("Action: Update QuickBase Stage. Vendor is reporting production but QB is currently set to " + stageStr + ".");
                }
              }
          }
      }
    }

    return { flags, drafts, flagColors, inferredStage, inferredStatus };
  }

  /**
   * Internal: Reconcile Dates & Chronology
   */
  function _reconcileDates(row, adapter, refData, metrics) {
    let flags = [], drafts = [], flagColors = [], hCols = { warn: [] };
    const today = new Date();
    today.setHours(0,0,0,0);

    const checkBounds = (d, label) => {
      if (!d || isNaN(d.getTime())) return;
      let diff = (d.getTime() - today.getTime()) / 86400000;
      if (diff > 60) {
        flags.push(`INVALID FUTURE DATE (${label})`);
        flagColors.push(TEXT_COLORS.WARN);
        drafts.push(`${label} (${Utilities.formatDate(d, "GMT-5", "MM/dd/yy")}) is > 60 days in the future. Please verify data entry.`);
      } else if (d.getFullYear() < 2020) {
        flags.push(`INVALID PAST DATE (${label})`);
        flagColors.push(TEXT_COLORS.WARN);
        drafts.push(`${label} (${Utilities.formatDate(d, "GMT-5", "MM/dd/yy")}) is suspiciously old (pre-2020). Please verify data entry.`);
      }
    };

    let targetDateRaw = row[adapter.getIdx("Target Completion Date")];
    let targetDate = (targetDateRaw instanceof Date) ? targetDateRaw : new Date(targetDateRaw);
    checkBounds(targetDate, "Target Date");

    let cxSIdx = adapter.getIdx("CX_START");
    let cxEIdx = adapter.getIdx("CX_COMPLETE");
    let cxStartObj = null, cxCompleteObj = null;
    if (cxSIdx > -1) {
      let d = row[cxSIdx];
      cxStartObj = (d instanceof Date) ? d : new Date(d);
    }
    if (cxEIdx > -1) {
      let d = row[cxEIdx];
      cxCompleteObj = (d instanceof Date) ? d : new Date(d);
    }

    if (cxStartObj && cxCompleteObj && !isNaN(cxStartObj.getTime()) && !isNaN(cxCompleteObj.getTime()) && cxStartObj.getTime() > cxCompleteObj.getTime()) {
      flags.push("INVALID DATE CHRONOLOGY");
      flagColors.push(TEXT_COLORS.WARN);
      drafts.push(`CX chronology is invalid. CX Start (${Utilities.formatDate(cxStartObj, "GMT-5", "MM/dd/yy")}) is after CX Complete (${Utilities.formatDate(cxCompleteObj, "GMT-5", "MM/dd/yy")}).`);
    }

    if (cxStartObj) checkBounds(cxStartObj, "CX Start");
    if (cxCompleteObj) checkBounds(cxCompleteObj, "CX Complete");

    return { flags, drafts, flagColors, hCols };
  }

  /**
   * Internal: Reconcile BOM & Production
   */
  function _reconcileBOM(row, adapter, refData, metrics, rowState) {
    let flags = [], drafts = [], flagColors = [], hCols = { mismatch: [], warn: [] };

    if (refData && rowState !== "COMPLETE" && rowState !== "OFS") {
       const checkPhase = (name, vBom, rBom, vDaily, vTot, bomColName, totColName) => {
           // A. MISSING BOM: Activity exists but QB is 0
           if (rBom === 0 && (vDaily > 0 || vTot > 0)) {
               flags.push("MISSING BOM");
               flagColors.push(TEXT_COLORS.WARN);
               drafts.push(`Action: Update QuickBase BOM. ${name} activity reported but ${name} BOM is 0 in QuickBase.`);
               hCols.mismatch.push(totColName);
           } 
           // B. BOM DISCREPANCY: Input mismatch
           else if (rBom > 0 && vBom > 0 && vBom !== rBom) {
               flags.push("BOM DISCREPANCY");
               flagColors.push(TEXT_COLORS.MISMATCH);
               drafts.push(`Action: Verify BOM Data. ${name} BOM mismatch found: Vendor reported ${vBom} vs QuickBase ${rBom}.`);
               hCols.mismatch.push(bomColName);
           }
           
           // C. BOM OVERRUN: Production exceeds BOM
           if (vTot > 0 && rBom > 0 && (vTot / rBom) > OVERAGE_THRESHOLD) {
               flags.push("BOM OVERRUN");
               flagColors.push(TEXT_COLORS.WARN);
               drafts.push(`Action: Audit Production. ${name} production is at ${Math.round((vTot/rBom)*100)}% of BOM (${vTot} of ${rBom}).`);
               hCols.warn.push(totColName, bomColName);
           }
       };
       
       const _ugBom  = refData.ugBOM  > 0 ? refData.ugBOM  : (metrics.bomUG  > 0 ? metrics.bomUG  : 0);
       const _aeBom  = refData.aeBOM  > 0 ? refData.aeBOM  : (metrics.bomAE  > 0 ? metrics.bomAE  : 0);
       const _fibBom = refData.fibBOM > 0 ? refData.fibBOM : (metrics.bomFIB > 0 ? metrics.bomFIB : 0);
       const _napBom = refData.napBOM > 0 ? refData.napBOM : (metrics.bomNAP > 0 ? metrics.bomNAP : 0);

       const allBomZero = _ugBom === 0 && _aeBom === 0 && _fibBom === 0 && _napBom === 0;

       if (allBomZero) {
           if (metrics.dailyUG > 0 || metrics.dailyAE > 0 || metrics.dailyFIB > 0 || metrics.dailyNAP > 0) {
               flags.push("MISSING BOM");
               flagColors.push(TEXT_COLORS.WARN);
               drafts.push("Active progress reported but all BOM quantities are 0. Please verify BOM data in QuickBase.");
           }
       } else {
           checkPhase("Underground", metrics.bomUG,  _ugBom,  metrics.dailyUG,  metrics.totalUG,  "UG BOM Quantity",     "Total UG Footage Completed");
           checkPhase("Strand",      metrics.bomAE,  _aeBom,  metrics.dailyAE,  metrics.totalAE,  "Strand BOM Quantity", "Total Strand Footage Complete?");
           checkPhase("Fiber",       metrics.bomFIB, _fibBom, metrics.dailyFIB, metrics.totalFIB, "Fiber BOM Quantity",  "Total Fiber Footage Complete");
           checkPhase("NAP",         metrics.bomNAP, _napBom, metrics.dailyNAP, metrics.totalNAP, "NAP/Encl. BOM Qty.", "Total NAPs Completed");
       }
    }

    return { flags, drafts, flagColors, hCols };
  }

  /**
   * Internal: Reconcile Dependencies (Light Upstream/Downstream)
   */
  function _reconcileDependencies(row, adapter, refData, options) {
    let flags = [], drafts = [], flagColors = [];
    const refDict = options.refDict || {};
    const lightToCab = row[adapter.getIdx("Light to Cabinets")] === true;
    const rowState = options.rowState;

    const parseFdhList = (value) => String(value || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const isTruthyTransport = (value) => {
        let normalized = String(value || "").trim().toLowerCase();
        return normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "y";
    };
    const refIsLit = (entry) => {
        if (!entry) return false;
        let refStatus = String(entry.status || "").toLowerCase();
        let refStage = String(entry.stage || "").toLowerCase();
        return refStatus.includes("complete") || refStage.includes("ofs");
    };

    if (refData) {
        let howFed = parseFdhList((refData.qbRef && refData.qbRef.howFed) || refData.howFed);
        let whatFeeds = parseFdhList((refData.qbRef && refData.qbRef.whatFeeds) || refData.whatFeeds);
        let isTransportReady = isTruthyTransport((refData.qbRef && refData.qbRef.transport) || refData.transport);
        let isLit = lightToCab || rowState === "COMPLETE" || rowState === "OFS";

        if (howFed.length > 0 && !isTransportReady) {
            let blockingUpstream = howFed.find(upstreamId => !refIsLit(refDict[upstreamId]));
            if (blockingUpstream) {
                flags.push("BLOCKED BY UPSTREAM");
                flagColors.push(TEXT_COLORS.WARN);
                drafts.push(`Waiting on light from upstream (${blockingUpstream}). Transport is not in place to override.`);
            }
        }

        if (whatFeeds.length > 0 && !isLit) {
            let delayedDownstream = whatFeeds.find(downstreamId => {
                let downstreamRef = refDict[downstreamId];
                let downstreamTransport = isTruthyTransport((downstreamRef && downstreamRef.qbRef && downstreamRef.qbRef.transport) || (downstreamRef && downstreamTransport));
                return !downstreamTransport;
            });
            if (delayedDownstream) {
                flags.push("DELAYING DOWNSTREAM");
                flagColors.push(TEXT_COLORS.WARN);
                drafts.push(`This FDH feeds ${delayedDownstream}, which does not have transport. Prioritize lighting.`);
            }
        }

        if (howFed.length > 0 && isTransportReady && !isLit) {
            flags.push("TRANSPORT OVERRIDE");
            flagColors.push(TEXT_COLORS.MAGIC);
            drafts.push(`Transport is available. This FDH can be lit independently of ${howFed[0]}.`);
        }
    }

    return { flags, drafts, flagColors };
  }

  /**
   * Internal: Reconcile Tracker Variance
   */
  function _reconcileTracker(row, adapter, refData, metrics, options) {
    let flags = [], drafts = [], flagColors = [], hCols = { mismatch: [] };
    const vTracker = options.vTracker;
    const rowState = options.rowState;

    if (vTracker && rowState !== "COMPLETE") {
       const evalTrackerPhase = (phaseName, totalColName, bomVal, repTotal, trkPct) => {
          if (!trkPct || trkPct <= 0 || !bomVal || bomVal <= 0) return;
          let repPct = repTotal / bomVal;
          let diff = trkPct - repPct;

          if (diff > 0.05) { 
              flags.push(`TRACKER UPDATE (${phaseName})`);
              flagColors.push(TEXT_COLORS.MAGIC); 
              drafts.push(`Tracker shows ${phaseName} higher at ${Math.round(trkPct*100)}%. Suggested: Update to match their tracker.`);
          } else if (diff < -0.15) { 
              flags.push(`TRACKER VARIANCE (${phaseName})`);
              flagColors.push(TEXT_COLORS.MISMATCH); 
              drafts.push(`Daily reports ${Math.round(repPct*100)}% ${phaseName}, but Tracker shows ${Math.round(trkPct*100)}%. Check if tracker is lagging.`);
              hCols.mismatch.push(totalColName);
          }
       };

       if (refData) {
           evalTrackerPhase("UG", "Total UG Footage Completed", refData.ugBOM, metrics.totalUG, vTracker.ugPct);
           evalTrackerPhase("AE", "Total Strand Footage Complete?", refData.aeBOM, metrics.totalAE, vTracker.aePct);
           evalTrackerPhase("FIB", "Total Fiber Footage Complete", refData.fibBOM, metrics.totalFIB, vTracker.fibPct);
           evalTrackerPhase("NAP", "Total NAPs Completed", refData.napBOM, metrics.totalNAP, vTracker.napPct);
       }
    }

    return { flags, drafts, flagColors, hCols };
  }

  // --- INFERENCE LOGIC (Moved from 01_Engine_Archive.js) ---

  function classifyInferredReviewState(stage, status) {
    let stageText = String(stage || "").trim();
    let statusText = String(status || "").trim();
    let st = stageText.toLowerCase();
    let stat = statusText.toLowerCase();

    if (st.includes("permit") || st.includes("pre-con") || st.includes("vendor assignment") || stat.includes("permit")) {
      let normalizedStage = stageText || "Pre-Construction";
      if (st.includes("vendor assignment")) normalizedStage = "Vendor Assignment";
      return { stage: normalizedStage, status: statusText || "Permitting", flag: "INFERRED: PRE-CON", bucket: "precon" };
    }
    if ((st.includes("field cx") || st.includes("construction")) && stat.includes("splicing only")) {
      return { stage: stageText || "Field CX", status: statusText || "Splicing Only", flag: "INFERRED: SPLICING ONLY", bucket: "field" };
    }
    if (st.includes("field cx") || st.includes("construction") || stat.includes("construction") || stat.includes("in progress")) {
      return { stage: stageText || "Field CX", status: statusText || "Construction", flag: "INFERRED: FIELD CX", bucket: "field" };
    }
    if (st.includes("hold") || stat.includes("hold")) {
      return { stage: stageText || "On Hold", status: statusText || "Hold", flag: "INFERRED STATE", bucket: "hold" };
    }
    if (st.includes("ofs") || stat.includes("oos")) {
      return { stage: stageText || "OFS (Inferred)", status: statusText || "OOS", flag: "INFERRED STATE", bucket: "ofs" };
    }

    return { stage: stageText || "-", status: statusText || "-", flag: "", bucket: "" };
  }

  function resolveMissingReferenceState(context) {
    let currentRowHasActivity = (context.dailyUG > 0 || context.dailyAE > 0 || context.dailyFIB > 0 || context.dailyNAP > 0);
    let currentRowHasCivilActivity = (context.dailyUG > 0 || context.dailyAE > 0 || context.dailyFIB > 0);
    let currentRowHasSpliceActivity = (context.dailyNAP > 0 || context.splicingCrews > 0);
    let recentSignals = getRecentInferenceSignals(context.fdhId, context.rowDate, context.inferenceHistoryContext, 14);
    let hasRecentActivity = currentRowHasActivity || recentSignals.hasRecentActivity;
    let commentText = [String(context.vendorComment || "").toLowerCase(), recentSignals.latestComment].filter(Boolean).join(" ");
    let hasTrackerEvidence = !!(context.vTracker && (
      (context.vTracker.ugPct && context.vTracker.ugPct > 0) ||
      (context.vTracker.aePct && context.vTracker.aePct > 0) ||
      (context.vTracker.fibPct && context.vTracker.fibPct > 0) ||
      (context.vTracker.napPct && context.vTracker.napPct > 0)
    ));

    let phases = [
      { tot: context.totalUG, bom: context.vendorBOMUG },
      { tot: context.totalAE, bom: context.vendorBOMAE },
      { tot: context.totalFIB, bom: context.vendorBOMFIB },
      { tot: context.totalNAP, bom: context.vendorBOMNAP }
    ];
    let activePhases = phases.filter(p => p.bom > 0);
    let completionAvg = activePhases.length > 0
      ? activePhases.reduce((acc, p) => acc + Math.min(1, p.tot / p.bom), 0) / activePhases.length
      : 0;
    let hasBOM = activePhases.length > 0;

    let workKeywords = ["drilling", "pulling", "splicing", "placing", "trenching", "boring", "pothole", "crew", "crews", "production", "fiber", "strand", "ug"];
    let spliceKeywords = ["splice", "splicing", "splice only", "spliced", "nap", "enclosure"];
    let doneKeywords = ["done", "complete", "completed", "turned over", "spliced out", "ready", "lit"];
    let preConKeywords = ["permit", "design", "waiting", "locates", "walk", "review", "engineering", "approval"];
    let holdKeywords = ["hold", "stop", "blocked", "standby", "canceled", "cancelled", "paused"];
    let signalSummary = `[Signals: CUR:${currentRowHasActivity ? 'Y' : 'N'}, REC:${recentSignals.hasRecentActivity ? 'Y' : 'N'}@${recentSignals.recentWindowLabel}, DAYS:${recentSignals.recentActiveDays}, TRK:${hasTrackerEvidence ? 'Y' : 'N'}, CMP:${Math.round(completionAvg * 100)}%, LIGHT:${context.lightToCab ? 'Y' : 'N'}]`;
    let trackerShowsSpliceOnly = !!(context.vTracker && (context.vTracker.napPct > 0) && !(context.vTracker.ugPct > 0 || context.vTracker.aePct > 0 || context.vTracker.fibPct > 0));
    let commentShowsSpliceOnly = spliceKeywords.some(w => commentText.includes(w));

    if (holdKeywords.some(w => commentText.includes(w)) && !currentRowHasActivity) {
      return {
        stage: "On Hold",
        status: "Hold",
        flag: "INFERRED STATE",
        flagColor: TEXT_COLORS.WARN,
        note: `Action: Add Project to QuickBase. Missing from reference data; inferred as On Hold from explicit hold language in recent reporting. Diagnostic Data: ${signalSummary}`
      };
    }

    if ((currentRowHasSpliceActivity || trackerShowsSpliceOnly || commentShowsSpliceOnly) && !currentRowHasCivilActivity) {
      return {
        stage: "Field CX",
        status: "Splicing Only",
        flag: "INFERRED STATE",
        flagColor: TEXT_COLORS.DONE,
        note: `Action: Add Project to QuickBase. Missing from reference data; inferred as Splicing Only based on vendor reported activity. Diagnostic Data: ${signalSummary}`
      };
    }

    if (currentRowHasActivity || hasTrackerEvidence || recentSignals.hasRecentActivity || (completionAvg > 0 && completionAvg < 0.98)) {
      return {
        stage: "Field CX",
        status: "Construction",
        flag: "INFERRED STATE",
        flagColor: TEXT_COLORS.DONE,
        note: `Action: Add Project to QuickBase. Missing from reference data; inferred as active Field CX based on production signals. Diagnostic Data: ${signalSummary}`
      };
    }

    if (context.lightToCab && !hasRecentActivity) {
      return {
        stage: "OFS (Inferred)",
        status: "OOS",
        flag: "INFERRED STATE",
        flagColor: TEXT_COLORS.DONE,
        note: `Action: Add Project to QuickBase. Missing from reference data; inferred as OFS based on light-to-cabinets confirmation. Diagnostic Data: ${signalSummary}`
      };
    }

    let lastKnown = classifyInferredReviewState(
      context.lastKnownState && context.lastKnownState.stage,
      context.lastKnownState && context.lastKnownState.status
    );
    if (lastKnown.stage !== "-" || lastKnown.status !== "-") {
      return {
        stage: lastKnown.stage,
        status: lastKnown.status,
        flag: lastKnown.flag,
        flagColor: TEXT_COLORS.MAGIC,
        note: `Action: Add Project to QuickBase. Missing from reference data; using last known Daily Review state (${lastKnown.stage} | ${lastKnown.status}). Diagnostic Data: ${signalSummary}`
      };
    }

    if ((completionAvg >= 0.98 || doneKeywords.some(w => commentText.includes(w))) && !hasRecentActivity) {
      return {
        stage: "OFS (Inferred)",
        status: "OOS",
        flag: "INFERRED STATE",
        flagColor: TEXT_COLORS.DONE,
        note: `Action: Add Project to QuickBase. Missing from reference data; inferred as OFS based on strong completion signals. Diagnostic Data: ${signalSummary}`
      };
    }

    if (preConKeywords.some(w => commentText.includes(w)) && !hasRecentActivity && !context.lightToCab) {
      return {
        stage: "Pre-Construction",
        status: "Permitting",
        flag: "INFERRED STATE",
        flagColor: TEXT_COLORS.DONE,
        note: `Action: Add Project to QuickBase. Missing from reference data; inferred as Pre-Construction based on planning signals. Diagnostic Data: ${signalSummary}`
      };
    }

    return {
      stage: "-",
      status: "-",
      flag: "INFERRED STATE",
      flagColor: TEXT_COLORS.WARN,
      note: `Action: Add Project to QuickBase. Missing from reference data; could not confidently infer state. Diagnostic Data: ${signalSummary}`
    };
  }

  function getRecentInferenceSignals(fdhId, rowDate, inferenceHistoryContext, lookbackDays) {
    let windowDays = Number(lookbackDays) || 14;
    let result = {
      hasRecentActivity: false,
      recentActiveDays: 0,
      recentWindowLabel: "0d",
      recentTotals: { ug: 0, ae: 0, fib: 0, nap: 0 },
      latestComment: ""
    };
    if (!fdhId || !rowDate || !inferenceHistoryContext || !inferenceHistoryContext[fdhId]) return result;

    let anchorDate = rowDate instanceof Date ? rowDate : new Date(rowDate);
    if (isNaN(anchorDate.getTime())) return result;
    let anchor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    let startTs = anchor.getTime() - ((windowDays - 1) * 86400000);
    let entries = inferenceHistoryContext[fdhId];
    let commentEntries = [];

    entries.forEach(function(entry) {
      if (entry.ts < startTs || entry.ts > anchor.getTime()) return;
      let entryHasActivity = entry.dailyUG > 0 || entry.dailyAE > 0 || entry.dailyFIB > 0 || entry.dailyNAP > 0;
      if (entryHasActivity) {
        result.hasRecentActivity = true;
        result.recentActiveDays++;
        result.recentTotals.ug += entry.dailyUG;
        result.recentTotals.ae += entry.dailyAE;
        result.recentTotals.fib += entry.dailyFIB;
        result.recentTotals.nap += entry.dailyNAP;
      }
      if (entry.comment) commentEntries.push(entry.comment);
    });

    if (commentEntries.length > 0) result.latestComment = commentEntries[commentEntries.length - 1];
    result.recentWindowLabel = `${windowDays}d`;
    return result;
  }

  /**
   * Scans the existing 3-Daily_Review sheet and returns the last known non-empty
   * CX dates plus a reliable Stage / Status snapshot per FDH. Used as Tier-2
   * fallback when QB reference data disappears.
   */
  function buildCxLkvDictionary(mirrorSheet) {
    let lkvDict = {};
    if (!mirrorSheet) return lkvDict;
    let mData = mirrorSheet.getDataRange().getValues();
    if (mData.length < 2) return lkvDict;
    let mHeaders = mData[0];
    let fdhCol = mHeaders.indexOf("FDH Engineering ID");
    let cxSCol = mHeaders.indexOf("CX Start");
    let cxECol = mHeaders.indexOf("CX Complete");
    let stageCol = mHeaders.indexOf("Stage");
    let statusCol = mHeaders.indexOf("Status");
    let flagsCol = mHeaders.indexOf("Health Flags");
    if (fdhCol < 0) return lkvDict;
    const _fmt = (v) => (v instanceof Date) ? Utilities.formatDate(v, "GMT-5", "MM/dd/yy") : (String(v || "").trim());

    for (let r = 1; r < mData.length; r++) {
      let fdh = _normalizeFdhId(mData[r][fdhCol]);
      if (!fdh) continue;
      if (!lkvDict[fdh]) lkvDict[fdh] = {};
      let cs = cxSCol > -1 ? _fmt(mData[r][cxSCol]) : "";
      let ce = cxECol > -1 ? _fmt(mData[r][cxECol]) : "";
      let stage = stageCol > -1 ? String(mData[r][stageCol] || "").trim() : "";
      let status = statusCol > -1 ? String(mData[r][statusCol] || "").trim() : "";
      let flagsText = flagsCol > -1 ? String(mData[r][flagsCol] || "") : "";
      let hasStaleStatus = /STATUS MISMATCH|MISSING QB STATUS|ADMIN: REFRESH REF DATA/i.test(flagsText);
      if (cs) lkvDict[fdh].cxStart = cs;
      if (ce) lkvDict[fdh].cxComplete = ce;
      if (!hasStaleStatus && stage && stage !== "-") lkvDict[fdh].stage = stage;
      if (!hasStaleStatus && status && status !== "-") lkvDict[fdh].status = status;
    }
    return lkvDict;
  }

  /**
   * Scans Master Archive rows for a given FDH to infer CX Start and CX Complete.
   * CX Start: first date locates called in, or first date any phase footage > 0.
   * CX Complete: latest date when all active phases reached their BOM.
   */
  function inferCxDatesFromHistory(fdh, histData, histHeaders) {
    let fdhIdx    = histHeaders.indexOf("FDH Engineering ID");
    let dateIdx   = histHeaders.indexOf("Date");
    let locIdx    = histHeaders.indexOf("Locates Called In");
    let lightIdx  = histHeaders.indexOf("Light to Cabinets");
    let ugTotIdx  = histHeaders.indexOf("Total UG Footage Completed");
    let aeTotIdx  = histHeaders.indexOf("Total Strand Footage Complete?");
    let fibTotIdx = histHeaders.indexOf("Total Fiber Footage Complete");
    let napTotIdx = histHeaders.indexOf("Total NAPs Completed");
    let ugBomIdx  = histHeaders.indexOf("UG BOM Quantity");
    let aeBomIdx  = histHeaders.indexOf("Strand BOM Quantity");
    let fibBomIdx = histHeaders.indexOf("Fiber BOM Quantity");
    let napBomIdx = histHeaders.indexOf("NAP/Encl. BOM Qty.");

    let fdhRows = [];
    for (let i = 1; i < histData.length; i++) {
      if (String(histData[i][fdhIdx] || "").toUpperCase().trim() === fdh) fdhRows.push(histData[i]);
    }
    if (fdhRows.length === 0) return { cxStart: "", cxComplete: "", startSource: "", endSource: "" };

    fdhRows.sort((a, b) => new Date(a[dateIdx]) - new Date(b[dateIdx]));

    const fmtDate = (d) => {
      if (!d) return "";
      let obj = (d instanceof Date) ? d : new Date(d);
      if (isNaN(obj.getTime())) return "";
      return Utilities.formatDate(obj, "GMT-5", "MM/dd/yy");
    };

    let cxStart = "", startSource = "";
    let cxComplete = "", endSource = "";
    let ugMaxBom = 0, aeMaxBom = 0, fibMaxBom = 0, napMaxBom = 0;
    let ugDone = false, aeDone = false, fibDone = false, napDone = false;

    let firstLightDateStr = "", firstLightDateObj = null;
    let firstFibDoneDateStr = "", firstFibDoneDateObj = null;

    for (let r of fdhRows) {
      let rawDate = r[dateIdx];
      let dateObj = (rawDate instanceof Date) ? rawDate : new Date(rawDate);
      let dateStr = fmtDate(rawDate);
      if (!dateStr || isNaN(dateObj.getTime())) continue;

      // CX Start: locates first, then first any-phase activity
      if (!cxStart) {
        if (locIdx > -1 && (r[locIdx] === true || String(r[locIdx]).toLowerCase() === "true")) {
          cxStart = dateStr; startSource = "locates";
        } else {
          let hasProd = (Number(r[ugTotIdx]) || 0) > 0 || (Number(r[aeTotIdx]) || 0) > 0 || (Number(r[fibTotIdx]) || 0) > 0 || (Number(r[napTotIdx]) || 0) > 0;
          if (hasProd) { cxStart = dateStr; startSource = "first_prod"; }
        }
      }

      // Track BOM completions
      if (ugBomIdx > -1)  ugMaxBom  = Math.max(ugMaxBom,  Number(r[ugBomIdx])  || 0);
      if (aeBomIdx > -1)  aeMaxBom  = Math.max(aeMaxBom,  Number(r[aeBomIdx])  || 0);
      if (fibBomIdx > -1) fibMaxBom = Math.max(fibMaxBom, Number(r[fibBomIdx]) || 0);
      if (napBomIdx > -1) napMaxBom = Math.max(napMaxBom, Number(r[napBomIdx]) || 0);

      if (!ugDone  && ugMaxBom  > 0 && (Number(r[ugTotIdx])  || 0) >= ugMaxBom)  ugDone  = true;
      if (!aeDone  && aeMaxBom  > 0 && (Number(r[aeTotIdx])  || 0) >= aeMaxBom)  aeDone  = true;
      if (!fibDone && fibMaxBom > 0 && (Number(r[fibTotIdx]) || 0) >= fibMaxBom) {
        fibDone = true;
        firstFibDoneDateStr = dateStr;
        firstFibDoneDateObj = dateObj;
      }
      if (!napDone && napMaxBom > 0 && (Number(r[napTotIdx]) || 0) >= napMaxBom) napDone = true;

      // Track first light
      if (!firstLightDateObj && lightIdx > -1 && (r[lightIdx] === true || String(r[lightIdx]).toLowerCase() === "true")) {
        firstLightDateStr = dateStr;
        firstLightDateObj = dateObj;
      }

      // CX Complete: all active phases done
      let allActiveDone = true;
      if (ugMaxBom > 0 && !ugDone)   allActiveDone = false;
      if (aeMaxBom > 0 && !aeDone)   allActiveDone = false;
      if (fibMaxBom > 0 && !fibDone) allActiveDone = false;
      if (napMaxBom > 0 && !napDone) allActiveDone = false;

      if (allActiveDone && !cxComplete && (ugMaxBom > 0 || aeMaxBom > 0 || fibMaxBom > 0 || napMaxBom > 0)) {
        cxComplete = dateStr; endSource = "prod_complete";
      }
    }

    // Heuristic: if fiber is done and we have light, use the later of the two as CX Complete
    if (!cxComplete && fibDone && firstLightDateObj) {
      if (!firstFibDoneDateObj || firstLightDateObj.getTime() > firstFibDoneDateObj.getTime()) {
        cxComplete = firstLightDateStr; endSource = "light_override";
      } else {
        cxComplete = firstFibDoneDateStr; endSource = "fiber_done_override";
      }
    }

    return { cxStart, cxComplete, startSource, endSource };
  }

  /**
   * Filters out risks that are irrelevant for finished or OFS projects.
   */
  function filterIrrelevantRisks(flags, stage, status) {
    if (!flags) return "";
    const stageStr = (stage || "").toUpperCase();
    const statusStr = (status || "").toUpperCase();
    const isFinished = stageStr.includes("OFS") || stageStr.includes("COMPLETE") || statusStr.includes("COMPLETE") || statusStr.includes("OOS");
    if (!isFinished) return flags;

    const irrelevantRisks = ["CHECK CROSSINGS", "CHECK BOM", "LIGHTING RISK", "STATUS MISMATCH", "PLEASE INPUT BOM", "HIGH UG VARIANCE", "HIGH STRAND VARIANCE", "HIGH FIBER VARIANCE", "MISSING BOM", "MISSING UG BOM", "MISSING STRAND BOM", "MISSING FIBER BOM", "MISSING SPLICING BOM", "POSSIBLE REROUTE", "BOM DISCREPANCY", "ADMIN: REFRESH REF DATA"];
    
    return flags.split("\n")
      .filter(function(line) {
        const upLine = String(line || "").toUpperCase();
        return !irrelevantRisks.some(function(risk) { return upLine.includes(risk); });
      })
      .join("\n").trim();
  }

  return {
    reconcile: reconcile,
    resolveMissingReferenceState: resolveMissingReferenceState,
    classifyInferredReviewState: classifyInferredReviewState,
    getRecentInferenceSignals: getRecentInferenceSignals,
    buildCxLkvDictionary: buildCxLkvDictionary,
    inferCxDatesFromHistory: inferCxDatesFromHistory,
    filterIrrelevantRisks: filterIrrelevantRisks
  };
})();

