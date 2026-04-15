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
assert(/'QB_SYNC_PHASE2_QUEUED_AT': String\(phase2QueuedAt\)/.test(qbSource), 'Async sync records when Phase 2 was queued');
assert(/const phase2QueueLatencyMs = queuedAtMs \? phase2StartMs - queuedAtMs : null;/.test(qbSource), 'Async sync computes Phase 2 queue latency explicitly');
assert(/V2 PAYLOAD timings: /.test(read('src/02_Utilities.js')), 'Payload builder logs step timings');

assert(/const totalReviewRows = reviewData\.length;/.test(archiveSource), 'Review engine tracks total review row count');
assert(/if \(totalReviewRows === 0\) \{[\s\S]*buildAndSaveDashboardPayloadV2\(\[\], finalMirrorHeaders, \[\], refDict\);[\s\S]*Empty review fast path completed/m.test(archiveSource), 'Review engine has an empty-review fast path');
assert(/Submitted review slice was empty; continuing with .* ghost rows only/.test(archiveSource), 'Review engine logs ghost-only review slices explicitly');
assert(/BENNY ENGINE rebuild timings: /.test(archiveSource), 'Review engine logs rebuild timing summary');
assert(/markTiming\("reviewAssemblyMs", timerStartMs\);/.test(archiveSource), 'Review engine instruments review assembly timing');
assert(/rebuildTimings\.applyFormattingMs = 0;/.test(archiveSource), 'Review engine zeroes rebuild-time applyFormatting cost');
assert(/buildAndSaveDashboardPayloadV2\(reviewData, finalMirrorHeaders, highlightsData, refDict\);/.test(archiveSource), 'Review engine passes prebuilt refDict into payload builder');
assert(/BENNY ENGINE timing \[getReferenceDictionary\]: /.test(dictSource), 'Reference dictionary helper logs timing summary');
assert(/function bumpEngineDictionaryCacheVersion\(\)/.test(dictSource), 'Dictionary module exposes cache version invalidation helper');
assert(/const cacheKey = _getEngineDictCacheKey\(ENGINE_REF_DICT_CACHE_KEY\);/.test(dictSource), 'Reference dictionary uses a versioned cache key');
assert(/putChunkedCache\(cache, cacheKey, JSON\.stringify\(refDict\), 300\);/.test(dictSource), 'Reference dictionary stores live results in short-lived cache');
assert(/const cacheKey = _getEngineDictCacheKey\(ENGINE_VENDOR_DICT_CACHE_KEY\);/.test(dictSource), 'Vendor dictionary uses a versioned cache key');
assert(/putChunkedCache\(cache, cacheKey, JSON\.stringify\(vendorDict\), 180\);/.test(dictSource), 'Vendor dictionary stores live results in short-lived cache');
assert(/source=cache/.test(dictSource), 'Dictionary timing logs distinguish cache hits');
assert(/function buildAndSaveDashboardPayloadV2\(reviewData, headers, highlightsData, optionalRefDict\)/.test(read('src/02_Utilities.js')), 'Payload builder accepts optional prebuilt refDict');
assert(/bumpEngineDictionaryCacheVersion\(\);/.test(qbSource), 'QB sync invalidates dictionary cache version on reference refresh');
assert(/bumpEngineDictionaryCacheVersion\(\);/.test(read('src/02_Utilities.js')), 'Admin log mutations invalidate dictionary cache version');

console.log('\nSync hot-path validation passed.');
