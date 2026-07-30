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
const policy = json('shared/r5c-route-performance-smoke-policy.json')
const r5bPolicy = json('shared/desktop-startup-performance-policy.json')
const appVue = read('src/App.vue')
const captureScript = read('scripts/capture-r5c-route-performance-evidence.mjs')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')
const auditDoc = read('docs/R5C_Route_Performance_Smoke_Capture_Audit_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5C') fail('R5C policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5C appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5C must keep releaseCandidate=false.')
if (policy.scope !== 'route-performance-smoke-capture') fail('R5C scope mismatch.')
if (policy.currentStatus !== 'capture-path-defined-real-evidence-pending') fail('R5C current status mismatch.')
if (policy.inputContract.source !== 'window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__') fail('R5C input source mismatch.')
if (policy.inputContract.schemaVersion !== 1) fail('R5C input schema must be 1.')
if (policy.outputContract.defaultDirectory !== 'docs/evidence/r5c-route-performance-smoke') fail('R5C output directory mismatch.')
if (policy.outputContract.sourceUserContentAllowed !== false) fail('R5C must not capture user document content.')
if (policy.releaseGate.currentPromotionEligible !== false) fail('R5C must not be promotion eligible yet.')
if (policy.releaseGate.requiresRealDesktopRun !== true) fail('R5C must require real desktop run.')
if (policy.releaseGate.requiresSignedArtifactForRc !== true) fail('R5C must require signed artifact for RC.')
if (policy.releaseGate.requiresWindowsVmEvidenceForRc !== true) fail('R5C must require Windows VM evidence for RC.')
if (r5bPolicy.nextStage !== 'R5C') fail('R5B must hand off to R5C.')
if (policy.nextStage !== 'R5D') fail('R5C handoff must point to R5D.')

requireIncludes('R5C input field', policy.inputContract.requiredFields, [
  'capturedAt',
  'routeHistoryLimit',
  'routes',
  'measures',
])

requireIncludes('R5C representative route', policy.representativeRoutes, [
  'WorkspaceHome',
  'LibraryMode',
  'TextEditor',
  'JsonEditor',
  'Pdf',
  'Workbook',
  'Diagram',
  'MindMap',
  'Graph',
  'Canvas',
  'ReleaseCapabilities',
])

requireIncludes('R5C capability alignment', policy.capabilityAlignment, [
  'daily-management-workspace',
  'right-side-workspace-navigation',
  'pdf-and-office-workflows',
  'diagram-and-mindmap-workflows',
  'knowledge-graph-visualization',
  'txt-json-dev-format-editing',
])

for (const token of [
  '__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__',
  'performance.getEntriesByType',
  'routeHistoryLimit: ROUTE_PERFORMANCE_MAX_ENTRIES',
  'routes: [...(window.__LONGEDIT_ROUTE_PERFORMANCE__ ?? [])]',
  'durationMs: Math.round(entry.duration)',
]) {
  if (!appVue.includes(token)) fail(`R5C App.vue export token missing: ${token}`)
}

for (const token of [
  'LONGEDIT_R5C_ROUTE_PERFORMANCE_INPUT',
  'docs/evidence/r5c-route-performance-smoke',
  'route-performance-evidence.json',
  'manifest.json',
  'replace(/^\\uFEFF/, \'\')',
  'sourceUserContentIncluded: false',
  'promotionEligible: false',
]) {
  if (!captureScript.includes(token)) fail(`R5C capture script token missing: ${token}`)
}

for (const scriptName of [
  'audit:r5c-route-performance-smoke',
  'check:r5c-route-performance-smoke',
]) {
  if (!packageJson.scripts?.[scriptName]) fail(`package script missing: ${scriptName}`)
}

requireIncludes('R5C audit doc token', auditDoc, [
  'R5C',
  'r5c-route-performance-smoke-policy.json',
  'capture-r5c-route-performance-evidence.mjs',
  'window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__',
  'releaseCandidate=false',
  'R5D',
])
requireIncludes('R5C status doc token', statusDoc, [
  'R5C update',
  'r5c-route-performance-smoke-policy.json',
  'capture-path-defined-real-evidence-pending',
  'R5D',
])

console.log('R5C route performance smoke capture passed: export contract and capture path are defined.')
