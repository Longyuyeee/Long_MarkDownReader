import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const policy = json('shared/g10-cross-format-graph-acceptance-policy.json')
const packageJson = json('package.json')
const graph = read('src-tauri/src/commands/graph.rs')
const audit = read('docs/G10_Cross_Format_Knowledge_Network_Acceptance_Audit_2026-08-01.md')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

if (policy.schemaVersion !== 1 || policy.stage !== 'G10' || policy.appVersion !== packageJson.version || policy.releaseCandidate !== false) failures.push('G10 policy identity drift')
if (policy.status !== 'representative-cross-format-library-pulse-accepted-installed-observation-next' || policy.nextStage !== 'G11-installed-artifact-knowledge-pulse-observation') failures.push('G10 stage boundary drift')
if (policy.fixtureClassification !== 'synthetic-files-written-to-an-isolated-real-filesystem') failures.push('G10 evidence classification drift')
if (policy.requiredObjectTypes.length !== 11 || new Set(policy.requiredObjectTypes).size !== 11) failures.push('G10 object type matrix drift')
if (policy.requiredRelationTypes.length !== 5 || new Set(policy.requiredRelationTypes).size !== 5) failures.push('G10 relation type matrix drift')
if (policy.acceptance.minimumObjectCount !== 16 || policy.acceptance.minimumRelationCount !== 12 || policy.acceptance.minimumCoveragePercent !== 75 || policy.acceptance.maximumTopTopicCount !== 6) failures.push('G10 quantitative acceptance drift')
for (const key of ['realFilesystemGraphBuildComplete', 'representativeCrossFormatPulseComplete']) if (policy.qualityGate[key] !== true) failures.push(`G10 completed gate must remain true: ${key}`)
for (const key of ['installedDesktopObservationComplete', 'realUserLibraryObservationComplete', 'signedWindowsClientEvidenceComplete']) if (policy.qualityGate[key] !== false) failures.push(`G10 external gate must remain false: ${key}`)

for (const token of [
  'representative_cross_format_library_produces_a_useful_knowledge_pulse',
  'pulse.coverage_percent >= 75',
  'pulse.connected_object_count > pulse.isolated_object_count',
  'pulse.top_nodes.len() <= 6',
  '"pptx_slide"',
  '"pdf_annotation"',
  '"table_view"',
  '"canvas_node"',
  '"opml_node"',
]) requireText(graph, token, `G10 graph regression marker missing: ${token}`)
for (const relation of policy.requiredRelationTypes) requireText(graph, `"${relation}"`, `G10 graph relation missing: ${relation}`)
for (const token of ['G10', 'releaseCandidate=false', 'G11', '合成', '真实文件系统']) requireText(audit, token, `G10 audit marker missing: ${token}`)
if (!packageJson.scripts?.['check:g10-cross-format-graph-acceptance'] || !packageJson.scripts?.['check:graph-product-contract']?.includes('check-g10-cross-format-graph-acceptance')) failures.push('G10 checker must be reachable through graph product contract and ci:check')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('G10 cross-format graph acceptance passed: isolated real-filesystem content covers 11 object types, 5 relation types, useful coverage, and bounded ranked topics without claiming installed or real-user evidence.')
