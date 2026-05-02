/**
 * FILE: 01_Engine_Visibility.js
 * PURPOSE: Centralized Portfolio Eligibility and Ghost Row Generation
 * 
 * This engine serves as the single source of truth for:
 * 1. Portfolio Inclusion (Is the project active in the app?)
 * 2. Reporting Expectations (Should it have reported today?)
 * 3. Ghost Record Synthesis (Missing report data assembly)
 */

var VisibilityEngine = (function() {

  // --- PRIVATE HELPERS ---

  /**
   * Internal date parser with support for ISO strings and MDY formats
   */
  function _parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    const raw = String(value || '').trim();
    if (!raw || raw === '-' || raw.toLowerCase() === 'unknown') return null;

    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    match = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));

    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Normalizes a date to local midnight
   */
  function _normalizeDate(dateLike) {
    const parsed = _parseDate(dateLike);
    if (!parsed) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  }

  /**
   * Logic for 1-month-plus-7-day grace window after OFS/Complete
   */
  function _getGraceCutoff(ofsDateLike) {
    const ofsDate = _normalizeDate(ofsDateLike);
    if (!ofsDate) return null;
    return new Date(ofsDate.getFullYear(), ofsDate.getMonth() + 1, 7, 23, 59, 59, 999);
  }

  /**
   * Adds business days (skipping Sat/Sun)
   */
  function _addBusinessDays(dateLike, daysToAdd) {
    const startDate = _normalizeDate(dateLike);
    const count = Number(daysToAdd) || 0;
    if (!startDate || count <= 0) return startDate;

    const cursor = new Date(startDate.getTime());
    let remaining = count;
    while (remaining > 0) {
      cursor.setDate(cursor.getDate() + 1);
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) remaining--;
    }
    return cursor;
  }

  // --- PUBLIC INTERFACE ---

  return {
    /**
     * Is the project eligible to appear in the active portfolio?
     * @param {Object} input - { stage, status, vendor, flags, primaryOfsDate, fallbackOfsDate, cxStart, referenceDate, hasHistory }
     */
    getPortfolioStatus: function(input) {
      input = input || {};
      const today = _normalizeDate(input.referenceDate || new Date());
      
      const stageStr = String(input.stage || '').toUpperCase();
      const statusStr = String(input.status || '').toUpperCase();
      const flagsStr = String(input.flags || '').toUpperCase();
      const vendorName = String(input.vendor || '').trim();
      const hasHistory = !!input.hasHistory;
      const hasVendor = vendorName.length > 0;
      const isApproved = statusStr.includes('APPROV');
      
      const isCanceled = (
        statusStr.includes('CANCEL') ||
        stageStr.includes('CANCEL') ||
        statusStr.includes('REMOVED FROM QB')
      );
      const isHold = (
        statusStr.includes('HOLD') ||
        stageStr.includes('HOLD')
      );
      const isOfsState = (
        stageStr.includes('OFS') ||
        stageStr.includes('OPEN FOR SALE') ||
        statusStr.includes('OFS') ||
        statusStr.includes('OPEN FOR SALE') ||
        statusStr.includes('OOS') ||
        flagsStr.includes('LIKELY OFS')
      );
      const isCompleteState = statusStr.includes('COMPLETE') || stageStr.includes('COMPLETE');
      const isTerminalWithGrace = isOfsState || isCompleteState;

      // 1. TERMINAL GRACE CALCULATION
      const graceSourceDate = _normalizeDate(input.primaryOfsDate) ||
        _normalizeDate(input.fallbackOfsDate) ||
        _normalizeDate(input.reportDate);
      const graceUntil = _getGraceCutoff(graceSourceDate);

      // 2. TIMING ANCHORS
      const cxStartDate = _normalizeDate(input.cxStart);
      const anchorDate = cxStartDate || _normalizeDate(input.targetDate) || _normalizeDate(input.primaryOfsDate) || _normalizeDate(input.fallbackOfsDate);
      const reportExpectationDate = _addBusinessDays(cxStartDate, 1);
      const isPastReportExpectation = reportExpectationDate ? (reportExpectationDate.getTime() <= today.getTime()) : false;

      // --- ELIGIBILITY DECISIONS ---

      // 1. Canceled
      if (isCanceled) {
        return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-canceled', graceUntil: null, isTerminalGraceOnly: false };
      }

      // 2. Terminal (OFS/Complete)
      if (isTerminalWithGrace) {
        if (!graceUntil) {
          return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-terminal-no-ofs-date', graceUntil: null, isTerminalGraceOnly: true };
        }
        if (today.getTime() <= graceUntil.getTime()) {
          return { includeInPortfolio: true, expectDailyReport: false, reason: 'terminal-grace-window', graceUntil: graceUntil, isTerminalGraceOnly: true };
        }
        return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-post-grace', graceUntil: graceUntil, isTerminalGraceOnly: true };
      }

      // 3. Active With History
      if (hasHistory) {
        const expectHistoryReport = !isHold && (reportExpectationDate ? isPastReportExpectation : true);
        return {
          includeInPortfolio: true,
          expectDailyReport: expectHistoryReport,
          reason: isHold ? 'active-hold' : (expectHistoryReport ? 'reported-history' : 'reported-start-grace'),
          graceUntil: null,
          isTerminalGraceOnly: false
        };
      }

      // 4. No Vendor / Hold (no history)
      if (!hasVendor) return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-no-vendor', graceUntil: null, isTerminalGraceOnly: false };
      if (isHold) return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-hold-no-history', graceUntil: null, isTerminalGraceOnly: false };

      // 5. Early Stage (SOW/Bid/Design)
      const isSowOrDesign = stageStr.includes('SOW') || stageStr.includes('DESIGN') || stageStr.includes('BID');
      if (isSowOrDesign) return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-early-stage', graceUntil: null, isTerminalGraceOnly: false };

      // 6. Permitting
      if (stageStr.includes('PERMIT')) {
        if (!isApproved) return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-unapproved-permitting', graceUntil: null, isTerminalGraceOnly: false };
        
        const inFutureWindow = !!(anchorDate && anchorDate.getTime() > today.getTime());
        if (inFutureWindow) {
          const horizonDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
          const withinHorizon = !!(anchorDate && anchorDate.getTime() <= horizonDate.getTime());
          if (withinHorizon) return { includeInPortfolio: true, expectDailyReport: false, reason: 'approved-upcoming-60d', graceUntil: null, isTerminalGraceOnly: false };
          return { includeInPortfolio: false, expectDailyReport: false, reason: 'excluded-outside-window', graceUntil: null, isTerminalGraceOnly: false };
        }
      }

      // 7. Active Default (Construction / Field CX)
      const expectReport = reportExpectationDate ? isPastReportExpectation : true;
      return {
        includeInPortfolio: true,
        expectDailyReport: expectReport,
        reason: expectReport
          ? 'active-default'
          : (cxStartDate && cxStartDate.getTime() > today.getTime() ? 'active-upcoming-start' : 'active-start-grace'),
        graceUntil: null,
        isTerminalGraceOnly: false
      };
    },

    /**
     * Calculates business days missed between last report and target date.
     * Implements Monday Carry logic.
     */
    calculateReportingLag: function(lastReportDate, targetDate) {
      const from = _normalizeDate(lastReportDate);
      const target = _normalizeDate(targetDate);
      if (!from || !target || target <= from) return { daysAgo: 0, isMondayCarry: false };

      let cursor = new Date(from.getTime());
      cursor.setDate(cursor.getDate() + 1);

      let missed = 0;
      while (cursor <= target) {
        const dow = cursor.getDay();
        const isWeekday = dow !== 0 && dow !== 6;
        const isMondayCarryMonday = (cursor.getTime() === target.getTime() && dow === 1);
        if (isWeekday && !isMondayCarryMonday) missed++;
        cursor.setDate(cursor.getDate() + 1);
      }

      const isMondayCarry = (target.getDay() === 1 && missed <= 1);
      return { daysAgo: missed, isMondayCarry: isMondayCarry };
    },

    /**
     * Standardized Ghost Row Synthesis.
     * Combines eligibility, lag, handoff, and metrics.
     * @param {Object} input - { fdhId, refData, latestReport, targetDate, hasHandoff, handoffDetail, cdSummary, projectVendors, cxDates, benchmarks, xingString, adminGapsStr, diagnostics }
     */
    generateGhostRow: function(input) {
      const { 
        fdhId, refData, latestReport, targetDate, 
        hasHandoff, handoffDetail, cdSummary, 
        projectVendors, cxDates, benchmarks, 
        xingString, adminGapsStr, diagnostics 
      } = input;

      const ref = refData || {};
      const targetDateObj = _normalizeDate(targetDate);
      const hasHistory = !!latestReport;

      const status = this.getPortfolioStatus({
        stage: ref.stage,
        status: ref.status,
        primaryOfsDate: ref.canonicalOfsDate || ref.forecastedOFS || "",
        cxStart: cxDates.cxStart,
        referenceDate: targetDateObj,
        hasHistory: hasHistory
      });

      // Exclusion guard (Handoff persistence allows inclusion even if technically excluded)
      if (!status.includeInPortfolio && !hasHandoff) return null;

      const ghostRow = {};
      const HISTORY_HEADERS = ["Date", "Contractor", "FDH Engineering ID", "Locates Called In", "Cabinets Set", "Light to Cabinets", "Target Completion Date", "Daily UG Footage", "Total UG Footage Completed", "UG BOM Quantity", "UG Complete?", "Daily Strand Footage", "Total Strand Footage Complete?", "Strand BOM Quantity", "Strand Complete?", "Daily Fiber Footage", "Total Fiber Footage Complete", "Fiber BOM Quantity", "Fiber Complete?", "Daily NAPs/Encl. Completed", "Total NAPs Completed", "NAP/Encl. BOM Qty.", "NAPs/Encl. Complete?", "Drills", "Missles", "AE Crews", "Fiber Pulling Crews", "Splicing Crews", "Vendor Comment", "BSLs", "Budget OFS", "CX Start", "CX Complete"];

      // 1. Base ID and reference fields
      ghostRow["Date"]               = targetDateObj;
      ghostRow["FDH Engineering ID"] = fdhId;
      ghostRow["Contractor"]         = ref.vendor || "-";
      ghostRow["City"]               = ref.city || "-";
      ghostRow["Stage"]              = ref.stage || "-";
      ghostRow["Status"]             = ref.status || "-";
      ghostRow["BSLs"]               = ref.bsls || "-";
      ghostRow["Budget OFS"]         = ref.canonicalOfsDate || ref.forecastedOFS || "-";
      ghostRow["AllVendors"]         = (projectVendors || []).join(", ");
      ghostRow["CX Start"]           = cxDates.cxStart || "";
      ghostRow["CX Complete"]        = cxDates.cxComplete || "";
      ghostRow["CX Inferred"]        = cxDates.inferredLabel || "";
      ghostRow["Historical Milestones"] = benchmarks || "No history logged.";
      ghostRow["QB Context & Gaps"]  = adminGapsStr || "";
      ghostRow["CD Intelligence"]    = cdSummary || "";

      // 2. Lag and Production Logic
      let healthFlag = "STALE REPORT";
      let staleColor = "#64748b"; // GHOST
      let staleDraft = "";
      let vendorComment = "No update provided.";
      let summary = "Active project missing report.";

      if (hasHistory) {
        const lag = this.calculateReportingLag(latestReport.date, targetDateObj);
        const lRow = latestReport.data;
        summary = `Last Report: ${Utilities.formatDate(latestReport.date, "GMT-5", "MM/dd/yy")}`;
        
        // Sync production totals from latest report
        HISTORY_HEADERS.forEach((h, i) => {
          if (h.includes("Total") || h.includes("Quantity") || h.includes("Qty") || h.includes("Complete?")) {
            ghostRow[h] = lRow[i];
          } else if (!ghostRow[h]) {
            ghostRow[h] = (h.includes("Daily") || h.includes("Crews") || h === "Drills" || h === "Missles") ? 0 : (h === "Locates Called In" ? false : lRow[i]);
          }
        });

        if (lag.isMondayCarry) {
          healthFlag = "WEEKEND CARRY";
          staleDraft = `Weekend carry applied. Last report was ${Utilities.formatDate(latestReport.date, "GMT-5", "MM/dd/yy")}.`;
        } else if (lag.daysAgo >= 2) {
          healthFlag = `STALE REPORT (${lag.daysAgo} Business Days)`;
          staleColor = "#ef4444"; // WARN
          staleDraft = `Action: Contact Vendor. Active project with reporting history is missing a submission. Last report was ${lag.daysAgo} business day(s) ago.`;
        } else if (lag.daysAgo === 1) {
          healthFlag = "REPORT PENDING";
          staleDraft = `Latest report is from the previous business day. Expected update later today.`;
        } else {
          healthFlag = "CURRENT";
          staleColor = "#22c55e"; // DONE
          staleDraft = `Project is up to date based on the latest business day.`;
        }
        vendorComment = lRow[HISTORY_HEADERS.indexOf("Vendor Comment")] || vendorComment;
      } else {
        // No history case
        if (status.reason === 'approved-upcoming-60d' || status.reason === 'active-upcoming-start') {
          healthFlag = "UPCOMING START WINDOW";
          staleDraft = "Action: Monitor schedule. Approved project is inside the rolling 60-day horizon and not expected to report yet.";
          vendorComment = "Approved upcoming project inside the 60-day planning window.";
          summary = "Upcoming approved project inside 60-day planning window.";
        } else {
          healthFlag = "REPORT PENDING";
          staleDraft = "Action: Monitor start. First daily report is expected on the next business day after CX Start.";
          vendorComment = "First daily report is due on the next business day after CX Start.";
          summary = "Start-day grace window active. First report due next business day.";
        }
      }

      // 3. Merge with Diagnostics if available
      let flagColors = (healthFlag === "STALE REPORT" || healthFlag.includes("STALE REPORT") || healthFlag === "WEEKEND CARRY" || healthFlag === "REPORT PENDING") ? ["#64748b"] : [staleColor];
      if (diagnostics && healthFlag !== "CURRENT") {
        if (diagnostics.flags && diagnostics.flags !== "No Anomalies" && diagnostics.flags !== "") {
          healthFlag = healthFlag + "\n" + diagnostics.flags;
        }
        if (diagnostics.draft) {
          staleDraft = diagnostics.draft + "\n" + staleDraft;
        }
        if (diagnostics.flagColors && diagnostics.flagColors.length > 0) {
            flagColors = [...flagColors, ...diagnostics.flagColors];
        }
      }

      // 4. Handoff Overlays
      if (hasHandoff) {
        let handoffFlag = "HANDOFF";
        const handoffMatch = String(benchmarks || "").match(/(\d{2}\/\d{2}\/\d{2}): HANDOFF: (.*)/);
        if (handoffMatch) {
          const dateParts = handoffMatch[1].split('/');
          const mmDd = (dateParts.length >= 2) ? (dateParts[0] + '/' + dateParts[1]) : handoffMatch[1];
          handoffFlag = `HANDOFF (${mmDd})`;
        }
        
        healthFlag = (healthFlag === "CURRENT" || healthFlag === "No Anomalies") ? handoffFlag : healthFlag + "\n" + handoffFlag;
        const handoffNote = `Project handoff detected. ${handoffDetail || ""}`;
        if (!staleDraft.includes("handoff detected")) {
          staleDraft = (staleDraft ? staleDraft + "\n" : "") + handoffNote;
        }
        if (!flagColors.includes("#64748b")) flagColors.push("#64748b");
      }

      ghostRow["Health Flags"]    = healthFlag;
      ghostRow["Action Required"] = staleDraft;
      ghostRow["Vendor Comment"]  = vendorComment;
      ghostRow["Archive_Row"]     = latestReport ? (latestReport.idx + 1) : "";

      const highlights = {
          rowState: "ACTIVE",
          adaePaletteIdx: "GHOST",
          colors: diagnostics ? diagnostics.colors : {},
          summary: summary,
          gaps: adminGapsStr,
          flags: healthFlag,
          flagColors: flagColors,
          cleanComment: vendorComment,
          draft: staleDraft,
          benchmark: benchmarks || ""
      };
      
      return { row: ghostRow, highlights: highlights };
    }
  };

})();
