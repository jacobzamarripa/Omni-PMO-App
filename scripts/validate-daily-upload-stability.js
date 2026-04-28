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
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
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

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, received ${a}`);
  console.log(`PASS ${label}`);
}

const backend = read('src/07_DailyUpload.js');
const frontend = read('src/_module_daily_upload.html');

let capturedPopulateArg = null;
const fakeFiles = [
  {
    getName: () => 'Daily_Production_Report_04.24.26-04.26.26.csv',
    getId: () => 'range-file',
    getUrl: () => 'https://drive.example/range-file',
    getDateCreated: () => new Date(2026, 3, 27, 8, 0, 0),
    getLastUpdated: () => new Date(2026, 3, 27, 8, 5, 0)
  }
];

const context = {
  console,
  COMPILED_FOLDER_ID: 'compiled',
  QB_UPLOAD_SHEET: '1-QuickBase_Upload',
  MimeType: { CSV: 'text/csv' },
  Session: {
    getScriptTimeZone() {
      return 'America/Chicago';
    }
  },
  Utilities: {
    formatDate(date, tz, format) {
      const d = new Date(date);
      const year = String(d.getFullYear());
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (format === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
      if (format === 'MM.dd.yy') return `${month}.${day}.${String(year).slice(-2)}`;
      if (format === 'yyyy-MM-dd HH:mm:ss') return `${year}-${month}-${day} 08:05:00`;
      throw new Error(`Unexpected format ${format}`);
    }
  },
  DriveApp: {
    getFolderById() {
      let index = 0;
      return {
        getFilesByType() {
          return {
            hasNext() {
              return index < fakeFiles.length;
            },
            next() {
              return fakeFiles[index++];
            }
          };
        }
      };
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      return {
        getSheetByName() {
          return {};
        }
      };
    }
  },
  getTrueLastDataRow() {
    return 4;
  },
  populateQuickBaseTabCore(targetDates) {
    capturedPopulateArg = targetDates;
  },
  _scanDailyUploadExportCoverage(targetDates) {
    const dates = Array.isArray(targetDates) ? targetDates.slice().sort() : [targetDates];
    const targetDate = dates[0] || '';
    const targetDateLabel = dates.length > 1 ? `${dates[0]} - ${dates[dates.length - 1]}` : targetDate;
    const datePart = dates.length > 1 ? '04.24.26-04.26.26' : '04.27.26';
    return {
      targetDate,
      targetDates: dates,
      targetDateLabel,
      exists: datePart === '04.24.26-04.26.26',
      coverageStatus: datePart === '04.24.26-04.26.26' ? 'complete' : 'missing',
      complete: datePart === '04.24.26-04.26.26',
      fileId: datePart === '04.24.26-04.26.26' ? 'range-file' : '',
      fileName: datePart === '04.24.26-04.26.26' ? 'Daily_Production_Report_04.24.26-04.26.26.csv' : '',
      fileUrl: datePart === '04.24.26-04.26.26' ? 'https://drive.example/range-file' : '',
      createdAt: '2026-04-27 08:05:00',
      modifiedAt: '2026-04-27 08:05:00'
    };
  }
};

vm.createContext(context);

[
  '_getDailyUploadIsoFromDate',
  '_normalizeDailyUploadTargetDate',
  '_normalizeDailyUploadTargetDates',
  '_formatDailyUploadTargetDateLabel',
  '_buildDailyUploadTargetMeta',
  '_formatDailyUploadDatePart',
  '_formatDailyUploadDateRangePart',
  '_getPipelineRecommendedTarget',
  '_countDailyUploadQueueRows',
  'loadDailyUploadQueueForDate',
  'getDailyUploadExportStatus'
].forEach((name) => {
  vm.runInContext(extractFunction(backend, name), context);
});

let recommended = context._getPipelineRecommendedTarget(new Date(2026, 3, 27, 9, 0, 0));
assertDeepEqual(
  recommended.targetDates,
  ['2026-04-24', '2026-04-25', '2026-04-26'],
  'Monday recommendation returns Friday-Sunday'
);
assertEqual(recommended.targetDateLabel, '2026-04-24 - 2026-04-26', 'Monday recommendation exposes range label');

recommended = context._getPipelineRecommendedTarget(new Date(2026, 3, 28, 9, 0, 0));
assertDeepEqual(recommended.targetDates, ['2026-04-27'], 'Non-Monday recommendation returns only yesterday');

const loadResult = context.loadDailyUploadQueueForDate(['2026-04-24', '2026-04-25', '2026-04-26']);
assertDeepEqual(capturedPopulateArg, ['2026-04-24', '2026-04-25', '2026-04-26'], 'loadDailyUploadQueueForDate passes Monday range array to populateQuickBaseTabCore');
assertEqual(loadResult.targetDateLabel, '2026-04-24 - 2026-04-26', 'Queue load response returns canonical range label');

const exportStatus = context.getDailyUploadExportStatus(['2026-04-24', '2026-04-25', '2026-04-26']);
assert(exportStatus.exists, 'Export status finds the range-named CSV');
assertEqual(exportStatus.fileName, 'Daily_Production_Report_04.24.26-04.26.26.csv', 'Export status matches range filename label');
assertEqual(exportStatus.targetDateLabel, '2026-04-24 - 2026-04-26', 'Export status returns range target label');

assert(/if \(!dryRun && options\.createSnapshot === true\) \{/.test(backend), 'Live upload does not create a snapshot unless explicitly requested');
assert(/function _duBuildDatePickerHtml\(\)/.test(frontend), 'Step 2 date picker has reusable render helper');
assert(/targetEl\.innerHTML =[\s\S]*_duBuildDatePickerHtml\(\);/.test(frontend), 'Step 2 date picker survives _duRenderPipeline replacement');
assert(/requestSeq !== _duQueueLoadSeq/.test(frontend), 'Stale queue-load responses are ignored');
assert(/_duCanRunLiveUploadActions\(\)/.test(frontend), 'Live upload is gated separately from dry run');
assert(!/setTimeout\(_duRenderMissingModal/.test(frontend), 'Missing report modal refresh is response-driven');

console.log('\nDaily upload stability validation passed.');
