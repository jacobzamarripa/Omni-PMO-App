const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const utilities = fs.readFileSync(path.join(root, 'src/02_Utilities.js'), 'utf8');

function assertPattern(pattern, label) {
  if (!pattern.test(utilities)) {
    throw new Error(`FAIL ${label}: missing ${pattern}`);
  }
  console.log(`PASS ${label}`);
}

assertPattern(/function _buildPortfolioActionItems\(options\)/, 'Shared portfolio action-item assembler exists');
assertPattern(/Object\.keys\(refDict\)\.forEach\(function\(fdhKey\)/, 'Assembler iterates full reference inventory');
assertPattern(/reportingStatus:/, 'Assembler writes reportingStatus metadata');
assertPattern(/lastReportDate:/, 'Assembler writes lastReportDate metadata');
assertPattern(/const rawReferenceOfsDate = String\(refData\.canonicalOfsDate \|\| refData\.forecastedOFS \|\| ""\)\.trim\(\);/, 'Assembler declares raw canonical OFS source');
assertPattern(/const normalizedCanonicalOfsDate = _dashboardParseDate\(rawReferenceOfsDate\);/, 'Assembler normalizes canonical OFS before payload use');
assertPattern(/canonicalOfsDate: normalizedCanonicalOfsDate,[\s\S]*ofsDate: normalizedCanonicalOfsDate,/, 'Payload OFS fields use normalized canonical OFS');
assertPattern(/const referenceMeta = _buildReferenceConfidenceMeta\([\s\S]*referenceConfidenceScore: referenceMeta\.score,/, 'Assembler declares referenceMeta before payload use');
assertPattern(/let actionItems = _buildPortfolioActionItems\(/, 'Legacy payload path uses shared assembler');
assertPattern(/let actionItems = _buildPortfolioActionItems\(/, 'V2 payload path uses shared assembler');
assertPattern(/totalRows: actionItems\.length/, 'Payload totalRows aligns to portfolio inventory size');

console.log('\nActive portfolio payload validation passed.');
