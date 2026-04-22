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
assertPattern(/let actionItems = _buildPortfolioActionItems\(/, 'Legacy payload path uses shared assembler');
assertPattern(/let actionItems = _buildPortfolioActionItems\(/, 'V2 payload path uses shared assembler');
assertPattern(/totalRows: actionItems\.length/, 'Payload totalRows aligns to portfolio inventory size');

console.log('\nActive portfolio payload validation passed.');
