const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${name}`);
  let braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected "${expected}", received "${actual}"`);
  console.log(`PASS ${label}`);
}

const source = read('src/07_DailyUpload.js');
assert(/if \(dryRun\) \{[\s\S]*_fetchDailyUploadDuplicateLookup\(uploadItems\)[\s\S]*isDuplicate: !!dupeCandidate[\s\S]*existingRecordId:/m.test(source), 'Dry-run path uses bulk duplicate preflight and exposes duplicate preview fields');
assert(/const token\s*=\s*_getDailyUploadToken\(\);/.test(source), 'Live upload path initializes the QuickBase token before batch inserts');
const context = {
  console,
  Session: {
    getScriptTimeZone() {
      return 'America/Chicago';
    }
  },
  Utilities: {
    formatDate(date, tz, format) {
      const d = new Date(date);
      const year = String(d.getUTCFullYear());
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      if (format === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
      throw new Error(`Unexpected format ${format}`);
    }
  }
};

vm.createContext(context);

[
  '_truncateDailyUploadLogValue',
  '_normalizeQuickBaseDateValue',
  '_normalizeDailyUploadDuplicateVendor',
  '_buildDailyUploadDuplicateKey',
  '_extractQuickBaseBatchInsertOutcomes'
].forEach((name) => {
  vm.runInContext(extractFunction(source, name), context);
});

const key = context._buildDailyUploadDuplicateKey('04/21/2026', ' ken01-f21 ', ' DRG ');
assertEqual(key.canonicalDate, '2026-04-21', 'Duplicate key canonicalizes date');
assertEqual(key.normalizedFdh, 'KEN01-F21', 'Duplicate key uppercases FDH');
assertEqual(key.normalizedVendor, 'drg', 'Duplicate key lowercases vendor');
assertEqual(key.key, '2026-04-21::KEN01-F21::drg', 'Duplicate key composes canonical identity');

let outcomes = context._extractQuickBaseBatchInsertOutcomes({
  data: [
    { '3': { value: '4212713' } },
    { '3': { value: '4212714' } }
  ],
  metadata: {}
}, 2);
assert(outcomes[0].ok && outcomes[1].ok, 'Batch parser marks successful rows as ok');
assertEqual(outcomes[0].recordId, '4212713', 'Batch parser reads first created RID');
assertEqual(outcomes[1].recordId, '4212714', 'Batch parser reads second created RID');

outcomes = context._extractQuickBaseBatchInsertOutcomes({
  data: [],
  metadata: {
    createdRecordIds: ['5001', '5002']
  }
}, 2);
assert(outcomes[0].ok && outcomes[1].ok, 'Batch parser falls back to metadata.createdRecordIds');
assertEqual(outcomes[1].recordId, '5002', 'Fallback RID mapping preserves row order');

outcomes = context._extractQuickBaseBatchInsertOutcomes({
  data: [{ '3': { value: '6001' } }, {}],
  metadata: {
    lineErrors: {
      1: ['Invalid numeric value']
    }
  }
}, 2);
assert(outcomes[0].ok === true, 'Mixed batch keeps successful rows successful');
assert(outcomes[1].ok === false, 'Mixed batch keeps failed rows failed');
assert(/Invalid numeric value/.test(outcomes[1].summary), 'Mixed batch surfaces row-specific line errors');

// lineErrors must force ok=false even when data[idx] carries a real recordId
outcomes = context._extractQuickBaseBatchInsertOutcomes({
  data: [{ '3': { value: '8001' } }, { '3': { value: '8002' } }],
  metadata: {
    lineErrors: {
      0: ['Validation failed for row 0']
    }
  }
}, 2);
assert(outcomes[0].ok === false, 'lineErrors overrides data mapping — row 0 must be failed');
assertEqual(outcomes[0].recordId, '', 'lineErrors clears stale recordId on failed row');
assert(outcomes[1].ok === true, 'Non-lineErrors row 1 remains successful');
assertEqual(outcomes[1].recordId, '8002', 'Row 1 recordId unaffected by lineErrors on row 0');

// createdRecordIds fallback must skip lineErrors-marked indices
outcomes = context._extractQuickBaseBatchInsertOutcomes({
  data: [],
  metadata: {
    createdRecordIds: ['9001'],
    lineErrors: {
      0: ['Row 0 rejected']
    }
  }
}, 2);
assert(outcomes[0].ok === false, 'createdRecordIds fallback skips lineErrors index 0');
assert(outcomes[1].ok === false, 'createdRecordIds[0] is not mis-attributed to a non-failed row when count exceeds available IDs');

console.log('\nDaily upload batching validation passed.');
