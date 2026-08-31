import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v116-m5-2-odp-simple-slide-copy-policy.json')
const successor = json('shared/post-v116-m5-3-odp-workspace-policy.json')
const predecessor = json('shared/post-v116-m5-1-odp-producer-selection-policy.json')
const evidence = json('docs/evidence/post-v116-m5-2-odp-simple-slide-copy/audit.json')
const development = json('shared/development-version-policy.json')
const registry = json('shared/file-formats.json')
const edit = text('src-tauri/src/formats/odf_edit.rs')
const commands = text('src-tauri/src/commands/odf_content.rs')
const lib = text('src-tauri/src/lib.rs')
const view = text('src/views/OdfContentReaderView.vue')
const runner = text('scripts/run-post-v116-m5-2-odp-simple-slide-copy-audit.ps1')
const audit = text('docs/Post_v1.0.16_M5_2_ODP_Simple_Slide_Body_Reliable_Copy_Foundation_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.16_v1.0.17_Professional_Capability_Roadmap_2026-08-31.md')
const failures = []
const fail = message => failures.push(message)

if (policy.schemaVersion !== 1 || policy.stage !== 'M5-2' || policy.status !== 'accepted'
  || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-2 predecessor or identity drift')
if (policy.runtimeBaseVersion !== '1.0.16' || policy.publicVersion !== '1.0.16' || policy.developmentTargetVersion !== '1.0.17'
  || policy.binaryVersionChanged || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M5-2 version/privacy boundary drift')
if (policy.selectedNextStage?.id !== 'M5-3' || policy.selectedNextStage?.name !== 'odp-simple-slide-body-copy-workspace-and-real-desktop-audit'
  || policy.nextAction !== 'execute-m5-3-odp-simple-slide-body-copy-workspace-and-real-desktop-audit') fail('M5-2 handoff drift')
for (const [key, value] of Object.entries(policy.implementation ?? {})) {
  const expected = ['sourceOverwrite', 'uiExposed'].includes(key) ? false : true
  if (value !== expected) fail(`M5-2 implementation boundary drift: ${key}`)
}
for (const [key, value] of Object.entries(policy.nextStageRequirements ?? {})) {
  const expected = ['sourceOverwrite', 'binaryVersionChange'].includes(key) ? false : true
  if (value !== expected) fail(`M5-3 entry boundary drift: ${key}`)
}
if (!policy.versionClosureBlockers?.odpWorkspaceMissing || !policy.versionClosureBlockers?.realDesktopEvidenceMissing
  || policy.versionClosureBlockers?.unexpectedFullRustTestFailures !== 3 || policy.versionClosureBlockers?.fullRustTestPassed !== 545
  || policy.versionClosureBlockers?.fullRustTestIgnored !== 5 || !policy.versionClosureBlockers?.mustResolveBeforeV1017Packaging) fail('M5-2 version closure blockers drift')

const odp = registry.formats.find(format => format.id === 'odp')
if (successor.status === 'accepted'
  ? (odp?.capabilities?.edit !== 'supported' || odp?.adapters?.writer !== 'odf-slide-text' || odp?.userCapability?.level !== 'basic-edit' || odp?.userCapability?.saveMode !== 'copy')
  : (odp?.capabilities?.edit !== 'unsupported' || odp?.adapters?.writer !== null || odp?.userCapability?.level !== 'preview-only' || odp?.userCapability?.saveMode !== 'none')) fail('ODP registry does not match M5-3 progression')
for (const token of ['OdpSlideTextEditInventory', 'blocked_slides', 'complex-object:custom-shape', 'build_odp_slide_text_patch_isolated', 'changed_parts != [ODF_EDITABLE_PART]', 'longedit-odp-simple-slide-text-patch-v1']) if (!edit.includes(token)) fail(`M5-2 edit backend missing ${token}`)
for (const token of ['odp_edit_inventory', 'save_odp_slide_text_copy_to_path', 'ODP 可靠另存禁止覆盖源文件', 'write_new_bytes', 'save_m5_2_real_producer_odp_copies']) if (!commands.includes(token)) fail(`M5-2 command backend missing ${token}`)
if (!lib.includes('save_odp_slide_text_copy')) fail('M5-2 Tauri command registration missing')
if (successor.status === 'accepted'
  ? (!view.includes("invoke<OdpSavedCopyReport>('save_odp_slide_text_copy'") || !view.includes('odpEditInventory'))
  : (view.includes("invoke<OdpSavedCopyReport>('save_odp_slide_text_copy'") || view.includes('odpEditInventory'))) fail('ODP UI does not match M5-3 progression')

if (evidence.stage !== policy.stage || evidence.status !== 'accepted' || !evidence.actual?.requiredMatrixPassed
  || !evidence.actual?.sourceUnchanged || !evidence.actual?.complexProducerSlideBlocked
  || evidence.actual?.copies?.length !== 2 || evidence.differences?.length !== 3
  || evidence.decision?.selectedNextStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`
  || evidence.decision?.uiChanged || evidence.decision?.binaryVersionChanged || evidence.decision?.odpRegistryPromoted
  || evidence.privacy?.userContentIncluded) fail('M5-2 evidence drift')
for (const copy of evidence.actual?.copies ?? []) {
  if (copy.powerPointReopen?.expectedMissing?.length !== 0 || copy.powerPointReopen?.rejectedStillPresent?.length !== 0
    || copy.powerPointReopen?.expectedRecovered?.length !== 2 || !copy.libreOfficeReopen?.sourceUnchanged
    || copy.libreOfficeReopen?.pdfBytes < 1000) fail(`M5-2 producer reopen drift: ${copy.producer}`)
}
const rustEvidence = evidence.actual?.rust?.producerEvidence ?? []
if (!evidence.actual?.rust?.boundedTestsPassed || rustEvidence.length !== 3
  || rustEvidence[0]?.editableTargetCount !== 2 || rustEvidence[1]?.editableTargetCount !== 2
  || rustEvidence[2]?.editableTargetCount !== 0 || rustEvidence[2]?.blockedSlideCount !== 1
  || rustEvidence.slice(0, 2).some(item => !item.overwriteRejected || item.saved?.changedParts?.join(',') !== 'content.xml')) fail('M5-2 Rust producer evidence drift')
for (const token of ['LONGEDIT_M5_2_LIBREOFFICE_SOURCE', 'LONGEDIT_M5_2_POWERPOINT_SOURCE', 'LONGEDIT_M5_2_COMPLEX_SOURCE', 'Test-PowerPointReopen', 'Test-LibreOfficeRender']) if (!runner.includes(token)) fail(`M5-2 runner missing ${token}`)
for (const [document, tokens] of [[audit, ['真实测试：预期、实际与修正', '12,061', '43,935', '545 通过、3 失败、5 忽略', 'M5-3']], [roadmap, ['M5-2', 'M5-3', '整页阻断', '可靠副本', '3 个非预期失败']]]) for (const token of tokens) if (!document.includes(token)) fail(`M5-2 document missing ${token}`)
const publicProgression = (development.publicVersion === '1.0.16' && development.developmentTargetVersion === '1.0.17') || (development.publicVersion === '1.0.17' && development.developmentTargetVersion === '1.0.18')
if (![`${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`, `${successor.selectedNextStage.id}-${successor.selectedNextStage.name}`, 'M5-5-v1.0.17-atomic-version-transition-and-candidate-packaging', 'M5-6-v1.0.17-hosted-installer-lifecycle', 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit', 'M5-8-v1.0.17-tag-release-and-remote-asset-verification', 'M5-9-v1.0.16-to-v1.0.17-managed-updater-observation', 'M6-0-v1.0.18-scope-selection-audit', 'M6-1-knowledge-graph-bounded-fullscreen-lifecycle-and-real-desktop-audit'].includes(development.currentStage)
  || !['1.0.16', '1.0.17'].includes(development.runtimeBaseVersion) || !publicProgression) fail('M5-3 development identity drift')

if (failures.length) {
  console.error(`M5-2 ODP reliable copy failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M5-2 accepted: bounded simple-slide ODP reliable copies pass real LibreOffice/PowerPoint reopen; UI and version promotion remain M5-3+ work.')
