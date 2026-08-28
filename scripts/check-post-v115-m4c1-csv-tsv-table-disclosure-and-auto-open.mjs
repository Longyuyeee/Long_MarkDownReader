import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const readJson = file => JSON.parse(read(file))
const policy = readJson('shared/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open-policy.json')
const predecessor = readJson('shared/post-v115-m4c0-controlled-conversion-workflow-selection-policy.json')
const successor = readJson('shared/post-v115-m4c2-opml-canvas-projection-disclosure-policy.json')
const evidence = readJson('docs/evidence/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open/interaction-evidence.json')
const manifest = readJson('docs/evidence/post-v115-m4c1-csv-tsv-table-disclosure-and-auto-open/manifest.json')
const development = readJson('shared/development-version-policy.json')
const tableView = read('src/views/TableView.vue')
const tableBackend = read('src-tauri/src/commands/table.rs')
const failures = []

if (policy.stage !== 'M4C-1' || policy.predecessor !== predecessor.stage || predecessor.selectedNextStage?.id !== policy.stage) failures.push('M4C-1 predecessor chain is invalid')
if (policy.sourceFormats?.join(',') !== 'csv,tsv' || policy.targetFormat !== 'longedit-table') failures.push('M4C-1 format scope drifted')
for (const [key, value] of Object.entries(policy.disclosureContract || {})) if (key !== 'lossFacts' && value !== true) failures.push(`disclosure gate missing: ${key}`)
if (policy.disclosureContract?.lossFacts?.length !== 7) failures.push('conversion loss fact set drifted')
if (policy.preservedBackendBoundaries?.maximumSourceBytes !== 33_554_432 || policy.preservedBackendBoundaries?.maximumRows !== 200_000 || policy.preservedBackendBoundaries?.maximumColumns !== 512 || policy.preservedBackendBoundaries?.maximumTargetBytes !== 67_108_864) failures.push('preserved Table backend limits drifted')
for (const token of ['data-testid="m4c1-create-table-copy"', "data-testid': 'm4c1-table-conversion-disclosure'", 'conversionSourcePath', 'conversionTargetPath', '转换规则与损失', '前 2,000 个非空值', '编码、BOM 和换行格式', "await openManagedFile(router, path)"]) if (!tableView.includes(token)) failures.push(`M4C-1 product marker missing: ${token}`)
if (tableView.includes("title: 'Table 副本已创建'") || tableView.includes('revealCreatedTable')) failures.push('legacy second-step success dialog remains')
for (const token of ['MAX_TABLE_BYTES', 'MAX_TABLE_ROWS', 'MAX_TABLE_COLUMNS', 'MAX_CELL_CHARS', 'validate_internal_table(&internal)?', 'MAX_INTERNAL_TABLE_BYTES', 'available_output_path(&directory, &stem, ".table.json")', 'write_bytes(&target, &output)?']) if (!tableBackend.includes(token)) failures.push(`Table backend boundary missing: ${token}`)
if (evidence.stage !== 'M4C-1' || evidence.status !== 'passed') failures.push('M4C-1 interaction evidence is not passed')
const actual = evidence.actual || {}
for (const key of ['csvDisclosureComplete', 'tsvDisclosureComplete', 'csvAutoOpenedActualTarget', 'tsvAutoOpenedNumberedTarget', 'csvSourceUnchanged', 'tsvSourceUnchanged', 'csvTargetReread', 'tsvTargetReread', 'csvTargetSerializationLossObserved', 'responsive1280', 'responsive480', 'sourceFilesUnchangedAfterAudit']) if (!actual[key]) failures.push(`desktop gate failed: ${key}`)
if (actual.csvTargetName !== 'Conversion Matrix.table.json' || actual.tsvFirstTargetName !== 'Conversion Outline.table.json' || actual.tsvCollisionTargetName !== 'Conversion Outline 1.table.json') failures.push('real target or collision names drifted')
if (actual.csvRows !== 2 || actual.csvColumns !== 3 || actual.tsvRows !== 2 || actual.tsvColumns !== 2) failures.push('target content reread drifted')
if (actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved || actual.successDialogObservedAfterCreate) failures.push('runtime, error surface or legacy success dialog gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 4) failures.push('M4C-1 screenshots have not completed visual review')
if (policy.selectedNextStage?.id !== successor.stage || successor.predecessor !== policy.stage || successor.selectedNextStage?.id !== 'M4C-3' || development.currentStage !== 'M4C-3-graph-derived-output-disclosure-selection') failures.push('M4C successor handoff is not aligned')
if (policy.releaseCandidate !== false || evidence.releaseCandidate !== false || development.releaseCandidate !== false) failures.push('release boundary changed')

if (failures.length) {
  console.error(`M4C-1 CSV/TSV Table conversion check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4C-1 accepted: CSV and TSV disclose conversion facts, preserve their sources, create collision-safe Table targets and open the actual result automatically.')
