/**
 * VALIDATION: Visibility Engine
 * 
 * Verifies:
 * 1. Portfolio eligibility logic (Canceled, Terminal Grace, History).
 * 2. Reporting lag and Monday Carry.
 * 3. Standardized Ghost Row synthesis.
 */

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

// --- MOCK ENVIRONMENT ---
const sandbox = {
  Utilities: {
    formatDate: function(date, tz, format) {
      if (!date) return "";
      const d = new Date(date);
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const yr = String(d.getFullYear()).slice(-2);
      return `${mo}/${da}/${yr}`;
    }
  },
  logMsg: console.log
};

vm.createContext(sandbox);

// Load the Engine
const engineSource = read('src/01_Engine_Visibility.js');
vm.runInContext(engineSource, sandbox);

const VisibilityEngine = sandbox.VisibilityEngine;

console.log('--- STARTING VISIBILITY ENGINE VALIDATION ---');

// --- 1. ELIGIBILITY TESTS ---

// A. Canceled project
const canceled = VisibilityEngine.getPortfolioStatus({
  status: 'CANCELED',
  stage: 'FIELD CX'
});
assert.strictEqual(canceled.includeInPortfolio, false, 'Canceled project should be excluded');
assert.strictEqual(canceled.reason, 'excluded-canceled');

// B. Terminal Grace Window (Within)
// If today is 2026-05-02, and OFS was 2026-04-15, grace is until 2026-05-07. Should be IN.
const terminalInGrace = VisibilityEngine.getPortfolioStatus({
  status: 'OFS',
  primaryOfsDate: '2026-04-15',
  referenceDate: new Date(2026, 4, 2) // May 2
});
assert.strictEqual(terminalInGrace.includeInPortfolio, true, 'Terminal project in grace window should be included');
assert.strictEqual(terminalInGrace.isTerminalGraceOnly, true);

// C. Terminal Post Grace
// If today is 2026-05-10, and OFS was 2026-04-15, grace expired 2026-05-07. Should be OUT.
const terminalPostGrace = VisibilityEngine.getPortfolioStatus({
  status: 'OFS',
  primaryOfsDate: '2026-04-15',
  referenceDate: new Date(2026, 4, 10) // May 10
});
assert.strictEqual(terminalPostGrace.includeInPortfolio, false, 'Terminal project post grace should be excluded');

// D. Same-day CX Start
// CX Start today, report expected next business day.
const startToday = VisibilityEngine.getPortfolioStatus({
  stage: 'FIELD CX',
  vendor: 'Vendor A',
  cxStart: '2026-05-02',
  referenceDate: new Date(2026, 4, 2)
});
assert.strictEqual(startToday.includeInPortfolio, true, 'New start should be in portfolio');
assert.strictEqual(startToday.expectDailyReport, false, 'Report not expected on start day');

// --- 2. LAG TESTS ---

// A. Standard Weekday Lag
// Friday to Monday (should be 0 business days because Monday Carry rule applies)
const fridayToMonday = VisibilityEngine.calculateReportingLag('2026-05-01', '2026-05-04');
assert.strictEqual(fridayToMonday.daysAgo, 0);
assert.strictEqual(fridayToMonday.isMondayCarry, true, 'Friday to Monday is a Monday Carry');

// B. Tuesday to Thursday
const tuesToThurs = VisibilityEngine.calculateReportingLag('2026-04-28', '2026-04-30');
assert.strictEqual(tuesToThurs.daysAgo, 2, 'Tues to Thurs is 2 business days (Wed, Thurs)');
assert.strictEqual(tuesToThurs.isMondayCarry, false);

// --- 3. GHOST SYNTHESIS TESTS ---

const ghost = VisibilityEngine.generateGhostRow({
  fdhId: 'TEST-001',
  refData: { stage: 'FIELD CX', vendor: 'Vendor A', city: 'Dallas' },
  latestReport: { date: new Date(2026, 3, 29), data: new Array(33).fill(""), idx: 100 },
  targetDate: new Date(2026, 4, 1), // Friday May 1
  cxDates: { cxStart: '2026-04-01' }
});

assert.ok(ghost, 'Ghost row should be generated');
assert.strictEqual(ghost.row['Contractor'], 'Vendor A');
assert.strictEqual(ghost.highlights.adaePaletteIdx, 'GHOST');
assert.ok(ghost.row['Health Flags'].includes('STALE REPORT'), 'Should have stale flag');

console.log('--- VISIBILITY ENGINE VALIDATION PASSED ---');
