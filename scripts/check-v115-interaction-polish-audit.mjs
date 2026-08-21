import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('docs/evidence/v115-interaction-polish')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const evidencePath = path.join(root, manifest.evidenceFile)
const evidenceBytes = fs.readFileSync(evidencePath)
const evidence = JSON.parse(evidenceBytes)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(`[v115-interaction-polish-audit] ${message}`) }

if (manifest.stage !== 'V1.0.15-interaction-polish' || evidence.stage !== manifest.stage) fail('stage mismatch')
if (manifest.status !== 'accepted') fail('visual evidence is not accepted')
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceCommit) || evidence.sourceCommit !== manifest.sourceCommit) fail('source commit mismatch')
if (sha256(evidenceBytes) !== manifest.evidenceSha256) fail('interaction evidence hash mismatch')
if (manifest.sourceUserContentIncluded !== false || evidence.sourceUserContentIncluded !== false) fail('evidence must not contain user content')
if (manifest.releaseCandidate !== false || evidence.releaseCandidate !== false) fail('interaction evidence must not claim release-candidate status')

if (evidence.tabMetrics?.nativeTitleCount !== 0) fail('native title tooltips remain in the workspace tabs')
if (!evidence.tooltip?.visible || !evidence.tooltip?.matchedPath || !evidence.tooltip.text.includes(evidence.tooltip.matchedPath)) fail('full-path application tooltip was not observed')
if (!evidence.tooltip.borderRadius || evidence.tooltip.borderRadius === '0px' || evidence.tooltip.boxShadow === 'none') fail('tooltip surface is missing modern radius or shadow')
if (evidence.contextPolicy?.ordinaryPrevented !== true) fail('ordinary WebView context menu was not suppressed')
if (evidence.contextPolicy?.editablePrevented !== false) fail('editable text context menu was incorrectly suppressed')
if (evidence.contextPolicy?.customEventPrevented !== true || evidence.contextPolicy?.customMenuVisible !== true) fail('file-tree custom context menu was not preserved')
if (evidence.runtimeErrorCount !== 0) fail('runtime errors were captured')

for (const screenshot of manifest.screenshots || []) {
  const bytes = fs.readFileSync(path.join(root, screenshot.file))
  if (bytes.length !== screenshot.bytes || sha256(bytes) !== screenshot.sha256) fail(`screenshot integrity mismatch: ${screenshot.file}`)
}
if (manifest.screenshots?.length !== 2) fail('expected two desktop screenshots')
for (const key of ['workspaceShellAligned', 'tooltipSurfaceAligned', 'defaultWebViewMenuAbsent', 'customFileTreeMenuVisible']) {
  if (manifest.visualReview?.[key] !== true) fail(`visual review is missing: ${key}`)
}

console.log('v1.0.15 interaction-polish audit passed: modern tab tooltip, contextual right-click policy, and accepted clean desktop evidence are aligned.')
