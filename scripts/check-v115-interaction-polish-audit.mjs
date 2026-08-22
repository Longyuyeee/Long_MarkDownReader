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
const normalizedEvidenceBytes = Buffer.from(evidenceBytes.toString('utf8').replaceAll('\r\n', '\n'))
if (sha256(normalizedEvidenceBytes) !== manifest.evidenceSha256) fail('interaction evidence hash mismatch')
if (manifest.sourceUserContentIncluded !== false || evidence.sourceUserContentIncluded !== false) fail('evidence must not contain user content')
if (manifest.releaseCandidate !== false || evidence.releaseCandidate !== false) fail('interaction evidence must not claim release-candidate status')

if (evidence.tabMetrics?.nativeTitleCount !== 0) fail('native title tooltips remain in the workspace tabs')
if (!evidence.tooltip?.visible || !evidence.tooltip?.matchedPath || !evidence.tooltip.text.includes(evidence.tooltip.matchedPath)) fail('full-path application tooltip was not observed')
if (!evidence.tooltip.borderRadius || evidence.tooltip.borderRadius === '0px' || evidence.tooltip.boxShadow === 'none') fail('tooltip surface is missing modern radius or shadow')
if (evidence.contextPolicy?.ordinaryPrevented !== true) fail('ordinary WebView context menu was not suppressed')
if (evidence.contextPolicy?.editablePrevented !== false) fail('editable text context menu was incorrectly suppressed')
if (evidence.contextPolicy?.customEventPrevented !== true || evidence.contextPolicy?.customMenuVisible !== true) fail('file-tree custom context menu was not preserved')
if (evidence.globalTooltipTarget?.nativeTitleCount !== 0 || evidence.globalTooltipTarget?.managedCount < 8) fail('global native-title adoption was not demonstrated')
if (!evidence.globalTooltipLight?.visible || evidence.globalTooltipLight?.borderRadius === '0px' || evidence.globalTooltipLight?.boxShadow === 'none') fail('light application tooltip surface is not accepted')
if (evidence.keyboardTooltip?.nativeTitle !== null || !evidence.keyboardTooltip?.describedBy?.includes('longedit-app-tooltip') || !evidence.keyboardTooltip?.ariaLabel) fail('keyboard tooltip semantics are incomplete')
if (!evidence.dropdownLight?.visible || evidence.dropdownLight?.borderRadius === '0px' || evidence.dropdownLight?.boxShadow === 'none' || Number(evidence.dropdownLight?.overlayOpacity) < 0.98 || Number(evidence.dropdownLight?.zIndex) < 1000 || evidence.dropdownLight?.height > 520 || evidence.dropdownLight?.bottom > evidence.dropdownLight?.viewportHeight + 1) fail('light dropdown surface, opacity, stacking or viewport bounds are not accepted')
if (!evidence.dialogLight?.visible || evidence.dialogLight?.borderRadius === '0px' || evidence.dialogLight?.boxShadow === 'none') fail('application dialog surface is not accepted')
if (Math.abs(Number(evidence.globalTooltipDarkNarrow?.devicePixelRatio) - 1.5) > 0.001 || evidence.globalTooltipDarkNarrow?.left < 7 || evidence.globalTooltipDarkNarrow?.right > evidence.globalTooltipDarkNarrow?.viewportWidth - 7) fail('dark narrow high-DPI tooltip bounds are not accepted')
if (!evidence.dropdownDarkNarrow?.visible || Number(evidence.dropdownDarkNarrow?.overlayOpacity) < 0.98 || Number(evidence.dropdownDarkNarrow?.zIndex) < 1000 || evidence.dropdownDarkNarrow?.right > evidence.dropdownDarkNarrow?.viewportWidth + 1 || evidence.dropdownDarkNarrow?.bottom > evidence.dropdownDarkNarrow?.viewportHeight + 1 || evidence.dropdownDarkNarrow?.height > 520) fail('dark narrow dropdown opacity, stacking or bounds are not accepted')
if (evidence.runtimeErrorCount !== 0) fail('runtime errors were captured')

for (const screenshot of manifest.screenshots || []) {
  const bytes = fs.readFileSync(path.join(root, screenshot.file))
  if (bytes.length !== screenshot.bytes || sha256(bytes) !== screenshot.sha256) fail(`screenshot integrity mismatch: ${screenshot.file}`)
}
if (manifest.screenshots?.length !== 7) fail('expected seven desktop screenshots')
for (const key of ['workspaceShellAligned', 'tooltipSurfaceAligned', 'globalTooltipPolicyAligned', 'dropdownSurfaceAligned', 'dialogSurfaceAligned', 'darkNarrowHighDpiAligned', 'defaultWebViewMenuAbsent', 'customFileTreeMenuVisible']) {
  if (manifest.visualReview?.[key] !== true) fail(`visual review is missing: ${key}`)
}

console.log('v1.0.15 interaction-polish audit passed: modern tab tooltip, contextual right-click policy, and accepted clean desktop evidence are aligned.')
