const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assertPattern(source, pattern, label, file) {
  if (!pattern.test(source)) {
    throw new Error(`${label}: missing ${pattern} in ${file}`);
  }
  console.log(`PASS ${label}`);
}

const utilities = read('src/02_Utilities.js');
const archive = read('src/01_Engine_Archive.js');
const dailyUpload = read('src/07_DailyUpload.js');
const shared = read('src/_utils_shared.html');

assertPattern(utilities, /function _getPortfolioVisibilityMeta\(input\)/, 'Shared portfolio visibility helper exists', 'src/02_Utilities.js');
assertPattern(utilities, /reason: 'approved-upcoming-60d'/, 'Portfolio helper supports approved upcoming window', 'src/02_Utilities.js');
assertPattern(utilities, /reason: 'terminal-grace-window'/, 'Portfolio helper supports OFS\/complete grace window', 'src/02_Utilities.js');
assertPattern(utilities, /reason: 'excluded-terminal-no-ofs-date'/, 'Portfolio helper excludes terminal items without OFS date', 'src/02_Utilities.js');
assertPattern(utilities, /reason: 'excluded-post-grace'/, 'Portfolio helper expires terminal items after grace cutoff', 'src/02_Utilities.js');
assertPattern(utilities, /reason:.*'active-default'/, 'Portfolio helper defaults non-terminal projects into Active Portfolio', 'src/02_Utilities.js');
assertPattern(utilities, /portfolioEligibilityReason:/, 'Dashboard payload stores portfolio eligibility reason', 'src/02_Utilities.js');
assertPattern(utilities, /portfolioGraceUntil:/, 'Dashboard payload stores grace cutoff metadata', 'src/02_Utilities.js');

assertPattern(archive, /const portfolioMeta = _getPortfolioVisibilityMeta\(/, 'Ghost row engine reuses shared portfolio visibility helper', 'src/01_Engine_Archive.js');
assertPattern(archive, /UPCOMING START WINDOW/, 'Ghost row engine adds upcoming-window ghost state', 'src/01_Engine_Archive.js');

assertPattern(dailyUpload, /portfolioMeta\.expectDailyReport/, 'Daily upload vendor-missing logic uses report-expected gate', 'src/07_DailyUpload.js');

assertPattern(shared, /function getPortfolioGraceCutoff\(item\)/, 'Frontend shared helper computes portfolio grace cutoff', 'src/_utils_shared.html');
assertPattern(shared, /return Date\.now\(\) > graceCutoff\.getTime\(\);/, 'Frontend terminal helper honors grace window before hiding items', 'src/_utils_shared.html');

console.log('\nActive portfolio validation passed.');
