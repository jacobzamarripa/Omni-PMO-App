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

function formatDateLike(dateLike, format) {
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) throw new Error(`Invalid date ${dateLike}`);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (format === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
  if (format === 'MM/dd/yyyy') return `${month}/${day}/${year}`;
  throw new Error(`Unexpected format ${format}`);
}

const source = read('src/07_DailyUpload.js');

const historyRows = [
  ['Date', 'Contractor', 'FDH Engineering ID'],
  ['2026-04-18', 'vendor a llc', 'ALP01-F01'],
  ['2026-04-19', 'Vendor Delta', 'DEL01-F04'],
  ['2026-04-17', 'Vendor Beta', 'BET01-F03'],
  ['2026-04-16', 'Vendor Epsilon', 'EPS01-F06'],
  ['2026-04-21', 'Vendor Alpha', 'ALP01-F02']
];

const aliasRows = [
  ['Raw Name', 'Canonical Name'],
  ['vendor beta field ops', 'Vendor Beta']
];

function makeSheet(values) {
  return {
    _values: values,
    getLastRow() {
      return this._values.length;
    },
    getDataRange() {
      return {
        getValues: () => this._values
      };
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues: () => this._values.slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols))
      };
    }
  };
}

const sheetMap = {
  '2-Master_Archive': makeSheet(historyRows),
  '13-Vendor_Aliases': makeSheet(aliasRows)
};

const context = {
  console,
  HISTORY_SHEET: '2-Master_Archive',
  ALIAS_SHEET: '13-Vendor_Aliases',
  HISTORY_HEADERS: ['Date', 'Contractor', 'FDH Engineering ID'],
  VENDOR_ALIASES: {
    'vendor a llc': 'Vendor Alpha'
  },
  Session: {
    getScriptTimeZone() {
      return 'America/Chicago';
    }
  },
  Utilities: {
    formatDate(dateLike, tz, format) {
      return formatDateLike(dateLike, format);
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      return {
        getSheetByName(name) {
          return sheetMap[name] || null;
        }
      };
    }
  },
  getTrueLastDataRow(sheet) {
    return sheet.getLastRow();
  },
  normalizeDateString(value) {
    if (value instanceof Date) return formatDateLike(value, 'yyyy-MM-dd');
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const parts = raw.split('/');
      return `${parts[2]}-${parts[0]}-${parts[1]}`;
    }
    return formatDateLike(raw, 'yyyy-MM-dd');
  },
  _normalizeFdhId(value) {
    return String(value || '').trim().toUpperCase();
  },
  getReferenceDictionary() {
    return {
      'ALP01-F01': { vendor: 'Vendor Alpha', city: 'Austin', stage: 'Construction', status: 'Active', cxStart: '2026-04-15' },
      'ALP01-F02': { vendor: 'Vendor Alpha', city: 'Austin', stage: 'Construction', status: 'Active', cxStart: '2026-04-15' },
      'BET01-F03': { vendor: 'Vendor Beta', city: 'Dallas', stage: 'Construction', status: 'Active', cxStart: '2026-04-15' },
      'DEL01-F04': { vendor: 'Vendor Delta', city: 'Houston', stage: 'Construction', status: 'Active', cxStart: '2026-04-15' },
      'EPS01-F06': { vendor: 'Vendor Epsilon', city: 'Temple', stage: 'Construction', status: 'Active', cxStart: '2026-04-15' },
      'IGN01-F05': { vendor: 'Ignore Complete', city: 'Tyler', stage: 'Complete', status: 'Complete', cxStart: '2026-04-15' }
    };
  },
  _getPortfolioVisibilityMeta(input) {
    const status = String(input.status || '').toUpperCase();
    const stage = String(input.stage || '').toUpperCase();
    return { expectDailyReport: !(status.includes('COMPLETE') || stage.includes('COMPLETE')) };
  }
};

vm.createContext(context);

[
  '_normalizeDailyUploadTargetDate',
  '_getDailyUploadVendorAliasMap',
  '_normalizeMissingReportVendor',
  '_displayMissingReportVendor',
  '_normalizeMissingReportFdh',
  '_parseMissingReportAnchorDate',
  '_formatMissingReportDate',
  '_buildMissingReportBucket',
  '_buildMissingReportEntry',
  'getMissingReportVendors'
].forEach((name) => {
  vm.runInContext(extractFunction(source, name), context);
});

const weekend = context.getMissingReportVendors('04/19/2026');
assertEqual(weekend.reportBucketType, 'weekend_bundle', 'Sunday uses Fri-Sun weekend bundle');
assertEqual(weekend.wholeMissingVendors.length, 1, 'Weekend bundle identifies one whole-missing vendor');
assertEqual(weekend.partialMissingVendors.length, 1, 'Weekend bundle identifies one partial vendor');
assertEqual(weekend.totals.missingFdhCount, 2, 'Weekend bundle totals missing FDHs across whole and partial misses');

const wholeVendor = weekend.wholeMissingVendors[0];
assertEqual(wholeVendor.vendor, 'Vendor Epsilon', 'Whole-missing vendor uses canonical display name');
assertEqual(wholeVendor.missingFdhs.length, 1, 'Whole-missing vendor includes exact FDH list');
assertEqual(wholeVendor.lastReportDate, '04/16/2026', 'Whole-missing vendor last report date comes from archive history');

const partialVendor = weekend.partialMissingVendors[0];
assertEqual(partialVendor.vendor, 'Vendor Alpha', 'Alias-mapped archive vendor rolls up to canonical vendor');
assertEqual(partialVendor.coveredFdhCount, 1, 'Partial vendor counts covered FDHs inside the bucket');
assertEqual(partialVendor.missingFdhCount, 1, 'Partial vendor counts only missing FDHs');
assertEqual(partialVendor.missingFdhs[0].fdh, 'ALP01-F02', 'Partial vendor exposes the exact missing FDH ID');
assertEqual(partialVendor.emailFdhs[0].fdh, 'ALP01-F02', 'Partial vendor draft list is limited to missing FDHs');

assert(
  weekend.wholeMissingVendors.every((entry) => entry.vendor !== 'Vendor Delta') &&
  weekend.partialMissingVendors.every((entry) => entry.vendor !== 'Vendor Delta'),
  'Fully covered vendors are excluded from missing results'
);

const weekday = context.getMissingReportVendors('04/21/2026');
assertEqual(weekday.reportBucketType, 'daily', 'Weekday bucket stays single-day');
assertEqual(weekday.wholeMissingVendors.length, 3, 'Weekday bucket flags vendors with no archive coverage that day');
assertEqual(weekday.partialMissingVendors.length, 1, 'Weekday bucket keeps same-day partial coverage at the FDH level');

console.log('\nMissing daily report validation passed.');
