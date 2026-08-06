import fs from 'node:fs'

const read = filePath => fs.readFileSync(filePath, 'utf8')
const json = filePath => JSON.parse(read(filePath))
const fail = message => {
  console.error(message)
  process.exit(1)
}

const requireIncludes = (label, values, expected) => {
  for (const value of expected) {
    if (!values.includes(value)) fail(`${label} missing: ${value}`)
  }
}

const packageJson = json('package.json')
const policy = json('shared/desktop-startup-performance-policy.json')
const appVue = read('src/App.vue')
const router = read('src/router/index.ts')
const frontendPolicy = json('shared/frontend-release-hardening-policy.json')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')
const auditDoc = read('docs/R5B_Desktop_Startup_Performance_Audit_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5B') fail('R5B desktop performance policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5B appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5B must keep releaseCandidate=false.')
if (policy.scope !== 'desktop-startup-and-route-performance-evidence') fail('R5B scope mismatch.')
if (policy.currentStatus !== 'runtime-marks-added-real-desktop-baseline-pending') fail('R5B current status mismatch.')
if (policy.evidenceState.localRuntimeMarks !== 'implemented') fail('R5B route runtime marks must be implemented.')
if (policy.evidenceState.desktopSmokeMeasurement !== 'pending') fail('R5B must truthfully keep desktop smoke measurement pending.')
if (policy.evidenceState.windowsVmMeasurement !== 'pending') fail('R5B must truthfully keep Windows VM measurement pending.')
if (policy.evidenceState.releaseBlocking !== true) fail('R5B must remain release blocking until real evidence exists.')
if (policy.performanceBudgets.routeLoaderMinimumVisibleMs !== 0 || policy.performanceBudgets.initialLoaderMinimumVisibleMs !== 120 || policy.performanceBudgets.documentNavigationOverlay !== 'disabled') fail('R5B navigation overlay budget must match App.vue.')
if (policy.performanceBudgets.routeHistoryEntryLimit !== 20) fail('R5B route performance history limit must be 20.')
if (policy.performanceBudgets.manualChunkWarningLimitKb !== frontendPolicy.bundleBudget.chunkSizeWarningLimitKb) {
  fail('R5B frontend budget must mirror R5A chunk budget.')
}
if (policy.performanceBudgets.mustNotPromoteToRcWithoutRealDesktopEvidence !== true) {
  fail('R5B must block RC promotion without real desktop evidence.')
}
if (policy.nextStage !== 'R5C') fail('R5B handoff must point to R5C.')

requireIncludes('R5B runtime signal', policy.runtimeSignals, [
  'performance.mark:longedit:route:<route>:start',
  'performance.mark:longedit:route:<route>:ready',
  'performance.measure:longedit:route:<route>',
  'window.__LONGEDIT_ROUTE_PERFORMANCE__',
])

requireIncludes('R5B route domain', policy.routeDomains, [
  'workspace',
  'library',
  'text-json-dev-editors',
  'pdf',
  'workbook',
  'diagram',
  'mindmap',
  'knowledge-graph',
  'canvas',
  'office-readers',
])

requireIncludes('R5B capability alignment', policy.capabilityAlignment, [
  'daily-management-workspace',
  'right-side-workspace-navigation',
  'knowledge-graph-visualization',
  'diagram-and-mindmap-workflows',
  'pdf-and-office-workflows',
  'txt-json-dev-format-editing',
])

for (const token of [
  '__LONGEDIT_ROUTE_PERFORMANCE__',
  'ROUTE_PERFORMANCE_MAX_ENTRIES = 20',
  'performance.mark(`longedit:route:${routeMeasurementName}:start`)',
  'performance.mark(`longedit:route:${routeMeasurementName}:ready`)',
  'performance.measure(',
  'recordRoutePerformance(routeMeasurementName, totalElapsedMs)',
  'Math.max(0, 120 - (performance.now() - appLoadingStartedAt))',
]) {
  if (!appVue.includes(token)) fail(`R5B App.vue runtime token missing: ${token}`)
}

for (const token of [
  "path: '/workspace'",
  "path: '/library'",
  "path: '/text'",
  "path: '/json'",
  "path: '/pdf'",
  "path: '/workbook'",
  "path: '/diagram'",
  "path: '/mindmap'",
  "path: '/graph'",
  'component: () => import(',
]) {
  if (!router.includes(token)) fail(`R5B lazy route token missing: ${token}`)
}

requireIncludes('R5B audit doc token', auditDoc, [
  'R5B',
  'desktop-startup-performance-policy.json',
  'window.__LONGEDIT_ROUTE_PERFORMANCE__',
  'releaseCandidate=false',
  'R5C',
])
requireIncludes('R5B status doc token', statusDoc, [
  'R5B update',
  'desktop-startup-performance-policy.json',
  'runtime-marks-added-real-desktop-baseline-pending',
  'R5C',
])

console.log('R5B desktop startup performance passed: runtime route marks and release evidence gate are defined.')
