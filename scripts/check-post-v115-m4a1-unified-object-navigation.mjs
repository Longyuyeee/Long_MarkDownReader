import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const navigationSource = read('src/services/fileNavigation.ts')
const compiledNavigation = ts.transpileModule(navigationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const navigation = await import(`data:text/javascript;base64,${Buffer.from(compiledNavigation).toString('base64')}`)
const failures = []
const expectQuery = (name, target, expected) => {
  const actual = navigation.managedObjectQuery(target, 'contract-token')
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${name}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

expectQuery('PDF annotation', { path: 'a.pdf', objectType: 'pdf', page: 3, annotationId: 'note-1' }, { page: '3', annotation: 'note-1' })
expectQuery('Graph PDF annotation', { path: 'a.pdf', objectType: 'pdf_annotation', locator: { kind: 'pdf_annotation', objectId: 'note-2', page: 4 } }, { page: '4', annotation: 'note-2' })
expectQuery('Workbook sheet', { path: 'a.xlsx', objectType: 'workbook', locator: { kind: 'workbook-sheet', objectId: 'Data' } }, { sheet: 'Data', locatorToken: 'contract-token' })
expectQuery('DOCX block', { path: 'a.docx', objectType: 'docx', locator: { kind: 'docx-block', objectId: 'docx-block-6' } }, { locator: 'docx-block-6', locatorToken: 'contract-token' })
expectQuery('ODS cell', { path: 'a.ods', objectType: 'ods', locator: { kind: 'ods-cell', objectId: 'ods-sheet-1:A1' } }, { locator: 'ods-sheet-1:A1', locatorToken: 'contract-token' })
expectQuery('ODP slide', { path: 'a.odp', objectType: 'odp', locator: { kind: 'odp-slide', objectId: 'odp-slide-1' } }, { locator: 'odp-slide-1', locatorToken: 'contract-token' })
expectQuery('PPTX object', { path: 'a.pptx', objectType: 'pptx', locator: { kind: 'pptx-slide', objectId: '256', page: 2 }, locationLabel: '第 2 张', matchKind: 'object' }, { slide: '2', locatorKind: 'pptx-slide', locator: '256', locationLabel: '第 2 张', matchKind: 'object', locatorToken: 'contract-token' })
expectQuery('Table row', { path: 'a.table.json', objectType: 'table', locator: { kind: 'table-row', objectId: 'row-7' } }, { row: 'row-7', locatorToken: 'contract-token' })
expectQuery('Table view', { path: 'a.table.json', objectType: 'table_view', locator: { kind: 'table_view', objectId: 'board' } }, { view: 'board', locatorToken: 'contract-token' })
expectQuery('OPML node', { path: 'a.opml', objectType: 'opml', locator: { kind: 'opml-node', objectId: 'topic-3' } }, { node: 'topic-3', locatorToken: 'contract-token' })
expectQuery('Canvas node', { path: 'a.canvas', objectType: 'canvas_node', locator: { kind: 'canvas_node', objectId: 'node-4' } }, { node: 'node-4', locatorToken: 'contract-token' })

const consumers = [
  'src/views/LibraryMode.vue',
  'src/components/GraphView.vue',
  'src/components/FileRelationContext.vue',
]
for (const file of consumers) {
  const source = read(file)
  if (!source.includes('openManagedObject')) failures.push(`${file}: unified object navigation consumer missing`)
}

const tableView = read('src/views/TableView.vue')
if (!tableView.includes('route.query.row') || !tableView.includes('data-row-id')) failures.push('Table row route consumption or visible locator marker missing')
const mindMapView = read('src/views/MindMapView.vue')
if (!mindMapView.includes('route.query.node') || !mindMapView.includes('data-node-id')) failures.push('OPML node route consumption or visible locator marker missing')
const indexService = read('src-tauri/src/services/knowledge_index.rs')
for (const contract of ['KNOWLEDGE_INDEX_SCHEMA_VERSION: u32 = 2', '"table-row"', '"table-view"', '"opml-node"']) {
  if (!indexService.includes(contract)) failures.push(`knowledge index contract missing: ${contract}`)
}

const policy = JSON.parse(read('shared/post-v115-m4a1-unified-object-navigation-policy.json'))
const evidence = JSON.parse(read('docs/evidence/post-v115-m4a1-unified-object-navigation/interaction-evidence.json'))
const manifest = JSON.parse(read('docs/evidence/post-v115-m4a1-unified-object-navigation/manifest.json'))
const actual = evidence.actual || {}
if (policy.stage !== 'M4A-1' || policy.actual?.routeMappingsUnderContract !== 11) failures.push('M4A-1 policy stage or route mapping count is invalid')
if (evidence.index?.state !== 'ready' || evidence.index?.schemaVersion !== 2) failures.push('real desktop evidence did not use a ready knowledge-index schema v2')
if (!actual.tableRowLocated || !actual.opmlNodeLocated || actual.existingOfficeLocatorRegressions !== 4) failures.push('real desktop precise locator coverage is incomplete')
if (actual.returnedSearchStateCount !== 6 || !actual.sourceFilesUnchanged || actual.runtimeErrorCount !== 0 || actual.blockingErrorSurfaceObserved) failures.push('real desktop return, source safety or runtime gate failed')
if (manifest.status !== 'accepted-after-visual-review' || manifest.screenshots?.length !== 3) failures.push('desktop screenshots have not completed visual review')

if (failures.length) {
  console.error(`M4A-1 unified object navigation check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('M4A-1 unified object navigation accepted: 11 route mappings, 3 shared consumers, Table row and OPML node locators, knowledge-index schema v2.')
