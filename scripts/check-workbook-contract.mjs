import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const matrix = JSON.parse(read('shared/xlsx-compatibility-matrix.json'))
const fixture = JSON.parse(read('src-tauri/tests/fixtures/workbook/compatibility-baseline.json'))
const model = read('src-tauri/src/formats/workbook.rs')
const engine = read('src-tauri/src/commands/workbook.rs')
const calculation = read('src-tauri/src/formats/workbook_calculation.rs')
const ooxml = read('src-tauri/src/formats/workbook_ooxml.rs')
const view = read('src/views/WorkbookView.vue')
const generator = read('src-tauri/examples/generate_workbook_fixture.rs')

const fail = message => { throw new Error(`Workbook contract: ${message}`) }
if (matrix.schemaVersion !== 1 || matrix.format !== 'xlsx') fail('invalid matrix header')
if (!engine.includes(`engine_id: "${matrix.engineId}"`)) fail('engine id drift')
const valid = new Set(Object.keys(matrix.statusDefinitions))
const ids = new Set()
for (const feature of matrix.features) {
  if (!feature.id || ids.has(feature.id)) fail(`duplicate or empty feature id ${feature.id}`)
  ids.add(feature.id)
  for (const dimension of ['read', 'view', 'edit', 'calculate', 'roundTrip']) {
    if (!valid.has(feature[dimension])) fail(`${feature.id}.${dimension} has invalid status`)
  }
  if (!feature.evidence) fail(`${feature.id} lacks evidence`)
}

