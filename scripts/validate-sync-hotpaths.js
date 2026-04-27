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

const configSource = read('src/00_Config.js');
const qbSource = read('src/06_QBSync.js');
const archiveSource = read('src/01_Engine_Archive.js');
const dictSource = read('src/01_Engine_DataDicts.js');
const utilSource = read('src/02_Utilities.js');
const cdSource = read('src/05_CDIngestion.js');

const context = { console };
vm.createContext(context);

[
  extractFunction(configSource, 'formatLogMessage'),
].forEach((snippet) => vm.runInContext(snippet, context));

assertEqual(context.formatLogMessage('WARN'), 'WARN', 'Single-argument log formatting stays unchanged');
assertEqual(
  context.formatLogMessage('WARN', 'getVendorHybridStats', 'Missing fiber footage column'),
  'WARN [getVendorHybridStats] Missing fiber footage column',
  'Structured log formatting preserves level, scope, and detail'
);

assert(/const knownFdhSet = new Set\(\);/.test(qbSource), 'Change log sync builds a unified known FDH set');
assert(/if \(!fdh\) \{\s*blankFdhCount\+\+;\s*return;\s*\}/m.test(qbSource), 'Change log sync drops blank FDHs before row construction');
assert(/if \(!knownFdhSet\.has\(fdh\)\) \{\s*droppedUnknownFdhCount\+\+;\s*return;\s*\}/m.test(qbSource), 'Change log sync drops unknown FDHs before row construction');
assert(/sheet\.getRange\(1, 1, 1, sheet\.getLastColumn\(\)\)\.getValues\(\)\[0\]/.test(qbSource), 'FDH set helper reads only the header row');
assert(/sheet\.getRange\(2, idx \+ 1, Math\.max\(sheet\.getLastRow\(\) - 1, 1\), 1\)\.getValues\(\)/.test(qbSource), 'FDH set helper reads only the FDH column');
assert(/logMsg\("WARN", "syncFromQBWebApp\.deckEnrichment", deckErr\.message\);/.test(qbSource), 'Deck enrichment warnings use structured logMsg formatting');
assert(/logMsg\("WARN", "_fetchTableAllFids", "QB query HTTP " \+ resp\.getResponseCode\(\) \+ " for table " \+ tableId\);/.test(qbSource), 'QB query warnings use structured logMsg formatting');
assert(!/bvieaendx/.test(qbSource), 'Obsolete Project Management table is not queried');
assert(/const QB_PRIMARY_DECK_FIDS = \[517, 459, 527, 528, 529, 192, 927, 274, 518, 520, 521, 588, 589, 439, 513, 436, 733, 524\];/.test(qbSource), 'Primary FDH Projects deck FIDs are force-selected');
assert(/QB_PRIMARY_DECK_FIDS\.forEach\(function\(fid\) \{ if \(fieldMap\[fid\]\) fidSet\.add\(fid\); \}\);/.test(qbSource), 'Primary deck FIDs feed reference snapshot selection');
assert(/"QB_Active_Pwr": "Light to Cabinets"/.test(qbSource), 'Active power output maps to Light to Cabinets');
assert(/"QB_Ofs_Change": "Current OFS Date Change Log Date"/.test(qbSource), 'OFS change output maps to current OFS change-log date');
assert(/function _qbFetchWithRetry\(url, opts, contextLabel\)/.test(qbSource), 'QB records query retry helper exists');
assert(/var resp = _qbFetchWithRetry\(url, opts, "_fetchTableAllFids:" \+ tableId\);/.test(qbSource), 'QB table fetches use retry helper');
assert(/const response = _qbFetchWithRetry\(url, options, "syncChangeLogs"\);/.test(qbSource), 'QB change log fetch uses retry helper');
assert(/if \(skip < total\) Utilities\.sleep\(150\);/.test(qbSource), 'QB paged fetches use light pacing');
assert(/function syncAndRebuildDashboard\(\)/.test(qbSource), 'Direct manual QB sync entrypoint exists');
assert(/payload\._syncMeta = \{ count: syncResult\.count, timestamp: syncResult\.timestamp, date: latestDate, timings: timings \};/.test(qbSource), 'Direct manual QB sync returns payload metadata for the frontend');
assert(/'QB_SYNC_PHASE2_QUEUED_AT': String\(phase2QueuedAt\)/.test(qbSource), 'Async sync records when Phase 2 was queued');
assert(/QB_SYNC_PHASE1_TRIGGER_CREATED_AT/.test(qbSource), 'Async sync records when Phase 1 trigger was scheduled');
assert(/'QB_SYNC_PHASE2_TRIGGER_CREATED_AT': String\(phase2TriggerCreatedAt\)/.test(qbSource), 'Async sync records when Phase 2 trigger was scheduled');
assert(/'QB_SYNC_RUN_ID': runId/.test(qbSource), 'Async sync tags each run with a run ID');
assert(/deletedTriggers=/.test(qbSource), 'Async kickoff logs orphaned trigger cleanup count');
assert(/function _deleteQBSyncTriggers_\(\)/.test(qbSource), 'Async sync exposes a shared trigger cleanup helper');
assert(/function _clearQBSyncTransientState_\(props\)/.test(qbSource), 'Async sync exposes a transient state cleanup helper');
assert(/function _setQBSyncTerminalState_\(props, status, payload\)/.test(qbSource), 'Async sync centralizes terminal state writes');
assert(/const phase1TriggerLatencyMs = phase1TriggerCreatedAt \? phase1StartMs - phase1TriggerCreatedAt : null;/.test(qbSource), 'Async sync computes Phase 1 trigger latency explicitly');
assert(/const phase2QueueLatencyMs = queuedAtMs \? phase2StartMs - queuedAtMs : null;/.test(qbSource), 'Async sync computes Phase 2 queue latency explicitly');
assert(/const phase2TriggerLatencyMs = phase2TriggerCreatedAt \? phase2StartMs - phase2TriggerCreatedAt : null;/.test(qbSource), 'Async sync computes Phase 2 trigger latency explicitly');
assert(/phase1TriggerLatencyMs: phase1\.triggerLatencyMs == null \? null : phase1\.triggerLatencyMs,/.test(qbSource), 'Async sync persists Phase 1 trigger latency into Phase 2 timing summary');
assert(/_setQBSyncTerminalState_\(props, 'error', 'Sync timed out after 14 min\. Check Apps Script execution logs\.'\);/.test(qbSource), 'Async sync converts stale running state into a terminal timeout error');
assert(/QB Async Sync terminal state — status=done, runId=/.test(qbSource), 'QB async sync logs a compact done-state summary');
assert(/QB Async Sync terminal state — status=error, runId=/.test(qbSource), 'QB async sync logs a compact error-state summary');
assert(/logAutomationHealthSummary\('Automation health after QB kickoff'\);/.test(qbSource), 'QB kickoff logs the current automation health summary');
assert(/\.syncAndRebuildDashboard\(\);/.test(read('src/_module_webapp_core.html')), 'Frontend manual sync calls the direct sync-and-rebuild endpoint');
assert(!/\.kickoffQBSync\(\);/.test(read('src/_module_webapp_core.html')), 'Frontend manual sync no longer kicks off the async trigger chain');
assert(!/\.getQBSyncStatus\(\);/.test(read('src/_module_webapp_core.html')), 'Frontend manual sync no longer polls async QB sync status');
assert(/V2 PAYLOAD timings: /.test(utilSource), 'Payload builder logs step timings');
assert(/const failureKey = 'SIGNAL_DRIVE_FAIL_GLOBAL';/.test(utilSource), 'SIGNAL Drive scan has a global failure cooldown key');
assert(/if \(cache\.get\(failureKey\)\) return \[\];/.test(utilSource), 'SIGNAL Drive scan honors failure cooldown');
assert(/cache\.put\(failureKey, '1', 120\)/.test(utilSource), 'SIGNAL Drive scan stores short failure cooldown');
assert(/function _deleteProjectTriggersByHandler_\(handlerName\)/.test(utilSource), 'Automation utilities expose family-scoped trigger deletion');
assert(/const deletedTriggerCount = _deleteProjectTriggersByHandler_\('runMiddayAutomation'\);/.test(utilSource), 'Daily automation trigger install only deletes its own trigger family');
assert(/function getAutomationHealth\(\)/.test(utilSource), 'Automation utilities expose a consolidated health snapshot');
assert(/function _buildAutomationHealthSummary_\(health\)/.test(utilSource), 'Automation utilities expose a compact health summary builder');
assert(/function logAutomationHealthSummary\(contextLabel\)/.test(utilSource), 'Automation utilities expose a compact health logger');
assert(/resumeTriggerCount: _listProjectTriggersByHandler_\('processIncomingResume'\)\.length/.test(utilSource), 'Automation health reports archive resume trigger count');
assert(/logAutomationHealthSummary\('Automation health after midday run'\);/.test(utilSource), 'Daily automation logs a health summary after successful runs');
assert(/logAutomationHealthSummary\('Automation health after midday error'\);/.test(utilSource), 'Daily automation logs a health summary after failed runs');
assert(/logAutomationHealthSummary\('Automation health snapshot saved'\);/.test(utilSource), 'Saving a health snapshot also logs a compact summary');
assert(/backfillMissingReports\(true\);/.test(utilSource), 'Scheduled automation runs the gap scan in silent mode');
assert(/function backfillMissingReports\(isSilent\)/.test(utilSource), 'Gap scan accepts a silent-mode flag');
assert(/if \(!isSilent\)[\s\S]*All dates in the last 7 days already have a corresponding compiled report\./.test(utilSource), 'Gap scan suppresses the no-gap alert during silent runs');
assert(/if \(!isSilent\)[\s\S]*Generated \$\{missingDates.length\} missing reports into the 01_Pending_Upload folder\./.test(utilSource), 'Gap scan suppresses the backfill-complete alert during silent runs');

