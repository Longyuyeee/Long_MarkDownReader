import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const policy = json('shared/post-v116-m5-1-odp-producer-selection-policy.json')
const predecessor = json('shared/post-v116-m5-0-v1017-scope-selection-policy.json')
const evidence = json('docs/evidence/post-v116-m5-1-odp-producer-selection/producer-selection.json')
const development = json('shared/development-version-policy.json')
const registry = json('shared/file-formats.json')
const workspace = json('shared/post-v116-m5-3-odp-workspace-policy.json')
const runner = text('scripts/run-post-v116-m5-1-odp-producer-selection-audit.ps1')
const audit = text('docs/Post_v1.0.16_M5_1_ODP_Slide_Text_Producer_Fidelity_and_Object_Selection_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.16_v1.0.17_Professional_Capability_Roadmap_2026-08-31.md')
const failures = []
const fail = message => failures.push(message)

if (policy.schemaVersion !== 1 || policy.stage !== 'M5-1' || policy.status !== 'accepted'
  || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) fail('M5-1 predecessor or identity drift')
if (policy.runtimeBaseVersion !== '1.0.16' || policy.publicVersion !== '1.0.16' || policy.developmentTargetVersion !== '1.0.17'
  || policy.productCodeChanged || policy.binaryVersionChanged || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M5-1 version/privacy boundary drift')
if (policy.selectedObjectClass !== 'direct-draw-frame-text-box-text-paragraph-on-simple-slide'
  || policy.selectedNextStage?.id !== 'M5-2' || policy.selectedNextStage?.name !== 'odp-simple-slide-body-reliable-copy-foundation'
  || policy.nextAction !== 'execute-m5-2-odp-simple-slide-body-reliable-copy-foundation') fail('M5-1 object selection drift')
if (!policy.selectionRules?.slideMustContainOnlyDirectTextFrames || !policy.selectionRules?.presenterNotesReadOnly
  || !policy.selectionRules?.slidesWithCustomShapesBlocked || !policy.selectionRules?.listsFieldsMediaAnimationsMastersReadOnly
  || !policy.selectionRules?.sourceDigestMustRemainUnchangedDuringReopen || !policy.selectionRules?.reliableCopyOnly
  || policy.selectionRules?.sourceOverwrite !== false) fail('M5-1 selection rules drift')
if (Object.entries(policy.nextStageRequirements ?? {}).some(([key, value]) => key === 'binaryVersionChange' ? value !== false : value !== true)) fail('M5-2 entry boundary drift')

const odp = registry.formats.find(format => format.id === 'odp')
if (workspace.status === 'accepted'
  ? (odp?.capabilities?.edit !== 'supported' || odp?.adapters?.writer !== 'odf-slide-text' || odp?.userCapability?.level !== 'basic-edit' || odp?.userCapability?.saveMode !== 'copy')
  : (odp?.capabilities?.edit !== 'unsupported' || odp?.adapters?.writer !== null || odp?.userCapability?.level !== 'preview-only' || odp?.userCapability?.saveMode !== 'none')) fail('ODP registry does not match later-stage progression')
if (evidence.stage !== policy.stage || evidence.status !== 'accepted' || !evidence.actual?.requiredMatrixPassed
  || !evidence.actual?.simpleBodyTextStable || evidence.actual?.notesPreservedByBoth !== false
  || evidence.actual?.outputs?.length !== 2 || evidence.differences?.length !== 3 || evidence.attemptHistory?.length !== 4
  || evidence.decision?.selectedNextStage !== `${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`
  || evidence.decision?.editableCandidate !== policy.selectedObjectClass
  || !evidence.decision?.slidesWithCustomShapesBlocked || evidence.privacy?.userContentIncluded) fail('M5-1 real evidence drift')
for (const output of evidence.actual?.outputs ?? []) {
  if (output.inventory?.slideCount !== 2 || output.inventory?.simpleParagraphCount !== 4
    || output.powerPointReopen?.bodyMarkersRecovered?.length !== 4 || output.powerPointReopen?.bodyMarkersMissing?.length !== 0
    || !output.libreOfficeReopen?.sourceUnchanged || output.libreOfficeReopen?.pdfBytes < 1000) fail(`M5-1 producer matrix drift: ${output.producer}`)
}
const libreOffice = evidence.actual?.outputs?.find(output => output.producer === 'libreoffice-impress')
const powerPoint = evidence.actual?.outputs?.find(output => output.producer === 'microsoft-powerpoint')
if (libreOffice?.inventory?.missingMarkers?.join(',') !== 'M5_LO_NOTE' || libreOffice?.powerPointReopen?.noteRecovered
  || powerPoint?.inventory?.complexShapeParagraphCount !== 1 || !powerPoint?.powerPointReopen?.noteRecovered) fail('M5-1 read-only boundary evidence drift')
for (const token of ['PowerPoint.Application', 'libreoffice-impress', 'M5_LO_BODY_A', 'M5_PPT_BODY_A', 'sourceUnchanged', 'slidesWithCustomShapesBlocked']) if (!runner.includes(token)) fail(`M5-1 runner missing ${token}`)
for (const [document, tokens] of [[audit, ['真实测试：预期、实际与修正', '4/4', '整页阻断', 'M5-2']], [roadmap, ['M5-1', 'M5-2', '4/4', '复杂对象']]]) {
  for (const token of tokens) if (!document.includes(token)) fail(`M5-1 document missing ${token}`)
}
const publicProgression = (development.publicVersion === '1.0.16' && development.developmentTargetVersion === '1.0.17') || (development.publicVersion === '1.0.17' && development.developmentTargetVersion === '1.0.18')
if (!([`${policy.selectedNextStage.id}-${policy.selectedNextStage.name}`, 'M5-3-odp-simple-slide-body-copy-workspace-and-real-desktop-audit', 'M5-4-v1.0.17-quality-debt-and-release-readiness', 'M5-5-v1.0.17-atomic-version-transition-and-candidate-packaging', 'M5-6-v1.0.17-hosted-installer-lifecycle', 'M5-7-v1.0.17-final-artifact-manifest-and-release-readiness-audit', 'M5-8-v1.0.17-tag-release-and-remote-asset-verification', 'M5-9-v1.0.16-to-v1.0.17-managed-updater-observation'].includes(development.currentStage) || /^M6-[0-9]+-/.test(development.currentStage))
  || !['1.0.16', '1.0.17', '1.0.18'].includes(development.runtimeBaseVersion) || !publicProgression) fail('M5-2 development handoff drift')

if (failures.length) {
  console.error(`M5-1 ODP producer selection failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M5-1 accepted: only direct text-frame paragraphs on simple ODP slides advance to M5-2; notes and complex-object slides remain blocked.')
