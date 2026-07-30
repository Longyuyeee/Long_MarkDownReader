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
const policy = json('shared/r5d-production-route-smoke-preflight-policy.json')
const r5cPolicy = json('shared/r5c-route-performance-smoke-policy.json')
const auditScript = read('scripts/audit-r5d-production-route-smoke-preflight.mjs')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')
const auditDoc = read('docs/R5D_Production_Route_Smoke_Preflight_Audit_2026-07-30.md')
const manifest = json('docs/evidence/r5d-production-route-smoke-preflight/manifest.json')
const routeAssets = json('docs/evidence/r5d-production-route-smoke-preflight/route-assets.json')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5D') fail('R5D policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5D appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5D must keep releaseCandidate=false.')
if (policy.scope !== 'production-route-smoke-preflight-evidence') fail('R5D scope mismatch.')
if (policy.currentStatus !== 'production-dist-preflight-supported-real-desktop-run-pending') fail('R5D current status mismatch.')
if (policy.preflightInputs.requiresProductionBuild !== true) fail('R5D must require a production build.')
if (policy.preflightInputs.requiresRuntimeExportToken !== '__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__') fail('R5D runtime export token mismatch.')
if (policy.releaseGate.currentPromotionEligible !== false) fail('R5D must not be promotion eligible.')
if (policy.releaseGate.preflightIsNotRuntimeSmokeProof !== true) fail('R5D must disclose that preflight is not runtime smoke proof.')
if (policy.releaseGate.requiresR5CRuntimeExportForFinalSmoke !== true) fail('R5D must require R5C runtime export for final smoke.')
if (r5cPolicy.nextStage !== 'R5D') fail('R5C must hand off to R5D.')
if (policy.nextStage !== 'R5E') fail('R5D handoff must point to R5E.')

requireIncludes('R5D route family', policy.requiredRouteAssetFamilies, [
  'WorkspaceHome',
  'LibraryMode',
  'TextEditorView',
  'JsonEditorView',
  'PdfView',
  'WorkbookView',
  'DiagramStudio',
  'MindMapView',
  'GraphView',
  'CanvasView',
  'ReleaseCapabilitiesView',
])

requireIncludes('R5D capability alignment', policy.capabilityAlignment, [
  'daily-management-workspace',
  'right-side-workspace-navigation',
  'pdf-and-office-workflows',
  'diagram-and-mindmap-workflows',
  'knowledge-graph-visualization',
  'txt-json-dev-format-editing',
])

for (const token of [
  'dist directory does not exist. Run npm run build first.',
  'requiresRuntimeExportToken',
  'runtimeExportTokenFound: true',
  'sourceUserContentIncluded: false',
  "evidenceLevel: 'production-dist-preflight'",
]) {
  if (!auditScript.includes(token)) fail(`R5D audit script token missing: ${token}`)
}

if (manifest.schemaVersion !== 1 || manifest.stage !== 'R5D') fail('R5D evidence manifest identity mismatch.')
if (manifest.appVersion !== packageJson.version) fail('R5D evidence appVersion mismatch.')
if (manifest.runtimeExportTokenFound !== true) fail('R5D evidence must prove runtime export token.')
if (manifest.sourceUserContentIncluded !== false) fail('R5D evidence must not include user content.')
if (manifest.releaseCandidate !== false || manifest.promotionEligible !== false) fail('R5D evidence must not promote release.')
if (manifest.evidenceLevel !== 'production-dist-preflight') fail('R5D evidence level mismatch.')
if (manifest.routeAssetFamiliesPresent !== policy.requiredRouteAssetFamilies.length) fail('R5D evidence route family count mismatch.')

if (routeAssets.schemaVersion !== 1 || routeAssets.stage !== 'R5D') fail('R5D route asset evidence identity mismatch.')
for (const family of policy.requiredRouteAssetFamilies) {
  const row = routeAssets.routeAssets?.find(item => item.family === family)
  if (!row || row.status !== 'present' || !Array.isArray(row.assets) || row.assets.length < 1) {
    fail(`R5D route asset evidence missing family: ${family}`)
  }
}

for (const scriptName of [
  'audit:r5d-production-route-smoke-preflight',
  'check:r5d-production-route-smoke-preflight',
]) {
  if (!packageJson.scripts?.[scriptName]) fail(`package script missing: ${scriptName}`)
}

requireIncludes('R5D audit doc token', auditDoc, [
  'R5D',
  'r5d-production-route-smoke-preflight-policy.json',
  'audit-r5d-production-route-smoke-preflight.mjs',
  'production-dist-preflight',
  'releaseCandidate=false',
  'R5E',
])
requireIncludes('R5D status doc token', statusDoc, [
  'R5D update',
  'r5d-production-route-smoke-preflight-policy.json',
  'production-dist-preflight-supported-real-desktop-run-pending',
  'R5E',
])

console.log('R5D production route smoke preflight passed: production bundle evidence is present and non-promotional.')
