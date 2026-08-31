import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/post-v116-m5-3-odp-workspace-policy.json')
const predecessor = json('shared/post-v116-m5-2-odp-simple-slide-copy-policy.json')
const evidence = json('docs/evidence/post-v116-m5-3-odp-workspace/audit.json')
const development = json('shared/development-version-policy.json')
const registry = json('shared/file-formats.json')
const releaseMatrix = json('shared/release-capability-matrix.json')
const degradation = json('shared/safe-degradation-contract.json')
const view = read('src/views/OdfContentReaderView.vue')
const capture = read('scripts/capture-post-v116-m5-3-odp-workspace.mjs')
const runner = read('scripts/run-post-v116-m5-3-odp-workspace-audit.ps1')
const audit = read('docs/Post_v1.0.16_M5_3_ODP_Simple_Slide_Body_Copy_Workspace_Audit_2026-08-31.md')
const failures = []
const fail = message => failures.push(message)

if (policy.stage !== 'M5-3' || policy.status !== 'accepted' || policy.predecessor !== predecessor.stage
  || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-3 predecessor or acceptance drift')
if (policy.runtimeBaseVersion !== '1.0.16' || policy.publicVersion !== '1.0.16' || policy.developmentTargetVersion !== '1.0.17'
  || policy.binaryVersionChanged || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M5-3 version/privacy boundary drift')
for (const [key, value] of Object.entries(policy.workspace ?? {})) {
  const expected = key === 'sourceOverwrite' ? false : true
  if (value !== expected) fail(`M5-3 workspace boundary drift: ${key}`)
}
if (policy.realDesktop?.runtimeErrors !== 0 || !policy.realDesktop?.sourceUnchanged || !policy.realDesktop?.powerPointSemanticReopen
  || !policy.realDesktop?.libreOfficePdfReopen || policy.realDesktop?.editableTargetsPerSimpleSource !== 2) fail('M5-3 real desktop policy drift')
if (policy.selectedNextStage?.id !== 'M5-4' || policy.nextAction !== 'execute-m5-4-v1.0.17-quality-debt-and-release-readiness'
  || policy.versionClosureBlockers?.unexpectedFullRustTestFailures !== 4 || policy.versionClosureBlockers?.fullRustTestPassed !== 544
  || policy.versionClosureBlockers?.persistentIsolatedFailures !== 3 || policy.versionClosureBlockers?.intermittentIsolatedPasses !== 1
  || !policy.versionClosureBlockers?.mustResolveBeforeV1017Packaging) fail('M5-4 handoff or version blockers drift')

const odp = registry.formats.find(format => format.id === 'odp')
if (odp?.capabilities?.edit !== 'supported' || odp?.userCapability?.level !== 'basic-edit' || odp?.userCapability?.saveMode !== 'copy'
  || odp?.adapters?.writer !== 'odf-slide-text' || odp?.externalPolicy !== 'preview') fail('ODP bounded-copy registry drift')
if (releaseMatrix.formats?.find(item => item.id === 'odp')?.profile !== 'office-copy') fail('ODP release capability matrix must expose bounded copy editing')
if (!degradation.lanes?.find(lane => lane.id === 'verified-odf-reliable-copy')?.formats?.includes('odp')) fail('ODP safe-degradation lane must preserve reliable-copy isolation')
for (const token of ['odpEditInventory', 'odpEditAvailable', 'm5-3-odp-edit-banner', 'm5-3-odp-blocked-slide', 'beginOdpTextEdit', "invoke<OdpSavedCopyReport>('save_odp_slide_text_copy'", 'reloadDocument', '可靠另存 ODP 副本']) if (!view.includes(token)) fail(`M5-3 workspace missing ${token}`)
for (const token of ['LONGEDIT_M5_3_CASES', 'reload leave guard', 'responsive720x720', 'complexWholeSlideBlocked']) if (!capture.includes(token)) fail(`M5-3 capture missing ${token}`)
for (const token of ['New-Object -ComObject PowerPoint.Application', 'Invoke-LibreOfficeConversion', 'PowerPoint semantic reopen mismatch', 'localAbsolutePathsIncluded=$false']) if (!runner.includes(token)) fail(`M5-3 runner missing ${token}`)

if (evidence.stage !== `${policy.stage}-${policy.name}` || evidence.status !== 'passed' || evidence.decision?.selectedNextStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`
  || !evidence.decision?.stageAccepted || evidence.decision?.releaseCandidate || evidence.decision?.binaryVersionChanged
  || evidence.actual?.realProducers !== 2 || evidence.actual?.editableTargetsPerSimpleSource !== 2 || evidence.actual?.runtimeErrors !== 0
  || !evidence.actual?.sourceUnchanged || !evidence.actual?.complexWholeSlideBlocked || !evidence.actual?.responsive720x720
  || !evidence.actual?.uiAutomaticReopen || !evidence.actual?.powerPointSemanticReopen || !evidence.actual?.libreOfficeRenderReopen
  || evidence.differences?.length !== 3 || evidence.privacy?.localAbsolutePathsIncluded || evidence.privacy?.sourceUserContentIncluded) fail('M5-3 evidence drift')
if (JSON.stringify(evidence).match(/AppData|Users\\|targetPath|sourcePath|longedit-m5-3/i)) fail('M5-3 evidence contains a local path')
for (const copy of evidence.actual?.copies ?? []) if (!copy.sourceUnchanged || !copy.uiReopened || copy.targetBytes < 1000) fail(`M5-3 copy drift: ${copy.producer}`)
for (const result of evidence.actual?.powerPoint ?? []) if (!result.replacementRecovered || !result.originalRemoved || !result.notePreserved) fail(`M5-3 PowerPoint reopen drift: ${result.producer}`)
for (const result of evidence.actual?.libreOffice ?? []) if (result.pdfBytes < 1000) fail(`M5-3 LibreOffice reopen drift: ${result.producer}`)
for (const file of evidence.evidenceFiles ?? []) {
  const bytes = fs.readFileSync(path.join('docs/evidence/post-v116-m5-3-odp-workspace', file))
  if (bytes.length < 40_000 || crypto.createHash('sha256').update(bytes).digest('hex').length !== 64) fail(`M5-3 screenshot invalid: ${file}`)
}
for (const token of ['真实测试：预期、实际、差异与修正', '12,108', '43,938', '15,900', '14,109', 'M5-4', '544 通过、4 失败、5 忽略', '单独复跑通过']) if (!audit.includes(token)) fail(`M5-3 audit missing ${token}`)
if (![`${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`, 'M5-5-v1.0.17-atomic-version-transition-and-candidate-packaging', 'M5-6-v1.0.17-hosted-installer-lifecycle', 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit', 'M5-8-v1.0.17-tag-release-and-remote-asset-verification', 'M5-9-v1.0.16-to-v1.0.17-managed-updater-observation', 'M6-0-v1.0.18-scope-selection-audit'].includes(development.currentStage)) fail('development handoff has not progressed from M5-4')

if (failures.length) {
  console.error(`M5-3 ODP workspace failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M5-3 accepted: real LibreOffice/PowerPoint ODP workspace copies, draft protection, responsive UI and whole-slide blockers are verified; M5-4 owns release readiness.')