assert(/const totalReviewRows = reviewData\.length;/.test(archiveSource), 'Review engine tracks total review row count');
assert(/if \(totalReviewRows === 0\) \{[\s\S]*buildAndSaveDashboardPayloadV2\(\[\], finalMirrorHeaders, \[\], refDict\);[\s\S]*Empty review fast path completed/m.test(archiveSource), 'Review engine has an empty-review fast path');
assert(/Submitted review slice was empty; continuing with .* ghost rows only/.test(archiveSource), 'Review engine logs ghost-only review slices explicitly');
assert(/BENNY ENGINE rebuild timings: /.test(archiveSource), 'Review engine logs rebuild timing summary');
assert(/markTiming\("reviewAssemblyMs", timerStartMs\);/.test(archiveSource), 'Review engine instruments review assembly timing');
assert(/rebuildTimings\.applyFormattingMs = 0;/.test(archiveSource), 'Review engine zeroes rebuild-time applyFormatting cost');
assert(/buildAndSaveDashboardPayloadV2\(reviewData, finalMirrorHeaders, highlightsData, refDict\);/.test(archiveSource), 'Review engine passes prebuilt refDict into payload builder');
assert(/existingResumeTriggersDeleted=/.test(archiveSource), 'Archive ingestion logs duplicate resume-trigger cleanup before rescheduling');
assert(/"INGESTION_STATUS": "resume_scheduled"/.test(archiveSource), 'Archive ingestion records when a resume trigger has been scheduled');
assert(/🔁 RESUMING INGESTION: deletedResumeTriggers=/.test(archiveSource), 'Archive ingestion logs resume-trigger cleanup at resume start');
assert(/BENNY ENGINE timing \[getReferenceDictionary\]: /.test(dictSource), 'Reference dictionary helper logs timing summary');
assert(/function bumpEngineDictionaryCacheVersion\(\)/.test(dictSource), 'Dictionary module exposes cache version invalidation helper');
assert(/const cacheKey = _getEngineDictCacheKey\(ENGINE_REF_DICT_CACHE_KEY\);/.test(dictSource), 'Reference dictionary uses a versioned cache key');
assert(/putChunkedCache\(cache, cacheKey, JSON\.stringify\(refDict\), 300\);/.test(dictSource), 'Reference dictionary stores live results in short-lived cache');
assert(/const cacheKey = _getEngineDictCacheKey\(ENGINE_VENDOR_DICT_CACHE_KEY\);/.test(dictSource), 'Vendor dictionary uses a versioned cache key');
assert(/putChunkedCache\(cache, cacheKey, JSON\.stringify\(vendorDict\), 180\);/.test(dictSource), 'Vendor dictionary stores live results in short-lived cache');
assert(/source=cache/.test(dictSource), 'Dictionary timing logs distinguish cache hits');
assert(/function buildAndSaveDashboardPayloadV2\(reviewData, headers, highlightsData, optionalRefDict\)/.test(read('src/02_Utilities.js')), 'Payload builder accepts optional prebuilt refDict');
assert(/bumpEngineDictionaryCacheVersion\(\);/.test(qbSource), 'QB sync invalidates dictionary cache version on reference refresh');
assert(/bumpEngineDictionaryCacheVersion\(\);/.test(utilSource), 'Admin log mutations invalidate dictionary cache version');
assert(/triggerCount: ScriptApp\.getProjectTriggers\(\)\.filter\(function\(t\) \{\s*return t\.getHandlerFunction\(\) === 'processCDQueue';\s*\}\)\.length/.test(cdSource), 'CD ingestion status reports active trigger count');
assert(/CDIngestion: Hourly triggers \(7 AM - 5 PM\) installed\. deleted=/.test(cdSource), 'CD trigger install logs deleted and active counts');
assert(/return deletedTriggerCount;/.test(cdSource), 'CD trigger removal reports how many triggers were deleted');

console.log('\nSync hot-path validation passed.');
