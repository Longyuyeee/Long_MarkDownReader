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
const policy = json('shared/frontend-release-hardening-policy.json')
const viteConfig = read('vite.config.ts')
const statusDoc = read('docs/Current_Development_Status_and_Next_Plan_2026-07-30.md')
const auditDoc = read('docs/R5A_Frontend_Release_Bundle_Hardening_Audit_2026-07-30.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'R5A') fail('R5A frontend hardening policy identity mismatch.')
if (policy.releaseCandidate !== false) fail('R5A must keep releaseCandidate=false.')
if (policy.appVersion !== packageJson.version) fail('R5A appVersion must match package.json.')
if (policy.scope !== 'frontend-release-bundle-hardening') fail('R5A scope mismatch.')
if (policy.currentStatus !== 'chunk-domains-defined-budget-under-review') fail('R5A current status mismatch.')
if (policy.bundleBudget.chunkSizeWarningLimitKb !== 750) fail('R5A bundle budget must be 750 KiB.')
if (policy.bundleBudget.mustNotIncreaseWithoutAudit !== true) fail('R5A bundle budget must require audit before increase.')
if (policy.nextStage !== 'R5B') fail('R5A handoff must point to R5B.')

for (const token of [
  'chunkSizeWarningLimit: 750',
  'manualChunks:',
  'vue-vendor',
  'ui-vendor',
  'icon-vendor',
  'editor-vendor',
]) {
  if (!viteConfig.includes(token)) fail(`R5A Vite config token missing: ${token}`)
}

requireIncludes('R5A chunk domain', policy.chunkDomains, [
  'vue-vendor',
  'ui-vendor',
  'icon-vendor',
  'editor-vendor',
  'pdf-route-chunks',
  'graph-route-chunks',
  'diagram-route-chunks',
  'code-editor-route-chunks',
  'ocr-static-assets',
])

requireIncludes('R5A capability alignment', policy.capabilityAlignment, [
  'daily-management-workspace',
  'pdf-workflows',
  'knowledge-graph-visualization',
  'diagram-and-mindmap-workflows',
  'txt-json-dev-format-editing',
  'ocr-sidecar-workflows',
  'office-and-workbook-workflows',
])

requireIncludes('R5A known limit', policy.knownLimits, [
  'bundle-size-budget-is-a-release-warning-gate-not-a-runtime-performance-proof',
  'real-startup-performance-still-needs-desktop-measurement',
  'pdf-worker-and-large-diagram-modules-remain-intentionally-heavy-capability-assets',
])

requireIncludes('R5A audit doc token', auditDoc, [
  'R5A',
  'frontend-release-hardening-policy.json',
  'chunkSizeWarningLimit',
  'releaseCandidate=false',
  'R5B',
])
requireIncludes('R5A status doc token', statusDoc, [
  'R5A update',
  'frontend-release-hardening-policy.json',
  'chunk-domains-defined-budget-under-review',
  'R5B',
])

console.log('R5A frontend release hardening passed: chunk domains and audited release budget are defined.')
