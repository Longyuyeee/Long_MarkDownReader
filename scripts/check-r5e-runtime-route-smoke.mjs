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
const policy = json('shared/r5e-runtime-route-smoke-policy.json')
const r5dPolicy = json('shared/r5d-production-route-smoke-preflight-policy.json')
const appVue = read('src/App.vue')
const tauriRuntime = read('src/services/tauriRuntime.ts')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')
const auditDoc = read('docs/R5E_Runtime_Route_Smoke_Audit_2026-07-31.md')
const manifest = json('docs/evidence/r5e-runtime-route-smoke/manifest.json')
const evidence = json('docs/evidence/r5e-runtime-route-smoke/route-performance-evidence.json')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5E') fail('R5E policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5E appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5E must keep releaseCandidate=false.')
if (policy.scope !== 'runtime-route-smoke-evidence') fail('R5E scope mismatch.')
if (policy.currentStatus !== 'browser-preview-runtime-smoke-blocked-by-tauri-api-dependencies') fail('R5E current status mismatch.')
if (policy.runtimeBoundary.browserPreviewMustNotRequireTauriInternals !== true) fail('R5E browser preview boundary missing.')
if (policy.runtimeBoundary.tauriRuntimeKeepsDesktopOpenFileIntegration !== true) fail('R5E Tauri runtime boundary missing.')
if (policy.runtimeBoundary.guardToken !== 'isTauriRuntime') fail('R5E guard token mismatch.')
if (policy.runtimeBoundary.requiredExportToken !== '__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__') fail('R5E export token mismatch.')
if (policy.releaseGate.currentPromotionEligible !== false) fail('R5E must not be promotion eligible.')
if (policy.releaseGate.browserPreviewSmokeCanPass !== false) fail('R5E must truthfully record current preview smoke as blocked.')
if (policy.releaseGate.browserPreviewSmokeIsNotSignedDesktopArtifactProof !== true) fail('R5E must disclose preview smoke limitation.')
if (r5dPolicy.nextStage !== 'R5E') fail('R5D must hand off to R5E.')
if (policy.nextStage !== 'R5F') fail('R5E handoff must point to R5F.')

requireIncludes('R5E route', policy.representativeRoutes, [
  '/workspace',
  '/library',
  '/text',
  '/json',
  '/pdf',
  '/workbook',
  '/diagram',
  '/mindmap',
  '/graph',
  '/canvas',
  '/release-capabilities',
])

requireIncludes('R5E capability alignment', policy.capabilityAlignment, [
  'daily-management-workspace',
  'right-side-workspace-navigation',
  'pdf-and-office-workflows',
  'diagram-and-mindmap-workflows',
  'knowledge-graph-visualization',
  'txt-json-dev-format-editing',
])

for (const token of [
  '__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__',
  'getCurrentWindow',
  "appWindow.label === 'main'",
  "invoke<string>('open_external_file_window'",
]) {
  if (!appVue.includes(token)) fail(`R5E App.vue runtime boundary token missing: ${token}`)
}

for (const token of [
  'export const isTauriRuntime',
  'window.__TAURI_INTERNALS__',
]) {
  if (!tauriRuntime.includes(token)) fail(`R5E centralized runtime boundary token missing: ${token}`)
}

if (manifest.schemaVersion !== 1 || manifest.stage !== 'R5E') fail('R5E manifest identity mismatch.')
if (manifest.appVersion !== packageJson.version) fail('R5E manifest appVersion mismatch.')
if (manifest.runtimeExportAvailable !== false) fail('R5E manifest must truthfully record missing runtime export availability.')
if (manifest.routeCount < policy.representativeRoutes.length) fail('R5E manifest route count is incomplete.')
if (manifest.failedRouteCount !== policy.representativeRoutes.length) fail('R5E manifest must capture all currently blocked preview routes.')
if (!manifest.blockerSummary?.includes('Tauri API')) fail('R5E manifest blocker summary must mention Tauri API coupling.')
if (manifest.sourceUserContentIncluded !== false) fail('R5E evidence must not include user content.')
if (manifest.releaseCandidate !== false || manifest.promotionEligible !== false) fail('R5E evidence must not promote release.')
if (manifest.evidenceLevel !== 'browser-preview-runtime-smoke') fail('R5E evidence level mismatch.')

if (evidence.schemaVersion !== 1 || evidence.stage !== 'R5E') fail('R5E evidence identity mismatch.')
for (const route of policy.representativeRoutes) {
  const row = evidence.routes?.find(item => item.route === route)
  if (!row || row.status !== 'failed' || row.runtimeExportAvailable !== false) {
    fail(`R5E runtime evidence missing expected blocked route: ${route}`)
  }
}

for (const scriptName of [
  'check:r5e-runtime-route-smoke',
]) {
  if (!packageJson.scripts?.[scriptName]) fail(`package script missing: ${scriptName}`)
}

requireIncludes('R5E audit doc token', auditDoc, [
  'R5E',
  'r5e-runtime-route-smoke-policy.json',
  'browser-preview-runtime-smoke',
  'blocked by Tauri API',
  'releaseCandidate=false',
  'R5F',
])
requireIncludes('R5E status doc token', statusDoc, [
  'R5E update',
  'r5e-runtime-route-smoke-policy.json',
  'browser-preview-runtime-smoke-blocked-by-tauri-api-dependencies',
  'R5F',
])

console.log('R5E runtime route smoke passed: blocker evidence is present, truthful, and non-promotional.')
