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
  if (start === -1) {
    throw new Error(`Could not find ${name}`);
  }

  let braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      return source.slice(start, i + 1);
    }
  }

  throw new Error(`Could not parse ${name}`);
}

const archiveSource = read('src/01_Engine_Archive.js');
const sharedSource = read('src/_utils_shared.html');
const matchingSource = read('src/01_Engine_Matching.js');
const queueSource = read('src/_module_queue_state.html');
const gridSource = read('src/_module_grid.html');

const context = {
  console,
};
vm.createContext(context);

[
  extractFunction(matchingSource, 'attemptFuzzyMatch'),
  extractFunction(archiveSource, 'classifyInferredReviewState'),
  extractFunction(sharedSource, 'getQBStatusClass'),
  extractFunction(sharedSource, 'getGanttClass'),
].forEach((snippet) => vm.runInContext(snippet, context));

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", received "${actual}"`);
  }
  console.log(`PASS ${label}`);
}

const vendorAssignment = context.classifyInferredReviewState('Vendor Assignment', 'Permitting');
assertEqual(vendorAssignment.flag, 'INFERRED: PRE-CON', 'Vendor Assignment stays in pre-con inference bucket');
assertEqual(vendorAssignment.stage, 'Vendor Assignment', 'Vendor Assignment stage is preserved');
assertEqual(context.getQBStatusClass(vendorAssignment.stage, vendorAssignment.status, false), 'chip-permit', 'Vendor Assignment pill class is permit');
assertEqual(context.getGanttClass(vendorAssignment.stage, vendorAssignment.status, false), 'g-color-purple', 'Vendor Assignment gantt color is permit purple');

const preCon = context.classifyInferredReviewState('Pre-Construction', 'Permitting');
assertEqual(preCon.flag, 'INFERRED: PRE-CON', 'Pre-Construction is not reclassified as Field CX');
assertEqual(context.getQBStatusClass(preCon.stage, preCon.status, false), 'chip-permit', 'Pre-Construction pill class is permit');

const fieldCx = context.classifyInferredReviewState('Field CX', 'Construction');
assertEqual(fieldCx.flag, 'INFERRED: FIELD CX', 'Field CX stays in field inference bucket');
assertEqual(context.getGanttClass(fieldCx.stage, fieldCx.status, false), 'g-color-yellow', 'Field CX gantt color remains active yellow');

const spliceOnly = context.classifyInferredReviewState('Field CX', 'Splicing Only');
assertEqual(spliceOnly.flag, 'INFERRED: SPLICING ONLY', 'Splicing Only gets its own inference flag');
assertEqual(spliceOnly.stage, 'Field CX', 'Splicing Only stays in Field CX stage');
assertEqual(context.getQBStatusClass(spliceOnly.stage, spliceOnly.status, false), 'chip-active', 'Splicing Only stays in the active field color family');

const refDict = {
  'CLE123-F45': { city: 'Cleveland' },
  'AKR123-F45': { city: 'Akron' },
};
assertEqual(context.attemptFuzzyMatch('CLE123-F45', Object.keys(refDict), null, refDict), 'CLE123-F45', 'Exact same-market IDs still match');
assertEqual(context.attemptFuzzyMatch('DAY123-F45', Object.keys(refDict), null, refDict), null, 'Cross-market fuzzy healing is blocked even when the F-number matches');

assertEqual(/let isPermit = st\.includes\('permit'\) \|\| st\.includes\('pre-con'\) \|\| st\.includes\('vendor assignment'\);/.test(queueSource), true, 'Queue schedule logic treats vendor assignment as pre-con');
assertEqual(/let isOnHold = stat\.includes\('hold'\);/.test(queueSource), true, 'Queue schedule logic no longer treats assignment as hold');
assertEqual(/let isPermit = st\.includes\('permit'\) \|\| st\.includes\('pre-con'\) \|\| st\.includes\('vendor assignment'\);/.test(gridSource), true, 'Grid schedule logic treats vendor assignment as pre-con');
assertEqual(/let isOnHold = stat\.includes\('hold'\);/.test(gridSource), true, 'Grid schedule logic no longer treats assignment as hold');
assertEqual(/const GHOST_ACTIVE_STAGES = \["FIELD CX", "PERMITTING", "CONSTRUCTION", "ACTIVE", "CX", "VENDOR ASSIGNMENT"\];/.test(archiveSource), true, 'Ghost carry-forward stage family includes permitting and vendor assignment');
assertEqual(/const isGhostEligibleStage = GHOST_ACTIVE_STAGES\.some\(function\(token\) \{\s*return stageUp\.includes\(token\) \|\| statUp\.includes\(token\);\s*\}\) \|\| statUp\.includes\("IN PROGRESS"\);/m.test(archiveSource), true, 'Ghost carry-forward eligibility uses the broader active stage family');
assertEqual(/if \(hasHistory && latest\) \{/.test(archiveSource), true, 'Ghost carry-forward keeps the no-history fallback path reachable');

console.log('\nProject inference validation passed.');
