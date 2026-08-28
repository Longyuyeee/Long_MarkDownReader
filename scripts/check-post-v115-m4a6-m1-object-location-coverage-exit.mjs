import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4a6-m1-object-location-coverage-exit-policy.json')
const evidenceDirectory = 'docs/evidence/post-v115-m4a6-m1-object-location-coverage-exit'
const evidence = readJson(path.join(evidenceDirectory, 'interaction-evidence.json'))
const manifest = readJson(path.join(evidenceDirectory, 'manifest.json'))
const navigation = read('src/services/fileNavigation.ts')
const graph = read('src-tauri/src/commands/graph.rs')
const knowledgeIndex = read('src-tauri/src/services/knowledge_index.rs')
const pptxFormat = read('src-tauri/src/formats/pptx.rs')
const graphView = read('src/components/GraphView.vue')
const relationContext = read('src/components/FileRelationContext.vue')
const pptxReader = read('src/views/PptxReaderView.vue')
const semantics = readJson('shared/graph-semantics.json')
const failures = []

if (policy.stage !== 'M4A-6' || policy.predecessor !== 'M4A-5' || policy.selectedNextStage?.id !== 'M4B-0') failures.push('stage chain is invalid')
if (policy.searchCoverage?.length !== 7 || policy.graphCoverage?.length !== 7) failures.push('the frozen 7 + 7 coverage matrix drifted')
for (const item of policy.searchCoverage || []) {
  if (![knowledgeIndex, pptxFormat].some(source => source.includes(`"${item.locatorKind}"`))) failures.push(`search locator producer missing: ${item.locatorKind}`)
}
for (const item of policy.graphCoverage || []) {
  if (!graph.includes(`object_type: "${item.childObjectType}"`) || !graph.includes(`kind: "${item.locatorKind}"`)) failures.push(`graph locator implementation missing: ${item.childObjectType}/${item.locatorKind}`)
  if (!semantics.objectTypes.some(entry => entry.id === item.childObjectType)) failures.push(`graph semantic missing: ${item.childObjectType}`)
}
for (const consumer of [graphView, relationContext]) {
  if (!consumer.includes('openManagedObject(router') || !consumer.includes('node.locator?.kind && node.locator.objectId')) failures.push('a graph consumer bypasses the shared navigation/focus contract')
}
for (const token of ["kind === 'table-row'", "kind === 'table-view'", "kind === 'opml-node'", "kind === 'workbook-sheet'", "kind.startsWith('pptx-')", "/^(?:docx|odt|ods|odp)-/.test(kind)"]) if (!navigation.includes(token)) failures.push(`shared navigation mapping missing: ${token}`)
if (!pptxReader.includes("if (!target) {\n    store.clearRelationObjectFocus()\n    return\n  }") || /activeSlideIndex\.value\)\s*\n\s*await applyRouteLocator\(\)/.test(pptxReader)) failures.push('PPTX file-level route does not clear stale slide relation focus')

const actual = evidence.actual
if (evidence.status !== 'passed' || actual?.search?.locatorFamilyCount !== 7 || actual?.search?.preciseOpenCount !== 7 || actual?.search?.returnedSearchStateCount !== 7) failures.push('real search location coverage is incomplete')
if (actual?.graph?.objectFamilyCount !== 7 || actual?.graph?.parentCount !== 7 || actual?.graph?.childCount !== 15 || actual?.graph?.containsRelationCount !== 15) failures.push('real bounded graph coverage/counts are invalid')
if (actual?.graph?.structuralMentionCount !== 0 || actual?.graph?.deferredFineGrainedNodeCount !== 0 || !actual?.graph?.sameSourceIdentityStable) failures.push('graph granularity/identity boundary failed')
if (actual?.graphInternalOpenCount !== 7 || actual?.relationContextInternalOpenCount !== 7 || actual?.returnedGraphCount !== 14) failures.push('real Graph/relation-context precise opening is incomplete')
if (actual?.runtimeErrorCount !== 0 || actual?.blockingErrorSurfaceObserved || !actual?.sourceFilesUnchanged) failures.push('runtime/source-safety gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 4) failures.push('visual evidence is not accepted')
const evidenceBytes = fs.readFileSync(path.join(evidenceDirectory, manifest.evidenceFile))
if (crypto.createHash('sha256').update(evidenceBytes).digest('hex') !== manifest.evidenceSha256) failures.push('evidence digest mismatch')
for (const screenshot of manifest.screenshots || []) {
  const file = path.join(evidenceDirectory, screenshot.file)
  if (!fs.existsSync(file) || fs.statSync(file).size !== screenshot.bytes || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== screenshot.sha256) failures.push(`screenshot integrity failed: ${screenshot.file}`)
}
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || manifest.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4A-6 M1 object location exit audit failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4A-6 accepted: 7 search locator families and 7 bounded graph object families open precisely through all three shared consumers.')
