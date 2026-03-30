const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const checks = [
  {
    label: 'WebApp auto-routes phone users into GlassFlow unless desktop is explicitly requested',
    file: 'src/WebApp.html',
    patterns: [/autoRoutePhoneToGlassFlow/, /searchParams\.get\('v'\) === 'GlassFlow'/, /searchParams\.get\('shell'\) === 'desktop'/, /matchMedia\('\(pointer: coarse\) and \(max-width: 480px\)'\)/, /searchParams\.set\('v', 'GlassFlow'\)/, /location\.replace\(url\.toString\(\)\)/],
  },
  {
    label: 'WebApp mounts the polymorphic mobile dock shell',
    file: 'src/WebApp.html',
    patterns: [/<div id="mobile-dock">/, /id="m-dock-queue"/, /id="m-dock-detail"/],
  },
  {
    label: 'WebApp mounts the unified mobile search/filter sheet',
    file: 'src/WebApp.html',
    patterns: [/<div id="mobile-sf-overlay"/, /<div id="mobile-sf-sheet"/, /id="m-sf-search-input"/, /id="m-sf-sort-select"/],
  },
  {
    label: 'WebApp keeps the mobile detail back bar in the shared reading pane',
    file: 'src/WebApp.html',
    patterns: [/id="mobile-back-btn"/, /onclick="closeMobileDetail\(\)"/, /id="mobile-back-title"/],
  },
  {
    label: 'Phone queue open pushes into detail mode through shared pane state',
    file: 'src/_module_queue_state.html',
    patterns: [/function openPane\(item, cardEl\)/, /window\.innerWidth <= 480/, /classList\.add\('mobile-detail-open'\)/, /syncMobileDockContext/],
  },
  {
    label: 'Mobile shell helpers manage back navigation and search/filter sheet state',
    file: 'src/_module_webapp_core.html',
    patterns: [/function closeMobileDetail\(\)/, /classList\.remove\('mobile-detail-open'\)/, /function openMobileSFSheet\(tab\)/, /classList\.add\('mobile-sf-open'\)/, /function closeMobileSFSheet\(\)/, /classList\.remove\('mobile-sf-open'\)/],
  },
  {
    label: 'Mobile queue navigation reuses the shared openPane selection flow',
    file: 'src/_module_webapp_core.html',
    patterns: [/function navigateMobileQueue\(dir\)/, /filteredItems\.length/, /openPane\(nextItem, cardEl\)/, /centerQueueCardByFdh\(nextItem\.fdh, 'smooth'\)/],
  },
  {
    label: 'Dock context sync distinguishes queue, detail, and deck modes on phone widths',
    file: 'src/_module_webapp_core.html',
    patterns: [/function syncMobileDockContext\(\)/, /window\.innerWidth <= 480/, /mobile-detail-open/, /deck-mode-active/, /queueCtx\.style\.display/],
  },
  {
    label: 'Phone-only layout rules drive queue/detail push-pop and legacy shell visibility',
    file: 'src/_styles_layout.html',
    patterns: [/#mobile-dock \{ display: none; \}/, /#mobile-sf-overlay \{\s*display: none;/, /#mobile-sf-sheet \{\s*display: flex !important;/, /@media \(max-width: 480px\)/, /body\.mobile-detail-open \.inbox-sidebar \{ transform: translateX\(-100%\); \}/, /body\.mobile-detail-open \.reading-pane  \{ transform: translateX\(0\); \}/, /left: 12px !important;/, /right: 12px !important;/, /overflow-y: auto !important;/, /touch-action: pan-y !important;/],
  },
  {
    label: 'Phone filter presentation stays sheet-based behind the shared smart dock',
    file: 'src/_styles_responsive.html',
    patterns: [/@media \(max-width: 480px\)/, /body\.mobile-filter-open::after/, /body\.mobile-filter-open \.filter-strip\.smart-dock/, /max-height: 60vh/],
  },
  {
    label: 'GlassFlow detail hero keeps FDH, target date, and status above the fold',
    file: 'src/v2_shell_GlassFlow.html',
    patterns: [/class="glassflow-hero-top"/, /id="p-fdh"/, /id="p-target-wrap"/, /class="glassflow-hero-status-row"/, /id="p-status"/],
  },
  {
    label: 'GlassFlow detail dock owns Back, Skip, Commit, and AI Draft actions',
    file: 'src/v2_shell_GlassFlow.html',
    patterns: [/id="dock-btn-back"/, /id="dock-btn-skip"/, /id="btn-commit"/, /id="dock-btn-ai-draft"/, /function syncDetailDockState\(\)/, /function handleDockCommit\(\)/],
  },
  {
    label: 'GlassFlow detail commit state is textarea-driven and no inline commit buttons remain',
    file: 'src/v2_shell_GlassFlow.html',
    patterns: [/id="p-comment" class="chat-bubble" oninput="this\.dataset\.generated='false'; syncDetailDockState\(\)"/, /commitBtn\.classList\.toggle\('is-disabled', !hasNote\)/],
    absentPatterns: [/onclick="commitReview\(\)"/],
  },
];

let failed = false;

checks.forEach((check) => {
  const source = read(check.file);
  const missing = check.patterns.filter((pattern) => !pattern.test(source));
  const presentButDisallowed = (check.absentPatterns || []).filter((pattern) => pattern.test(source));
  if (missing.length === 0) {
    if (presentButDisallowed.length === 0) {
      console.log(`PASS ${check.label}`);
      return;
    }

    failed = true;
    console.error(`FAIL ${check.label}`);
    presentButDisallowed.forEach((pattern) => {
      console.error(`  Disallowed pattern in ${check.file}: ${pattern}`);
    });
    return;
  }

  failed = true;
  console.error(`FAIL ${check.label}`);
  missing.forEach((pattern) => {
    console.error(`  Missing pattern in ${check.file}: ${pattern}`);
  });
  presentButDisallowed.forEach((pattern) => {
    console.error(`  Disallowed pattern in ${check.file}: ${pattern}`);
  });
});

if (failed) {
  console.error('\nMobile shell validation failed.');
  process.exit(1);
}

console.log(`\nMobile shell validation passed (${checks.length} checks).`);
