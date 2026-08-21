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
const policy = json('shared/r5f-safe-tauri-runtime-policy.json')
const r5ePolicy = json('shared/r5e-runtime-route-smoke-policy.json')
const adapter = read('src/services/tauriRuntime.ts')
const appStore = read('src/store/app.ts')
const libraryView = read('src/views/LibraryMode.vue')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')
const auditDoc = read('docs/R5F_Safe_Tauri_Runtime_Audit_2026-07-31.md')
const manifest = json('docs/evidence/r5f-safe-tauri-runtime/manifest.json')
const evidence = json('docs/evidence/r5f-safe-tauri-runtime/route-mount-evidence.json')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5F') fail('R5F policy identity mismatch.')
if (policy.appVersion !== packageJson.version) fail('R5F appVersion must match package.json.')
if (policy.releaseCandidate !== false) fail('R5F must keep releaseCandidate=false.')
if (policy.currentStatus !== 'browser-preview-route-mount-smoke-passed-desktop-io-pending') fail('R5F current status mismatch.')
if (r5ePolicy.nextStage !== 'R5F') fail('R5E must hand off to R5F.')
if (policy.nextStage !== 'R5G') fail('R5F handoff must point to R5G.')
if (policy.releaseGate.browserPreviewRouteMountPassed !== true) fail('R5F route mount gate must pass.')
if (policy.releaseGate.browserPreviewDoesNotProveDesktopFileIo !== true) fail('R5F evidence boundary missing.')
if (policy.releaseGate.currentPromotionEligible !== false) fail('R5F must not be promotion eligible.')

requireIncludes('R5F route', policy.representativeRoutes, [
  '/workspace', '/library', '/text', '/json', '/pdf', '/workbook',
  '/diagram', '/mindmap', '/graph', '/canvas', '/release-capabilities',
])

for (const token of [
  'export const isTauriRuntime',
  'TauriRuntimeUnavailableError',
  'return tauriInvoke<T>',
  'if (!isTauriRuntime()) return () => undefined',
]) {
  if (!adapter.includes(token)) fail(`R5F adapter token missing: ${token}`)
}

for (const token of [
  "import { invoke, invokeWithTimeout, isTauriRuntime, withTimeout } from '../services/tauriRuntime'",
  "invokeWithTimeout<any>('get_config'",
  'if (!isTauriRuntime())',
  'this.restoreTabsState()',
]) {
  if (!appStore.includes(token)) fail(`R5F store boundary token missing: ${token}`)
}

for (const token of [
  "import { isTauriRuntime, listen } from '../services/tauriRuntime'",
  "if (isTauriRuntime())",
  "getCurrentWindow().listen('tauri://focus'",
  'getCurrentWindow().onDragDropEvent',
]) {
  if (!libraryView.includes(token)) fail(`R5F library boundary token missing: ${token}`)
}

if (manifest.stage !== 'R5F' || manifest.appVersion !== packageJson.version) fail('R5F manifest identity mismatch.')
if (manifest.routeCount !== policy.representativeRoutes.length || manifest.passedRouteCount !== manifest.routeCount || manifest.failedRouteCount !== 0) {
  fail('R5F manifest route counts mismatch.')
}
if (manifest.desktopFileIoProven !== false || manifest.releaseCandidate !== false || manifest.promotionEligible !== false) {
  fail('R5F manifest must remain truthful and non-promotional.')
}

for (const route of policy.representativeRoutes) {
  const row = evidence.routes?.find(item => item.route === route)
  if (!row || row.status !== 'passed' || row.appMounted !== true || row.routeWrapperMounted !== true || row.crashFallbackVisible !== false) {
    fail(`R5F runtime evidence missing successful route mount: ${route}`)
  }
}
if (evidence.desktopFileIoProven !== false || evidence.sourceUserContentIncluded !== false) fail('R5F evidence boundary mismatch.')

requireIncludes('R5F audit doc token', auditDoc, [
  'R5F',
  'src/services/tauriRuntime.ts',
  'browser-preview-route-mount-smoke-passed-desktop-io-pending',
  'releaseCandidate=false',
  'R5G',
])
requireIncludes('R5F status doc token', statusDoc, [
  'R5F update',
  'r5f-safe-tauri-runtime-policy.json',
  'browser-preview-route-mount-smoke-passed-desktop-io-pending',
  'R5G',
])

if (!packageJson.scripts?.['check:r5f-safe-tauri-runtime']) fail('R5F package script missing.')

console.log('R5F safe Tauri runtime passed: all representative preview routes mount without promoting desktop I/O evidence.')