for (const id of ['named_ranges', 'date_time_values', 'error_values']) {
  const feature = matrix.features.find(item => item.id === id)
  if (!feature || feature.read !== 'supported' || feature.view !== 'supported') fail(`${id} S6-10 status drift`)
  if (!model.includes(`pub ${id}: WorkbookCapabilityLevel`)) fail(`${id} missing from machine capabilities`)
}
if (matrix.features.find(item => item.id === 'named_ranges')?.edit !== 'planned') fail('named range editing must not be overstated')
if (!ooxml.includes('read_workbook_defined_names') || !view.includes('navigateDefinedName')) fail('named range read/navigation evidence missing')
if (!calculation.includes('recalculates_formula_using_named_range')) fail('named range calculation evidence missing')
if (!generator.includes('ExcelDateTime::from_ymd') || !generator.includes('#DIV/0!') || !generator.includes('define_name')) fail('S6-10 fixture evidence missing')
for (const capability of ['namedRanges', 'dateTimeValues', 'errorValues']) {
  if (fixture.currentEngineExpectations[capability] !== 'supported') fail(`${capability} fixture expectation drift`)
}
for (const id of ['freeze_panes', 'sort_filter_view', 'excel_tables', 'data_validation']) {
  const feature = matrix.features.find(item => item.id === id)
  if (!feature || feature.read !== 'supported' || feature.view !== 'supported') fail(`${id} S6-11 status drift`)
  if (!model.includes(`pub ${id}: WorkbookCapabilityLevel`)) fail(`${id} missing from machine capabilities`)
}
if (!ooxml.includes('patch_workbook_freeze_pane') || !engine.includes('update_workbook_freeze_pane') || !view.includes('setFreezePane')) fail('freeze pane read/write evidence missing')
if (!view.includes('prepareDataView') || !view.includes('MAX_DATA_VIEW_ROWS')) fail('session sort/filter evidence missing')
if (!ooxml.includes('read_sheet_tables') || !generator.includes('InventoryTable')) fail('Excel Table evidence missing')
if (!ooxml.includes('validate_edit_against_rules') || !generator.includes('allow_list_strings')) fail('data validation evidence missing')
for (const capability of ['freezePanes', 'sortFilterView', 'excelTables', 'dataValidation']) {
  if (fixture.currentEngineExpectations[capability] !== 'supported') fail(`${capability} fixture expectation drift`)
}
const drawings = matrix.features.find(item => item.id === 'charts_and_drawings')
if (!drawings || drawings.read !== 'supported' || drawings.view !== 'limited' || drawings.edit !== 'planned' || drawings.roundTrip !== 'preserved') fail('charts_and_drawings S6-12 status drift')
if (!model.includes('pub drawings: Vec<WorkbookDrawingObject>') || !model.includes('pub charts: WorkbookCapabilityLevel')) fail('drawing model/capability evidence missing')
if (!ooxml.includes('read_sheet_drawings') || !ooxml.includes('parse_chart_part')) fail('drawing relationship/chart parser evidence missing')
if (!generator.includes('Chart::new') || !generator.includes('Image::new')) fail('chart/image fixture evidence missing')
if (!view.includes('drawing-toolbar') || !view.includes('navigateDrawing')) fail('drawing structure view/navigation evidence missing')
if (fixture.documentFeatures.chart !== true || fixture.documentFeatures.image !== true || fixture.currentEngineExpectations.charts !== 'supported') fail('chart/image fixture expectation drift')
const linkedData = matrix.features.find(item => item.id === 'pivot_and_external_data')
if (!linkedData || linkedData.read !== 'supported' || linkedData.view !== 'limited' || linkedData.edit !== 'planned' || linkedData.calculate !== 'planned' || linkedData.roundTrip !== 'preserved') fail('pivot_and_external_data S6-13 status drift')
for (const field of ['pivot_tables', 'slicers', 'external_data']) {
  if (!model.includes(`pub ${field}: WorkbookCapabilityLevel`)) fail(`${field} machine capability missing`)
}
if (!model.includes('pub linked_data: WorkbookLinkedData') || !ooxml.includes('read_workbook_linked_data') || !ooxml.includes('external_relationship_summary')) fail('linked data inventory evidence missing')
if (!view.includes('linked-data-toolbar') || !view.includes('安全模式：已识别')) fail('linked data safety presentation missing')
for (const feature of ['pivotTable', 'slicer', 'externalLink', 'dataConnection']) {
  if (fixture.documentFeatures[feature] !== true) fail(`${feature} fixture evidence missing`)
}
for (const capability of ['pivotTables', 'slicers', 'externalData']) {
  if (fixture.currentEngineExpectations[capability] !== 'supported') fail(`${capability} fixture expectation drift`)
}
const printProtection = matrix.features.find(item => item.id === 'print_and_protection')
if (!printProtection || printProtection.read !== 'supported' || printProtection.view !== 'limited' || printProtection.edit !== 'planned' || printProtection.roundTrip !== 'preserved') fail('print_and_protection S6-14 status drift')
if (!model.includes('pub page_layout: WorkbookPageLayout') || !model.includes('pub protection: WorkbookProtection') || !model.includes('pub sheet_protection: WorkbookCapabilityLevel')) fail('page/protection model evidence missing')
if (!ooxml.includes('parse_page_layout') || !ooxml.includes('read_workbook_protection') || !engine.includes('refuses_to_edit_or_reconfigure_protected_sheet')) fail('page/protection backend evidence missing')
if (!view.includes('page-layout-toolbar') || !view.includes('sheetProtected')) fail('page/protection frontend evidence missing')
for (const feature of ['printArea', 'pageLayout', 'headerFooter', 'sheetProtection', 'workbookProtection']) {
  if (fixture.documentFeatures[feature] !== true) fail(`${feature} fixture evidence missing`)
}
for (const capability of ['printLayout', 'sheetProtection']) {
  if (fixture.currentEngineExpectations[capability] !== 'supported') fail(`${capability} fixture expectation drift`)
}

if (!view.includes('applyRowStructureAction') || !view.includes('整行插入与删除')) fail('whole-row structure toolbar entry missing')
if (!view.includes("invoke<WorkbookDocument>('update_workbook_structure'") || !view.includes('expectedSignature: workbook.value.signature')) fail('signature-protected row structure transaction missing')
if (!view.includes("if (dirtyCount.value) return void message.error") || !view.includes("title: `删除 ${count.toLocaleString()} 行？`")) fail('row structure draft guard or delete confirmation missing')
if (!view.includes('restoreRowSelection') || !view.includes('recalculateLoadedFormulas(false)') || !/undoStack\.value = \[\]\s+redoStack\.value = \[\]\s+await restoreRowSelection/.test(view)) fail('row structure history reset/reload/recalculation workflow missing')

console.log(`Workbook contract OK: ${matrix.features.length} public capability rows`)
