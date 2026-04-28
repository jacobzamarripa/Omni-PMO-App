const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

const backend = read('src/07_DailyUpload.js');
const frontend = read('src/_module_daily_upload.html');

assert(
  /function _dailyUploadDriveRetry\(label, fn, attempts, delayMs\)[\s\S]*Utilities\.sleep\(delayMs \* attempt\)/.test(backend),
  'Daily Upload Drive calls use retry with backoff'
);

assert(
  /function _scanDailyUploadExportCoverage\(targetDates\)[\s\S]*Utilities\.parseCsv\(_readDailyUploadCsvSafely\(file\)\)[\s\S]*missingRowIndices/.test(backend),
  'export status parses existing CSV files and returns missing row indices'
);

assert(
  /_buildDailyUploadCsvCoverageKey\([\s\S]*dateVal[\s\S]*fdhVal[\s\S]*vendorVal[\s\S]*canonicalDate \+ '::' \+ fdh \+ '::' \+ vendor/.test(backend),
  'CSV coverage key uses Date + FDH + Contractor'
);

assert(
  /if \(status\.complete\) \{[\s\S]*reusedExisting: true[\s\S]*Existing CSV already covers/.test(backend),
  'export endpoint reuses a complete existing CSV'
);

assert(
  /status\.exists && status\.missingRowIndices\.length[\s\S]*_getDailyUploadCurrentExportRows\(status\.targetDates, status\.missingRowIndices\)/.test(backend),
  'partial export writes only rows missing from existing CSV coverage'
);

assert(
  /_createDailyUploadQueueCsv\(status\.targetDates\.length \? status\.targetDates : activeDates, rowsToExport, status\.exists \? 'MISSING' : ''\)/.test(backend),
  'partial/mismatch exports receive an explicit MISSING filename tag'
);

assert(
  /function _duHasExportForLoadedDate\(\)[\s\S]*_duExportStatus\.coverageStatus === 'complete'/.test(frontend),
  'live upload gate requires complete CSV coverage'
);

assert(
  /function _duApproveQueue\(\)[\s\S]*_duLoadExportStatus\(_duLoadedQueueDates\.length \? _duLoadedQueueDates : _duLoadedQueueDate\)/.test(frontend),
  'approving the queue triggers a fresh Pending Upload coverage check'
);

assert(
  /CSV Partial/.test(frontend) && /CSV PARTIAL/.test(frontend) && /Export Missing Rows/.test(frontend),
  'Step 4 exposes compact partial export state and missing-row export action'
);

assert(
  !/Partial Export Found/.test(frontend) && !/Export Mismatch<\/div>/.test(frontend),
  'Step 4 no longer uses loud partial or mismatch warning labels'
);

assert(
  /var _duIsCheckingExportStatus = false;/.test(frontend) &&
    /Checking CSV/.test(frontend) &&
    /btnExport4\.disabled = _duIsCheckingExportStatus/.test(frontend),
  'Step 4 has a compact checking state while CSV coverage is being read'
);

assert(
  /function _duCanRunLiveUploadActions\(\)[\s\S]*!_duIsCheckingExportStatus[\s\S]*_duHasExportForLoadedDate\(\)/.test(frontend),
  'live upload waits for CSV coverage verification to finish'
);

assert(
  !/coverageStatus === 'partial'[\s\S]{0,160}is-warning/.test(frontend) &&
    !/coverageStatus === 'missing'[\s\S]{0,160}is-warning/.test(frontend),
  'partial and mismatch CSV states avoid warning badge styling'
);

assert(
  /CSV MISSING/.test(frontend) && /CSV Needed/.test(frontend),
  'missing CSV states are compact status text'
);

assert(
  /coverageStatus: result\.coverageStatus \|\| 'complete'[\s\S]*missingRowIndices: result\.missingRowIndices \|\| \[\]/.test(frontend),
  'frontend preserves backend coverage metadata after export'
);

console.log('\nDaily upload CSV hardening validation passed.');
