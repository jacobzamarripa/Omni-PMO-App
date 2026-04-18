#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assertPattern(content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`Missing expected pattern: ${label}`);
  }
}

function assertNoPattern(content, pattern, label) {
  if (pattern.test(content)) {
    throw new Error(`Unexpected legacy pattern still present: ${label}`);
  }
}

const webApp = read('src/WebApp.html');
const glass = read('src/v2_shell_GlassFlow.html');
const queue = read('src/_module_queue_state.html');
const core = read('src/_module_webapp_core.html');
const searchModule = read('src/_module_global_search.html');
const searchState = read('src/_state_search.html');
const changelog = read('src/_module_changelog.html');
const signal = read('src/_module_signal.html');

assertPattern(webApp, /id="global-search-input"/, 'desktop header search input');
assertPattern(webApp, /id="global-search-dropdown"/, 'desktop search dropdown');
assertPattern(webApp, /id="gs-trigger-badge-primary"/, 'desktop trigger shortcut badge');
assertPattern(webApp, /id="gs-spotlight-badge-primary"/, 'desktop spotlight shortcut badge');
assertPattern(glass, /id="btn-global-search"/, 'mobile search trigger');
assertPattern(glass, /id="m-global-search-input"/, 'mobile search input');
assertPattern(glass, /id="m-global-search-results"/, 'mobile search results container');
assertNoPattern(webApp, /id="gs-badge-primary"/, 'legacy duplicated desktop shortcut badge id');

assertPattern(webApp, /include\('_state_search'\)/, 'desktop search state include');
assertPattern(webApp, /include\('_module_global_search'\)/, 'desktop search module include');
assertPattern(glass, /include\('_state_search'\)/, 'mobile search state include');
assertPattern(glass, /include\('_module_global_search'\)/, 'mobile search module include');

assertNoPattern(webApp, /id="search-input"/, 'legacy dock search input in desktop shell');
assertNoPattern(glass, /id="m-sf-search-input"/, 'legacy mobile filter-sheet search input');

assertNoPattern(queue, /handleSearchInput\s*\(/, 'legacy queue search handler');
assertNoPattern(queue, /itemMatchesSearch\s*\(/, 'legacy queue search matcher');
assertNoPattern(queue, /search-input|m-sf-search-input/, 'legacy queue search DOM hooks');

assertPattern(core, /rebuildGlobalSearchIndex/, 'core rebuild hook');
assertPattern(searchModule, /window\.openGlobalSearch\s*=/, 'public openGlobalSearch export');
assertPattern(searchModule, /window\.navigateGlobalSearchResult\s*=/, 'public navigation export');
assertPattern(searchState, /let globalSearchQuery = '';/, 'search state query');
assertPattern(changelog, /data-activity-key=/, 'activity row data key');
assertPattern(signal, /data-signal-key=/, 'signal row data key');

console.log('validate-global-search: OK');
