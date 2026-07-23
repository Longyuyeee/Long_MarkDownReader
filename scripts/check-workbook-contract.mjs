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
const conditionalExpression = read('src/utils/conditionalExpression.ts')
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
const namedRanges = matrix.features.find(item => item.id === 'named_ranges')
if (!namedRanges || namedRanges.edit !== 'limited' || namedRanges.roundTrip !== 'supported') fail('named range S8-3A status drift')
if (!ooxml.includes('read_workbook_defined_names') || !view.includes('navigateDefinedName')) fail('named range read/navigation evidence missing')
if (!ooxml.includes('patch_workbook_defined_name') || !engine.includes('update_workbook_defined_name') || !view.includes("invoke<WorkbookDocument>('update_workbook_defined_name'")) fail('named range S8-3A transaction evidence missing')
if (!ooxml.includes('refuses_to_rename_or_delete_referenced_defined_names') || !view.includes('createDefinedName') || !view.includes('updateDefinedNameRange')) fail('named range S8-3A safety/UI evidence missing')
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
if (matrix.features.find(item => item.id === 'excel_tables')?.edit !== 'limited') fail('Excel Table S8-2A edit status drift')
if (!ooxml.includes('patch_workbook_table') || !engine.includes('update_workbook_table') || !view.includes("invoke<WorkbookDocument>('update_workbook_table'")) fail('Excel Table create/resize transaction evidence missing')
if (!ooxml.includes('creates_and_resizes_excel_table_package_parts') || !view.includes('editSelectedTable')) fail('Excel Table S8-2A round-trip or UI evidence missing')
if (!ooxml.includes('validate_edit_against_rules') || !generator.includes('allow_list_strings')) fail('data validation evidence missing')
const dataValidation = matrix.features.find(item => item.id === 'data_validation')
if (!dataValidation || dataValidation.edit !== 'limited' || dataValidation.calculate !== 'limited' || dataValidation.roundTrip !== 'supported') fail('data validation S8-3B status drift')
if (!ooxml.includes('patch_workbook_data_validation') || !engine.includes('update_workbook_data_validation') || !view.includes("invoke<WorkbookDocument>('update_workbook_data_validation'")) fail('data validation S8-3B transaction evidence missing')
if (!ooxml.includes('creates_updates_and_deletes_formula_data_validation_rules') || !view.includes('editDataValidationRule')) fail('data validation S8-3B test/UI evidence missing')
const conditionalFormatting = matrix.features.find(item => item.id === 'conditional_formatting')
if (!conditionalFormatting || conditionalFormatting.read !== 'supported' || conditionalFormatting.view !== 'limited' || conditionalFormatting.edit !== 'limited' || conditionalFormatting.calculate !== 'limited' || conditionalFormatting.roundTrip !== 'supported') fail('conditional formatting S8-3C1 status drift')
if (!model.includes('pub conditional_formats: Vec<WorkbookConditionalFormatRule>') || !ooxml.includes('patch_workbook_conditional_format') || !engine.includes('update_workbook_conditional_format')) fail('conditional formatting S8-3C1 backend evidence missing')
if (!view.includes("invoke<WorkbookDocument>('update_workbook_conditional_format'") || !view.includes('conditionalRuleMatches') || !view.includes('editConditionalFormatRule')) fail('conditional formatting S8-3C1 execution/UI evidence missing')
if (!ooxml.includes('creates_updates_and_deletes_basic_conditional_format_rules') || !ooxml.includes('edits_safe_conditional_expressions_and_keeps_unsupported_formulas_read_only')) fail('conditional formatting S8-3C round-trip/safety evidence missing')
if (!ooxml.includes('safe_conditional_expression_supported') || !ooxml.includes('MAX_CONDITIONAL_EXPRESSION_REFERENCES: usize = 8') || !conditionalExpression.includes('parseConditionalExpression') || !conditionalExpression.includes('evaluateConditionalExpression') || !conditionalExpression.includes('MAX_CONDITIONAL_EXPRESSION_REFERENCES = 8') || !view.includes('conditionalDependencyPageOffsets') || !view.includes('loadConditionalDependencyPages')) fail('conditional formatting S8-3C3C2 expression evidence missing')
if (!model.includes('WorkbookConditionalColorScale') || !ooxml.includes('writes_fixed_numeric_color_scales_without_adding_dxf_styles') || !view.includes('colorScaleFill') || !view.includes('interpolateColor')) fail('conditional formatting S8-3C2B1 color-scale evidence missing')
if (!model.includes('resolved_value: Option<String>') || !ooxml.includes('resolve_dynamic_color_scales') || !ooxml.includes('percentile_value') || !view.includes('parseColorScaleThresholds')) fail('conditional formatting S8-3C2B2 dynamic-scale evidence missing')
if (!model.includes('WorkbookConditionalDataBar') || !model.includes('WorkbookConditionalThreshold') || !ooxml.includes('writes_dynamic_and_negative_data_bars_without_adding_dxf_styles') || !view.includes('dataBarStyle')) fail('conditional formatting S8-3C2C data-bar evidence missing')
if (!model.includes('WorkbookConditionalIconSet') || !model.includes('WorkbookConditionalIconThreshold') || !ooxml.includes('writes_standard_icon_sets_and_keeps_advanced_variants_read_only') || !view.includes('iconSetVisual') || !view.includes('parseIconThresholds')) fail('conditional formatting S8-3C2D icon-set evidence missing')
if (!model.includes('MoveUp') || !model.includes('MoveDown') || !ooxml.includes('reorders_overlapping_conditional_formats_without_rewriting_rule_content') || !ooxml.includes('patch_sheet_conditional_format_priorities') || !view.includes('cycleConditionalFormat') || !view.includes('conditionalFormatConflictHint')) fail('conditional formatting S8-3C3A priority-manager evidence missing')
if (!model.includes('rule_index: Option<usize>') || !ooxml.includes('patch_sheet_conditional_format_group_rule') || !ooxml.includes('updates_and_deletes_one_rule_inside_a_shared_range_group') || !view.includes('selectedConditionalGroupSize')) fail('conditional formatting S8-3C3B grouped-rule lifecycle evidence missing')
if (!model.includes('Split') || !model.includes('Merge') || !ooxml.includes('extract_conditional_format_rule_xml') || !ooxml.includes('splits_and_recombines_shared_range_rules_without_rebuilding_rule_xml') || !view.includes('splitConditionalFormatRule') || !view.includes('mergeConditionalFormatRule')) fail('conditional formatting S8-3C3C1 split-merge evidence missing')
for (const capability of ['freezePanes', 'sortFilterView', 'excelTables', 'dataValidation']) {
  if (fixture.currentEngineExpectations[capability] !== 'supported') fail(`${capability} fixture expectation drift`)
}
const drawings = matrix.features.find(item => item.id === 'charts_and_drawings')
if (!drawings || drawings.read !== 'supported' || drawings.view !== 'limited' || drawings.edit !== 'limited' || drawings.roundTrip !== 'supported') fail('charts_and_drawings S8-4B status drift')
if (!model.includes('pub drawings: Vec<WorkbookDrawingObject>') || !model.includes('pub drawing_part: String') || !model.includes('pub anchor_index: usize') || !model.includes('pub charts: WorkbookCapabilityLevel')) fail('drawing model/capability evidence missing')
if (!ooxml.includes('read_sheet_drawings') || !ooxml.includes('parse_chart_part') || !ooxml.includes('patch_workbook_drawing') || !ooxml.includes('updates_two_cell_drawing_metadata_and_anchor_without_rebuilding_chart_parts') || !ooxml.includes('updates_chart_title_and_internal_series_references_with_semantic_verification')) fail('drawing S8-4B parser/transaction evidence missing')
if (!generator.includes('Chart::new') || !generator.includes('Image::new')) fail('chart/image fixture evidence missing')
if (!view.includes('drawing-toolbar') || !view.includes('navigateDrawing') || !view.includes('editDrawingMetadata') || !view.includes('applyDrawingSelection') || !view.includes('editChartTitle') || !view.includes('editChartSeries') || !view.includes('TableChartEditor') || !view.includes('loadChartPreview') || !view.includes("invoke<WorkbookDocument>('update_workbook_drawing'")) fail('drawing S8-4B selection/edit/preview evidence missing')
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

if (!view.includes('applyStructureAction') || !view.includes('整行整列插入与删除')) fail('whole-row/column structure toolbar entry missing')
if (!view.includes("invoke<WorkbookDocument>('update_workbook_structure'") || !view.includes('expectedSignature: workbook.value.signature')) fail('signature-protected axis structure transaction missing')
if (!view.includes("if (dirtyCount.value) return void message.error") || !view.includes('不能安全迁移的复杂对象会拒绝事务')) fail('axis structure draft guard or delete confirmation missing')
if (!view.includes('restoreAxisSelection') || !view.includes('recalculateLoadedFormulas(false)') || !/undoStack\.value = \[\]\s+redoStack\.value = \[\]\s+await restoreAxisSelection/.test(view)) fail('axis structure history reset/reload/recalculation workflow missing')
if (!ooxml.includes('migrate_column_records') || !ooxml.includes('patch_drawing_anchors') || !ooxml.includes('Table 列结构')) fail('whole-column OOXML migration or explicit rejection evidence missing')
if (!engine.includes('writes_row_and_column_structure_with_signature_protection')) fail('whole-column command transaction evidence missing')

console.log(`Workbook contract OK: ${matrix.features.length} public capability rows`)
