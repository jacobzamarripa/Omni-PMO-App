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

const bulk = read('src/08_BulkActions.js');
const action = read('src/_module_action_center.html');
const styles = read('src/_styles_action_center.html');

assert(/const CROSSINGS_ROUNDTRIP_HEADERS = \[\s*'FDH ID',\s*'Vendor',\s*'Special Crossings\? Yes\/No',\s*'Special Crossings Details',\s*'Source Verified Date'\s*\];/m.test(bulk), 'Crossings XLSX round-trip headers are exact');
assert(/function parseCrossingsImport\(base64Data, fileName\)/.test(bulk), 'Crossings import endpoint accepts filename-aware imports');
assert(/Drive\.Files\.insert\(\{ title: '\[TEMP\]_/.test(bulk), 'XLSX import converts through Drive advanced service');
assert(/Special Crossings\? Yes\/No is required/.test(bulk), 'Import rejects missing Yes/No values');
assert(/Special Crossings Details is required/.test(bulk), 'Import rejects missing Details values');
assert(/invalid crossing value/.test(bulk) && /Use YES or NO/.test(bulk), 'Import restricts crossing choices to YES or NO');
assert(/verifiedDate: dateIdx >= 0 \? _baDateText\(row\[dateIdx\]\) : ''/.test(bulk), 'Import preserves Source Verified Date when provided');
assert(/function exportCrossingsXLSXForFdhs\(fdhList\)/.test(bulk), 'Scoped XLSX export endpoint exists');
assert(/SpreadsheetApp\.newDataValidation\(\)\.requireValueInList\(\['YES', 'NO'\], true\)/.test(bulk), 'Exported workbook constrains Yes/No column');

assert(/function _acEnsurePermanentPeek\(\) \{\s*if \(!\['boms','comments'\]\.includes\(_acActiveTab\)\) return;/m.test(action), 'Crossings tab does not auto-open Quick Peek');
assert(/_acShowCrossingsExportScopeModal/.test(action), 'No-selection export uses scope modal');
assert(/_acSetXingVendorStatusFilter/.test(action), 'Vendor status chips are wired as filters');
assert(/_acToggleXingVendor/.test(action), 'Vendor-level checkbox selection is wired');
assert(/function _acApplyXingToSelected\(value\)/.test(action), 'Selected rows can be quick-filled to YES or NO');
assert(/function _acApplyDetailsToSelected\(\)/.test(action), 'Selected rows can receive shared details through a modal');
assert(/function _acClearXingSelection\(\)/.test(action), 'Selected rows can be cleared from the bulk toolbar');
assert(/function _acFocusCrossingContext\(fdh, scrollToXings\)/.test(action), 'Crossing row interactions can synchronize Quick Peek context');
assert(/onfocus="_acFocusCrossingContext/.test(action), 'Crossing inputs focus the active Quick Peek FDH');
assert(/onclick="_acFocusCrossingContext/.test(action), 'Crossing row clicks focus the active Quick Peek FDH');
assert(/function _acRenderVendorStatusChip\(vendor, status, label, count\)/.test(action), 'Vendor status chips share disabled-zero rendering');
assert(/disabled aria-disabled="true"/.test(action), 'Zero-count vendor status chips are disabled');
assert(/Set YES/.test(action) && /Set NO/.test(action) && /Apply Details/.test(action), 'Crossings selected toolbar exposes quick-fill actions');
assert(/ac-import-section-title">Unrecognized FDHs/.test(action), 'Import preview separates unrecognized FDHs');
assert(/ac-import-section-title">Rows Needing Correction/.test(action), 'Import preview separates validation errors');
assert(/if \(_acActiveTab === 'crossings'\) _acOpenPeekAtXings\(fdh\);/.test(action), 'Crossings Details opens Quick Peek at Special X-ings');
assert(/\.exportCrossingsXLSXForFdhs\(exportFdhs\)/.test(action), 'Frontend calls XLSX export endpoint');
assert(/\.parseCrossingsImport\(base64, file\.name\)/.test(action), 'Frontend calls XLSX-aware import endpoint');

assert(/\.ac-xing-card-wrap \.off-vendor-stack \{\s*width: min\(100%, 1040px\);\s*margin: 0 auto;/m.test(styles), 'Crossings rows are centered while detail panel is closed');
assert(/#action-workspace\.ac-peek-open \.ac-xing-card-wrap \.off-vendor-stack/.test(styles), 'Crossings rows can expand when detail panel opens');
assert(/\.ac-selected-summary/.test(styles), 'Selected row summary chips are styled');
assert(/\.ac-import-section/.test(styles), 'Grouped import preview sections are styled');
assert(/\.ac-xing-proj-row\.is-active-row/.test(styles), 'Active Quick Peek row is visually highlighted');
assert(/\.off-vendor-stat\.ac-xing-status-chip\.is-disabled/.test(styles), 'Disabled zero-count vendor status chips are styled');

console.log('\nCrossings bulk action validation passed.');
