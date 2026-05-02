/**
 * FILE: 01_Engine_Auditor.gs
 * PURPOSE: Deep module for auditing production metrics (UG, AE, FIB, NAP).
 *   - Evaluates daily vs total footage mismatches.
 *   - Identifies Opening Balance issues.
 *   - Detects Total Regressions.
 *   - Suggests adjustments for "Total Jumps".
 */

const ProductionAuditor = (function() {

  /**
   * @param {Object} context
   *   - currentReport: { dailyUG, totalUG, dailyAE, totalAE, ... }
   *   - historicalTotals: { ug: { val, date }, ae: { val, date }, ... }
   *   - reportDate: "yyyy-MM-dd"
   */
  function audit(context) {
    const { currentReport, historicalTotals, reportDate } = context;
    const verdict = {
      isValid: true,
      discrepancies: [],
      flags: [],
      adjustments: {},
      updatedTotals: JSON.parse(JSON.stringify(historicalTotals || {}))
    };

    _auditMetric(verdict, 'ug', 'Daily UG Footage', 'Total UG Footage Completed', currentReport.dailyUG, currentReport.totalUG, reportDate);
    _auditMetric(verdict, 'ae', 'Daily Strand Footage', 'Total Strand Footage Complete?', currentReport.dailyAE, currentReport.totalAE, reportDate);
    _auditMetric(verdict, 'fib', 'Daily Fiber Footage', 'Total Fiber Footage Complete', currentReport.dailyFIB, currentReport.totalFIB, reportDate);
    _auditMetric(verdict, 'nap', 'Daily NAPs/Encl. Completed', 'Total NAPs Completed', currentReport.dailyNAP, currentReport.totalNAP, reportDate);

    verdict.isValid = verdict.discrepancies.length === 0;
    return verdict;
  }

  function _auditMetric(verdict, type, dailyH, totalH, dailyVal, totalVal, reportDate) {
    const prev = verdict.updatedTotals[type] || { val: 0, date: "" };
    const prevVal = prev.val || 0;
    const prevDate = prev.date || "";

    // 1. OPENING BALANCE
    if (prevVal === 0 && dailyVal > 0 && totalVal > dailyVal) {
      const priorWork = totalVal - dailyVal;
      const msg = `Opening Balance: Total (${totalVal}') implies ${priorWork}' of prior unreported work before first submission`;
      verdict.discrepancies.push({ type: 'OPENING_BALANCE', metric: type, delta: priorWork });
      verdict.flags.push(msg);
    }

    // 2. DAILY INFERRED (Total Jump with 0 daily)
    if (dailyVal === 0 && totalVal > prevVal && prevVal > 0) {
      const diff = totalVal - prevVal;
      let gapNote = "";
      if (prevDate && reportDate) {
        const gapDays = Math.round((new Date(reportDate).getTime() - new Date(prevDate).getTime()) / 86400000);
        if (gapDays > 1) gapNote = ` ⚠ ${gapDays}-day gap`;
      }
      verdict.adjustments[dailyH] = diff;
      verdict.flags.push(`Daily ${type.toUpperCase()} (+${diff}') from Total Jump (${prevVal} [on ${prevDate}] -> ${totalVal})${gapNote}`);
    }

    // 3. DAILY/TOTAL MISMATCH
    if (dailyVal > 0 && totalVal > prevVal && prevVal > 0) {
      const impliedDaily = totalVal - prevVal;
      const tolerance = impliedDaily * 0.10;
      if (Math.abs(impliedDaily - dailyVal) > tolerance) {
        verdict.discrepancies.push({ type: 'DAILY_TOTAL_MISMATCH', metric: type, reported: dailyVal, implied: impliedDaily });
        verdict.flags.push(`DAILY/TOTAL MISMATCH: ${type.toUpperCase()} (reported daily: ${dailyVal}, total implies: ${impliedDaily})`);
      }
    }

    // 4. TOTAL REGRESSION
    if (totalVal > 0 && prevVal > 0 && totalVal < prevVal) {
      verdict.discrepancies.push({ type: 'TOTAL_REGRESSION', metric: type, prevMax: prevVal, current: totalVal });
      verdict.flags.push(`TOTAL REGRESSION: ${type.toUpperCase()} (prev max: ${prevVal} on ${prevDate}, now: ${totalVal})`);
    }

    // Update running total for return
    if (totalVal > verdict.updatedTotals[type].val) {
      verdict.updatedTotals[type].val = totalVal;
      verdict.updatedTotals[type].date = reportDate;
    }
  }

  return {
    audit: audit
  };

})();

// Export for Node environment testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductionAuditor;
}
