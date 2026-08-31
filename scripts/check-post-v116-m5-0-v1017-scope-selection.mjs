import crypto from 'node:crypto'
import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const policy = json('shared/post-v116-m5-0-v1017-scope-selection-policy.json')
const evidence = json('docs/evidence/post-v116-m5-0-v1017-scope-selection/selection-evidence.json')
const development = json('shared/development-version-policy.json')
const registry = json('shared/file-formats.json')
const updater = json('shared/v116-managed-updater-lifecycle-policy.json')
const odfEdit = text('src-tauri/src/formats/odf_edit.rs')
const odfContent = text('src-tauri/src/formats/odf_content.rs')
const odfView = text('src/views/OdfContentReaderView.vue')
const audit = text('docs/Post_v1.0.16_M5_0_v1.0.17_Scope_Selection_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.16_v1.0.17_Professional_Capability_Roadmap_2026-08-31.md')
const failures = []
const fail = message => failures.push(message)

if (policy.schemaVersion !== 1 || policy.stage !== 'M5-0' || policy.status !== 'scope-selected'
  || policy.predecessor !== updater.stage || updater.status !== 'hosted-managed-update-passed') fail('M5-0 predecessor or identity drift')
if (policy.runtimeBaseVersion !== '1.0.16' || policy.publicVersion !== '1.0.16' || policy.developmentTargetVersion !== '1.0.17'
  || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M5-0 version/privacy boundary drift')
const selected = policy.candidates?.filter(candidate => candidate.selected)
if (selected?.length !== 1 || selected[0].id !== 'odp-bounded-slide-text'
  || policy.selectedNextStage?.id !== 'M5-1' || policy.selectedNextStage?.name !== 'odp-slide-text-producer-fidelity-and-object-selection'
  || policy.nextAction !== 'execute-m5-1-odp-slide-text-producer-fidelity-and-object-selection') fail('M5-0 selection drift')
if (Object.entries(policy.nextStageRequirements ?? {}).some(([key, value]) => key === 'productCodeChanges' || key === 'binaryVersionChange' ? value !== false : value !== true)) fail('M5-1 boundary drift')

const odp = registry.formats.find(format => format.id === 'odp')
if (odp?.capabilities?.edit !== 'unsupported' || odp?.adapters?.writer !== null || odp?.userCapability?.level !== 'preview-only' || odp?.userCapability?.saveMode !== 'none') fail('ODP was promoted before M5-1 evidence')
for (const token of ['MAX_ODP_SLIDES', 'pub struct OdpSlide', 'locator_kind: "odp-slide"', 'locator_kind: "odp-notes"']) if (!odfContent.includes(token)) fail(`ODP parser missing ${token}`)
for (const token of ['bounded-slide-text-candidate', 'real_ods_and_odp_are_isolated_without_part_drift']) if (!odfEdit.includes(token)) fail(`ODP isolation baseline missing ${token}`)
for (const token of ['class="odp-layout"', 'selectedSlide.notes', "const editAvailable = computed(() => !isExternal.value && isOds.value"]) if (!odfView.includes(token)) fail(`ODP read-only UI boundary missing ${token}`)

const fixture = 'src-tauri/tests/fixtures/odf-content/longedit-e1c-presentation.odp'
if (fs.statSync(fixture).size !== 15864 || sha256(fixture) !== '8ef886d0370d18a497ceb7811ed845a1f4d73064ae4a20cf37e0e1eb22554f52') fail('real ODP fixture identity drift')
if (evidence.stage !== policy.stage || evidence.status !== 'accepted' || evidence.actual?.selectedCandidate !== selected[0].id
  || evidence.actual?.realTest?.rustPassed !== 20 || evidence.actual?.realTest?.rustFailed !== 0
  || evidence.actual?.realTest?.libreOfficeVersion !== '26.2.4.2' || evidence.actual?.realTest?.notesPreserved !== false
  || evidence.differences?.length !== 3 || evidence.sourceUserContentIncluded || evidence.releaseCandidate) fail('M5-0 real evidence drift')
if (!['M5-1-odp-slide-text-producer-fidelity-and-object-selection', 'M5-2-odp-simple-slide-body-reliable-copy-foundation', 'M5-3-odp-simple-slide-body-copy-workspace-and-real-desktop-audit'].includes(development.currentStage)
  || development.runtimeBaseVersion !== '1.0.16' || development.publicVersion !== '1.0.16' || development.developmentTargetVersion !== '1.0.17') fail('M5-1 development handoff drift')
for (const [document, tokens] of [[audit, ['真实测试：预期与实际', 'M5-1', '备注继续只读', '20 通过']], [roadmap, ['M5-0', 'M5-1', 'LibreOffice 26.2.4.2']]]) {
  for (const token of tokens) if (!document.includes(token)) fail(`M5-0 document missing ${token}`)
}

if (failures.length) {
  console.error(`M5-0 scope selection failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M5-0 accepted: v1.0.17 selects only M5-1 ODP slide-body producer fidelity and object selection; ODP remains preview-only.')
