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

const archiveSource = read('src/01_Engine_Archive.js');

assert(
  /const query = "mimeType='application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet' or mimeType='application\/vnd\.ms-excel'";/.test(archiveSource),
  'incoming scan is constrained by Excel MIME type'
);

assert(
  !/endsWith\("\.xlsx"\)/.test(archiveSource),
  'Excel ingestion is not blocked by filename extension'
);

assert(
  /if \(!isContinuation\) \{\s*resetQuickBaseUploadTabForIngestion\(\);\s*\}/.test(archiveSource),
  'fresh ingestion resets QuickBase upload tab once'
);

assert(
  /let qbStartCount = allParsedRowsForQB \? allParsedRowsForQB\.length : 0;[\s\S]*let parsedRowsForThisFile = allParsedRowsForQB \? allParsedRowsForQB\.slice\(qbStartCount\) : \[\];/.test(archiveSource),
  'per-file parsed QuickBase rows are isolated before archive move'
);

assert(
  /appendQuickBaseUploadRowsForIngestion\(parsedRowsForThisFile\);[\s\S]*file\.setDescription\("PROCESSED"\);[\s\S]*file\.moveTo\(targetFolder\);/.test(archiveSource),
  'QuickBase rows are staged before files are marked processed and archived'
);

assert(
  /function appendQuickBaseUploadRowsForIngestion\(parsedRows\)[\s\S]*mapHistoryRowsToQuickBaseRows\(safeRows\)[\s\S]*getRange\(trueLastRow \+ 1, 1, qbData\.length, QB_HEADERS\.length\)\.setValues\(qbData\)/.test(archiveSource),
  'QuickBase upload staging appends without clearing existing staged rows'
);

assert(
  !/populateQuickBaseTabDirectly\(allParsedRowsForQB\);/.test(archiveSource),
  'completion no longer clears rows staged by earlier timeout batches'
);

assert(
  /"INGESTION_STATUS": "resume_scheduled"/.test(archiveSource) &&
  /applyQuickBaseUploadTabFinalStyling\(\);/.test(archiveSource),
  'timeout resume path preserves staged rows and styles the upload tab'
);

assert(
  /function moveFileToArchiveFolderSafely\(file, targetFolder, targetDateLabel\)[\s\S]*file\.moveTo\(targetFolder\)[\s\S]*Drive\.Files\.patch\(\{\}, file\.getId\(\), \{[\s\S]*addParents: targetFolderId,[\s\S]*removeParents: parentIds\.join\(","\)/.test(archiveSource),
  'archive movement retries moveTo and falls back to Drive parent patching'
);

assert(
  /function getArchiveFolderForDateSafely\(dateStr\)[\s\S]*return getArchiveFolderForDate\(dateStr\)[\s\S]*Archive folder unavailable/.test(archiveSource),
  'archive folder lookup is retried through a safe wrapper'
);

assert(
  /function setProcessedDescriptionSafely\(file\)[\s\S]*file\.setDescription\("PROCESSED"\)[\s\S]*could not be tagged PROCESSED/.test(archiveSource),
  'processed metadata tagging is retried and non-fatal'
);

assert(
  /setProcessedDescriptionSafely\(file\);/.test(archiveSource) &&
  !/file\.setDescription\("PROCESSED"\);/.test(archiveSource.replace(/function setProcessedDescriptionSafely[\s\S]*?function moveFileToArchiveFolderSafely/, 'function moveFileToArchiveFolderSafely')),
  'raw PROCESSED tagging stays isolated inside the safe helper'
);

assert(
  !/file\.moveTo\(targetFolder\);/.test(archiveSource.replace(/function moveFileToArchiveFolderSafely[\s\S]*?function cleanupTempConvertedFileSafely/, 'function cleanupTempConvertedFileSafely')),
  'raw archive moveTo calls stay isolated inside the safe move helper'
);

assert(
  /function cleanupTempConvertedFileSafely\(tempFile, sourceName\)[\s\S]*Drive\.Files\.remove\(tempFile\.id\)[\s\S]*setTrashed\(true\)[\s\S]*Temp cleanup left file in Drive/.test(archiveSource),
  'temp converted files are cleaned up through non-fatal delete/trash fallback'
);

assert(
  /if \(!isArchive\) cleanupStaleTempConvertedFilesInFolder\(folder\);/.test(archiveSource) &&
  /function cleanupStaleTempConvertedFilesInFolder\(folder\)[\s\S]*title contains '\[TEMP\]_' and mimeType='application\/vnd\.google-apps\.spreadsheet'[\s\S]*temp\.setTrashed\(true\)/.test(archiveSource),
  'incoming folder scan removes stale converted temp sheets'
);

assert(
  !/Drive\.Files\.remove\(tempFile\.id\);/.test(archiveSource.replace(/function cleanupTempConvertedFileSafely[\s\S]*?function parseFileToRows/, 'function parseFileToRows')),
  'parseFileToRows does not directly delete temp files'
);

assert(
  /let tempFile = createTempConvertedSpreadsheetSafely\(file\);[\s\S]*if \(!tempFile\) return \{ rows: \[\], maxDate: "" \};/.test(archiveSource) &&
  /function createTempConvertedSpreadsheetSafely\(file\)[\s\S]*Drive\.Files\.insert\(metadata, file\.getBlob\(\), \{ convert: true \}\)[\s\S]*Could not convert file for ingestion after retries/.test(archiveSource),
  'Excel conversion is retried through a safe helper'
);

console.log('\nIngestion QuickBase staging validation passed.');
