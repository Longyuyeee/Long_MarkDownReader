import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const failures = []
const fail = message => failures.push(message)

const policy = json('shared/post-v118-m7-1-local-json-schema-feasibility-policy.json')
const predecessor = json('shared/post-v118-m7-0-v1019-scope-selection-policy.json')
const evidence = json('docs/evidence/post-v118-m7-1-local-json-schema-feasibility/feasibility-evidence.json')
const development = json('shared/development-version-policy.json')
const cargo = text('src-tauri/Cargo.toml')
const source = text('src-tauri/src/formats/json_schema.rs')
const audit = text('docs/Post_v1.0.18_M7_1_Local_JSON_Schema_Feasibility_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.18_v1.0.19_Professional_Capability_Roadmap_2026-08-31.md')
const handoff = text('docs/Development_Handoff.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'M7-1' || policy.predecessor !== predecessor.stage || predecessor.status !== 'scope-selected' || policy.status !== 'feasibility-accepted') fail('M7-1 identity/predecessor drift')
if (policy.runtimeBaseVersion !== '1.0.18' || policy.publicVersion !== '1.0.18' || policy.developmentTargetVersion !== '1.0.19' || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M7-1 version/privacy boundary drift')
for (const [key, expected] of [['schemaSourceByteLimit', 1048576], ['schemaNodeLimit', 50000], ['schemaReferenceLimit', 64], ['diagnosticLimit', 200]]) if (policy.contract?.[key] !== expected) fail(`M7-1 limit drift: ${key}`)
for (const key of ['externalReferencesAllowed', 'networkResolverFeaturesEnabled', 'crossDirectorySymlinksAllowed']) if (policy.contract?.[key] !== false) fail(`M7-1 offline boundary drift: ${key}`)
if (policy.contract?.sourceWrites !== 0 || policy.contract?.sidecarPattern !== '<document-stem>.schema.json' || policy.contract?.draft !== '2020-12') fail('M7-1 provider contract drift')
for (const key of ['realSiblingFilesReadOnlyPassed', 'jsoncCommentsAndTrailingCommasPassed', 'instancePathLineColumnMappingPassed', 'diagnosticValuesMasked', 'unsafeSchemaFailsClosed', 'noSchemaProducesNoBusinessDiagnostics']) if (policy.acceptance?.[key] !== true) fail(`M7-1 acceptance drift: ${key}`)
if (policy.acceptance?.targetedKernelTestsPassed !== 9 || policy.acceptance?.jsonRegressionTestsPassed !== 28 || policy.acceptance?.supplementalStrictClippy !== '43-pre-existing-lints-new-module-zero' || policy.acceptance?.productUiIntegrated || policy.acceptance?.realTauriProductAcceptance) fail('M7-1 feasibility/product boundary drift')

if (!cargo.includes('jsonschema = { version = "=0.52.1", default-features = false }')) fail('jsonschema offline dependency contract missing')
for (const token of ['MAX_SCHEMA_SOURCE_BYTES', 'MAX_SCHEMA_NODES', 'MAX_SCHEMA_REFERENCES', 'MAX_SCHEMA_DIAGNOSTICS', 'local_schema_sidecar_path', 'validate_with_local_schema', 'ensure_same_real_parent', 'pointer_to_json_path', 'masked_with', 'local-sibling-sidecar']) if (!source.includes(token)) fail(`M7-1 kernel token missing: ${token}`)
for (const forbidden of ['reqwest::', 'http://example', 'Command::new']) if (source.includes(forbidden)) fail(`M7-1 kernel contains forbidden token: ${forbidden}`)

if (evidence.stage !== 'M7-1' || evidence.status !== 'accepted' || evidence.actual?.tests?.kernel?.passed !== 9 || evidence.actual?.tests?.kernel?.failed !== 0 || evidence.actual?.tests?.existingJsonRegression?.passed !== 28 || evidence.actual?.tests?.existingJsonRegression?.failed !== 0 || evidence.actual?.tests?.supplementalStrictClippy?.existingFindings !== 43 || evidence.actual?.tests?.supplementalStrictClippy?.newModuleFindings !== 0 || evidence.differences?.length !== 3 || evidence.releaseCandidate || evidence.sourceUserContentIncluded) fail('M7-1 evidence drift')
if (policy.selectedNextStage?.id !== 'M7-2' || !/^M[78]-(?:[2-9]|[1-9]\d)-/.test(development.currentStage) || !['1.0.18', '1.0.19', '1.0.20', '1.0.21'].includes(development.runtimeBaseVersion) || development.releaseCandidate) fail('M7-2 successor handoff drift')
for (const [document, tokens] of [[audit, ['可行性通过', '不是产品验收', '9 通过', '28 通过', '43 条历史 lint', 'M7-2']], [roadmap, ['M7-1 可行性通过', 'M7-2', '真实 Tauri']], [handoff, ['M7-1 可行性已通过', 'M7-2', '不提升版本']]]) for (const token of tokens) if (!document.includes(token)) fail(`M7-1 document missing: ${token}`)

if (failures.length) { console.error(`M7-1 local JSON Schema feasibility failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-1 accepted: bounded offline JSON/JSONC Schema sidecar validation and source mapping are feasible; product UI and real Tauri acceptance remain M7-2 work.')
