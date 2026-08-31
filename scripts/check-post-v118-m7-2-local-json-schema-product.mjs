import fs from 'node:fs'

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const text = file => fs.readFileSync(file, 'utf8')
const failures = []
const fail = message => failures.push(message)

const policy = json('shared/post-v118-m7-2-local-json-schema-product-policy.json')
const predecessor = json('shared/post-v118-m7-1-local-json-schema-feasibility-policy.json')
const development = json('shared/development-version-policy.json')
const evidence = json('docs/evidence/post-v118-m7-2-local-json-schema-desktop/runtime-evidence.json')
const command = text('src-tauri/src/commands/json.rs')
const lib = text('src-tauri/src/lib.rs')
const view = text('src/views/JsonEditorView.vue')
const audit = text('docs/Post_v1.0.18_M7_2_Local_JSON_Schema_Product_and_Desktop_Audit_2026-08-31.md')
const roadmap = text('docs/Post_v1.0.18_v1.0.19_Professional_Capability_Roadmap_2026-08-31.md')
const handoff = text('docs/Development_Handoff.md')

if (policy.schemaVersion !== 1 || policy.stage !== 'M7-2' || policy.predecessor !== predecessor.stage || predecessor.status !== 'feasibility-accepted' || policy.status !== 'product-accepted') fail('M7-2 identity/predecessor drift')
if (policy.runtimeBaseVersion !== '1.0.18' || policy.publicVersion !== '1.0.18' || policy.developmentTargetVersion !== '1.0.19' || policy.releaseCandidate || policy.sourceUserContentIncluded) fail('M7-2 version/privacy boundary drift')
for (const key of ['libraryWorkspaceOnly', 'syntaxAndSchemaDiagnosticsSeparated', 'documentValuesMasked', 'explicitSaveUnchanged']) if (policy.productContract?.[key] !== true) fail(`M7-2 product contract drift: ${key}`)
for (const key of ['schemaDocumentsRecurse', 'externalDocumentsReadAdjacentSchema', 'largeFileRangeModeSchemaValidation']) if (policy.productContract?.[key] !== false) fail(`M7-2 closed boundary drift: ${key}`)
if (policy.productContract?.sourceWrites !== 0 || policy.productContract?.sidecarPattern !== '<document-stem>.schema.json') fail('M7-2 sidecar/write contract drift')
for (const key of ['tauriCommandRegistered', 'workspaceAuthorizationReused', 'realTauriDesktopAuditPassed', 'optionalSidecarZeroDiagnostics', 'sidecarHotRefresh', 'diagnosticSourceReveal', 'damagedSchemaFailsClosed', 'sourceAndSchemaBytesUnchangedAfterRestore']) if (policy.acceptance?.[key] !== true) fail(`M7-2 acceptance drift: ${key}`)
if (policy.acceptance?.jsonCommandTestsPassed !== 13 || policy.acceptance?.schemaKernelTestsPassed !== 9 || policy.acceptance?.frontendBuildModules !== 6275 || policy.acceptance?.runtimeErrors !== 0) fail('M7-2 automated acceptance count drift')

for (const token of ['pub fn validate_local_json_schema', 'WorkspaceGuard::new', 'local_schema_sidecar_path', 'validate_with_local_schema']) if (!command.includes(token)) fail(`M7-2 command token missing: ${token}`)
for (const token of ['validate_local_json_schema', 'data-testid="json-schema-panel"', 'syntax-blocked', 'external-unavailable', 'large-file-unavailable', 'Schema 文件不递归发现 sidecar', 'schemaPollTimer']) if (!(lib.includes(token) || view.includes(token))) fail(`M7-2 integration token missing: ${token}`)

if (evidence.stage !== 'M7-2-bounded-local-json-schema-product-implementation-and-real-desktop-audit' || evidence.status !== 'passed' || !evidence.passed || evidence.sourceUserContentIncluded || evidence.actual?.runtimeErrorCount !== 0 || !evidence.actual?.documentUnchanged || !evidence.actual?.restoredSchemaUnchanged) fail('M7-2 desktop evidence drift')
if (evidence.actual?.noSchema?.diagnostics?.length !== 0 || evidence.actual?.invalid?.diagnostics?.length !== 2 || evidence.actual?.validNarrow?.label !== '通过' || evidence.actual?.damaged?.label !== 'Schema 不可用') fail('M7-2 desktop state matrix drift')
if (evidence.actual?.invalid?.diagnostics?.some(item => !item.includes('[文档值已隐藏]')) || evidence.actual?.invalid?.overflow > 0 || evidence.actual?.validNarrow?.overflow > 0) fail('M7-2 masking/responsive evidence drift')
for (const screenshot of evidence.screenshots || []) if (!fs.existsSync(`docs/evidence/post-v118-m7-2-local-json-schema-desktop/${screenshot}`)) fail(`M7-2 screenshot missing: ${screenshot}`)

if (policy.selectedNextStage?.id !== 'M7-3' || !/^M[78]-(?:[3-9]|[1-9]\d)-/.test(development.currentStage) || !['1.0.18', '1.0.19', '1.0.20'].includes(development.runtimeBaseVersion) || development.releaseCandidate) fail('M7-3 successor handoff drift')
for (const [document, tokens] of [[audit, ['产品验收通过', '13 通过', '9 通过', '1280×800', '720×680', 'M7-3']], [roadmap, ['M7-2 产品验收通过', 'M7-3']], [handoff, ['M7-2 产品验收已通过', 'M7-3']]]) for (const token of tokens) if (!document.includes(token)) fail(`M7-2 document missing: ${token}`)

if (failures.length) { console.error(`M7-2 local JSON Schema product audit failed:\n- ${failures.join('\n- ')}`); process.exit(1) }
console.log('M7-2 accepted: bounded local JSON/JSONC Schema validation is integrated and passed real Tauri wide/narrow read-only acceptance; M7-3 quality readiness is next.')
