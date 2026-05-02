const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const auditorPath = path.join(root, 'src/01_Engine_Auditor.js');
const auditorSource = fs.readFileSync(auditorPath, 'utf8');

const context = {
  console,
  JSON,
  Math,
  Date,
  module: { exports: {} }
};

vm.createContext(context);
vm.runInContext(auditorSource, context);
const ProductionAuditor = context.module.exports;

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`FAIL ${label}: expected "${expected}", received "${actual}"`);
  }
  console.log(`PASS: ${label}`);
}

console.log('--- 🧪 STARTING PRODUCTION AUDITOR UNIT TESTS ---\n');

// 1. SCENARIO: Clean Run
let res = ProductionAuditor.audit({
  reportDate: '2026-05-01',
  currentReport: { dailyUG: 100, totalUG: 500, dailyAE: 0, totalAE: 0, dailyFIB: 0, totalFIB: 0, dailyNAP: 0, totalNAP: 0 },
  historicalTotals: { 
    ug: { val: 400, date: '2026-04-30' },
    ae: { val: 0, date: '' },
    fib: { val: 0, date: '' },
    nap: { val: 0, date: '' }
  }
});
assert(res.isValid, 'Clean run is valid');
assertEqual(res.updatedTotals.ug.val, 500, 'Total updated to 500');
assertEqual(res.updatedTotals.ug.date, '2026-05-01', 'Total date updated');

// 2. SCENARIO: Opening Balance Discrepancy
res = ProductionAuditor.audit({
  reportDate: '2026-05-01',
  currentReport: { dailyUG: 100, totalUG: 500, dailyAE: 0, totalAE: 0, dailyFIB: 0, totalFIB: 0, dailyNAP: 0, totalNAP: 0 },
  historicalTotals: { 
    ug: { val: 0, date: '' },
    ae: { val: 0, date: '' },
    fib: { val: 0, date: '' },
    nap: { val: 0, date: '' }
  }
});
assert(!res.isValid, 'Opening balance mismatch is invalid');
assert(res.flags[0].includes('Opening Balance'), 'Flag contains Opening Balance message');
assertEqual(res.discrepancies[0].delta, 400, 'Identified 400ft prior work');

// 3. SCENARIO: Daily Inferred (Total Jump)
res = ProductionAuditor.audit({
  reportDate: '2026-05-01',
  currentReport: { dailyUG: 0, totalUG: 500, dailyAE: 0, totalAE: 0, dailyFIB: 0, totalFIB: 0, dailyNAP: 0, totalNAP: 0 },
  historicalTotals: { 
    ug: { val: 400, date: '2026-04-30' },
    ae: { val: 0, date: '' },
    fib: { val: 0, date: '' },
    nap: { val: 0, date: '' }
  }
});
assertEqual(res.adjustments['Daily UG Footage'], 100, 'Adjusted daily UG to 100');
assert(res.flags[0].includes('Daily UG (+100\') from Total Jump'), 'Flag message matches jump');

// 4. SCENARIO: Daily/Total Mismatch (Tolerance)
res = ProductionAuditor.audit({
  reportDate: '2026-05-01',
  currentReport: { dailyUG: 100, totalUG: 600, dailyAE: 0, totalAE: 0, dailyFIB: 0, totalFIB: 0, dailyNAP: 0, totalNAP: 0 },
  historicalTotals: { 
    ug: { val: 400, date: '2026-04-30' },
    ae: { val: 0, date: '' },
    fib: { val: 0, date: '' },
    nap: { val: 0, date: '' }
  }
});
assert(!res.isValid, 'Mismatch outside 10% tolerance is invalid');
assert(res.flags[0].includes('DAILY/TOTAL MISMATCH'), 'Correct mismatch flag');

// 5. SCENARIO: Total Regression
res = ProductionAuditor.audit({
  reportDate: '2026-05-01',
  currentReport: { dailyUG: 0, totalUG: 300, dailyAE: 0, totalAE: 0, dailyFIB: 0, totalFIB: 0, dailyNAP: 0, totalNAP: 0 },
  historicalTotals: { 
    ug: { val: 400, date: '2026-04-30' },
    ae: { val: 0, date: '' },
    fib: { val: 0, date: '' },
    nap: { val: 0, date: '' }
  }
});
assert(!res.isValid, 'Regression is invalid');
assertEqual(res.discrepancies[0].type, 'TOTAL_REGRESSION', 'Correct discrepancy type');

console.log('\n✅ ALL PRODUCTION AUDITOR TESTS PASSED.');
