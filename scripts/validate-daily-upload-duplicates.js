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
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", received "${actual}"`);
  }
  console.log(`PASS ${label}`);
}

const source = read('src/07_DailyUpload.js');
const logEntries = [];
let fetchResponse = { code: 200, data: [] };

const context = {
  console,
  QB_API_BASE: 'https://example.quickbase.com/v1',
  QB_DAILY_LOG_TABLE_ID: 'bvay4aqkz',
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
  },
  getDailyFidMap() {
    return {
      'FDH Engineering ID': 22,
      'Date': 6,
      'Contractor': 38
    };
  },
  _resolveFieldFid(name, fidMap) {
    return fidMap[name];
  },
  _getDailyUploadToken() {
    return 'token';
  },
  _qbHeaders() {
    return {};
  },
  UrlFetchApp: {
    fetch(url, opts) {
      context.lastFetch = { url, opts };
      return {
        getResponseCode() {
          return fetchResponse.code;
        },
        getContentText() {
          return JSON.stringify({ data: fetchResponse.data });
        }
      };
    }
  },
  logMsg() {
    logEntries.push(Array.from(arguments).join(' | '));
  }
};

vm.createContext(context);

[
  '_truncateDailyUploadLogValue',
  '_normalizeQuickBaseDateValue',
  '_normalizeDailyUploadDuplicateVendor',
  '_buildDailyUploadDuplicateDiagnostics',
  '_summarizeDailyUploadDuplicateCandidate',
  '_logDailyUploadDuplicateCheck',
  'checkDuplicateDailyRecord'
].forEach((name) => {
  vm.runInContext(extractFunction(source, name), context);
});

assertEqual(context._normalizeQuickBaseDateValue('04/21/2026'), '2026-04-21', 'Slash dates normalize to canonical yyyy-MM-dd');
assertEqual(context._normalizeQuickBaseDateValue('04-21-2026'), '2026-04-21', 'Dash dates normalize to canonical yyyy-MM-dd');
assertEqual(context._normalizeQuickBaseDateValue('2026-04-21'), '2026-04-21', 'ISO dates remain canonical');
assertEqual(context._normalizeDailyUploadDuplicateVendor('  DRG  '), 'drg', 'Vendor normalization trims and lowercases');

fetchResponse = {
  code: 200,
  data: [
    {
      3: { value: '101' },
      6: { value: '04/21/2026' },
      22: { value: 'MRO02-F04' },
      38: { value: ' DRG ' }
    }
  ]
};
let result = context.checkDuplicateDailyRecord('2026-04-21', 'MRO02-F04', 'drg');
assert(result.isDuplicate === true, 'Canonical duplicate key matches across date formats');
assertEqual(result.existingRecordId, '101', 'Duplicate match returns RID');
assertEqual(result.candidateRowCount, 1, 'Candidate count is reported');
assert(result.matchedCandidate && result.matchedCandidate.canonicalDate === '2026-04-21', 'Matched candidate diagnostics include canonical date');

fetchResponse = {
  code: 200,
  data: [
    {
      3: { value: '102' },
      6: { value: '2026-04-21' },
      22: { value: 'MRO02-F04' },
      38: { value: 'Other Vendor' }
    }
  ]
};
result = context.checkDuplicateDailyRecord('04-21-2026', 'MRO02-F04', 'DRG');
assert(result.isDuplicate === false, 'Different vendor on same canonical date does not match');
assertEqual(result.mismatchReason, 'vendor mismatch on canonical date', 'Vendor mismatch is surfaced in diagnostics');

logEntries.length = 0;
fetchResponse = {
  code: 200,
  data: [
    {
      3: { value: '103' },
      6: { value: '2026-04-22' },
      22: { value: 'MRO02-F04' },
      38: { value: 'DRG' }
    }
  ]
};
result = context.checkDuplicateDailyRecord('2026-04-21', 'MRO02-F04', 'DRG');
assert(result.isDuplicate === false, 'Different canonical date does not match');
assertEqual(result.mismatchReason, 'canonical date mismatch', 'Date mismatch remains the summary reason if a mismatched row is returned');
assert(logEntries.every((entry) => entry.indexOf('[DailyUpload][DuplicateCheck] date mismatch') === -1), 'Duplicate check does not spam per-row date mismatch logs');

const lastPayload = context.lastFetch && context.lastFetch.opts ? JSON.parse(context.lastFetch.opts.payload) : null;
assert(lastPayload && lastPayload.where === '{22.EX."MRO02-F04"}AND{6.EX."2026-04-21"}', 'Duplicate check queries QuickBase by FDH and canonical date');

logEntries.length = 0;
fetchResponse = {
  code: 200,
  data: []
};
result = context.checkDuplicateDailyRecord('2026-04-21', 'MRO02-F04', 'DRG');
assert(result.isDuplicate === false, 'Empty result set remains a non-duplicate');
assertEqual(result.mismatchReason, 'no candidate rows returned', 'Empty result set is reported explicitly');
assert(logEntries.some((entry) => entry.indexOf('candidateRowCount=0') >= 0), 'Summary logging still records candidate counts');

console.log('\nDaily upload duplicate validation passed.');
