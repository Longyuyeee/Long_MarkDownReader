import crypto from 'node:crypto'
import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const failures = []
const fail = message => failures.push(message)
const newlineVariants = file => {
  const raw = fs.readFileSync(file)
  const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'))
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))
  return [raw, lf, crlf]
}
const matchesIdentity = (file, expected) => newlineVariants(file).some(bytes => bytes.length === expected.bytes && crypto.createHash('sha256').update(bytes).digest('hex') === expected.sha256)

const policy = json('shared/post-v118-m7-0-v1019-scope-selection-policy.json')
const predecessor = json('shared/v118-managed-updater-lifecycle-policy.json')
const evidence = json('docs/evidence/post-v118-m7-0-v1019-scope-selection/selection-evidence.json')
const development = json('shared/development-version-policy.json')
const jsonView = text('src/views/JsonEditorView.vue')
const jsonFormat = text('src-tauri/src/formats/json.rs')
const jsonCommand = text('src-tauri/src/commands/json.rs')
const mediaCommand = text('src-tauri/src/commands/media.rs')
const cargo = text('src-tauri/Cargo.toml')
const audit = text('docs/Post_v1.0.18_M7_0_v1.0.19_Scope_Selection_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.18_v1.0.19_Professional_Capability_Roadmap_2026-08-31.md')
const alignment = text('docs/Development_Alignment_and_Closure_Plan_2026-08-02.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'M7-0' || policy.status !== 'scope-selected' || policy.predecessor !== predecessor.stage || predecessor.status !== 'hosted-managed-update-passed') fail('M7-0 identity/predecessor drift')
if (policy.runtimeBaseVersion !== '1.0.18' || policy.publicVersion !== '1.0.18' || policy.developmentTargetVersion !== '1.0.19' || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M7-0 version/privacy boundary drift')
const selected = policy.candidates?.filter(candidate => candidate.selected)
if (selected?.length !== 1 || selected[0].id !== 'local-json-schema-sidecar-provider-mapping' || policy.selectedNextStage?.id !== 'M7-1' || policy.selectedNextStage?.name !== 'local-json-schema-sidecar-provider-mapping-feasibility-audit' || policy.nextAction !== 'execute-m7-1-local-json-schema-sidecar-provider-mapping-feasibility-audit') fail('M7-0 selection drift')
for (const requirement of ['jsonAndJsoncOnly', 'localSiblingSidecarOnly', 'networkAccessForbidden', 'automaticRemoteResolutionForbidden', 'explicitDeterministicMapping', 'boundedSchemaBytesAndReferences', 'schemaDiagnosticsHaveProvenance', 'instancePathMapsToSourceLineColumn', 'noSchemaProducesNoBusinessDiagnostics', 'damagedUnsupportedOrUnsafeSchemaDegradesSafely', 'documentAndSchemaSourcesRemainReadOnlyDuringValidation', 'realTauriAuditRequiredBeforeProductAcceptance', 'yamlTomlXmlRemainOutOfScope']) if (policy.nextStageRequirements?.[requirement] !== true) fail(`M7-1 requirement drift: ${requirement}`)
if (policy.nextStageRequirements?.binaryVersionChange !== false) fail('M7-1 binary version boundary drift')

for (const token of ['MAX_JSON_SOURCE_BYTES', 'MAX_JSON_NODES', 'MAX_JSON_PATH_ENTRIES', 'pub struct JsonPathEntry', 'pub line: usize', 'pub column: usize', 'pub diagnostics: Vec<JsonDiagnostic>']) if (!jsonFormat.includes(token)) fail(`JSON foundation missing: ${token}`)
for (const source of [jsonView, jsonFormat, jsonCommand]) for (const absent of ['schemaProvider', 'schemaUri', '$schema']) if (source.includes(absent)) fail(`M7-0 baseline unexpectedly contains ${absent}`)
for (const token of ['discover_video_subtitles', 'find_matching_sidecar', 'same_stem']) if (!mediaCommand.includes(token)) fail(`safe sidecar precedent missing: ${token}`)
if (development.currentStage === 'M7-1-local-json-schema-sidecar-provider-mapping-feasibility-audit' && cargo.includes('jsonschema')) fail('M7-0 must not install a schema validator before feasibility work starts')

if (evidence.stage !== 'M7-0' || evidence.status !== 'accepted' || evidence.actual?.selectedCandidate !== selected[0].id || evidence.differences?.length !== 3 || evidence.selectedNextStage !== 'M7-1-local-json-schema-sidecar-provider-mapping-feasibility-audit' || evidence.releaseCandidate || evidence.sourceUserContentIncluded) fail('M7-0 evidence drift')
if (development.currentStage === 'M7-1-local-json-schema-sidecar-provider-mapping-feasibility-audit') {
  for (const identity of evidence.actual?.sourceIdentities ?? []) if (!fs.existsSync(identity.path) || !matchesIdentity(identity.path, identity)) fail(`M7-0 source identity drift: ${identity.path}`)
}
const candidateTransition = /^M7-(?:[4-9]|[1-9]\d)-/.test(development.currentStage)
const successorTransition = /^M8-[0-9]+-/.test(development.currentStage)
const publishedSuccessor = ['1.0.19', '1.0.20'].includes(development.publicVersion) && development.developmentTargetVersion === `1.0.${Number(development.publicVersion.split('.')[2]) + 1}`
if (development.runtimeBaseVersion !== (successorTransition ? '1.0.20' : candidateTransition ? '1.0.19' : '1.0.18') || (!publishedSuccessor && (development.publicVersion !== '1.0.18' || development.developmentTargetVersion !== '1.0.19')) || !/^M[78]-(?:[1-9]|[1-9]\d)-/.test(development.currentStage) || (successorTransition ? !development.binaryVersionTransition.startsWith('v1.0.20-') : candidateTransition ? !development.binaryVersionTransition.startsWith('v1.0.19-') : development.binaryVersionTransition !== 'v1.0.18-release-and-managed-updater-closed') || development.releaseCandidate) fail('M7 successor development handoff drift')
for (const [document, tokens] of [[audit, ['最初需求', '本地 JSON Schema sidecar', '未配置 Schema 时不制造错误', 'M7-1']], [roadmap, ['M7-0', 'M7-1', 'JSON/JSONC', '联网']], [alignment, ['M7-0 已完成', 'M7-1 禁止联网与远程自动解析']]]) for (const token of tokens) if (!document.includes(token)) fail(`M7-0 document missing: ${token}`)

if (failures.length) { console.error(`M7-0 scope selection failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-0 accepted: v1.0.19 selects only local JSON/JSONC Schema sidecar provider and mapping feasibility; remote providers, YAML/TOML projection, XSD, graph proxies, governance rings and ODP notes remain deferred.')
