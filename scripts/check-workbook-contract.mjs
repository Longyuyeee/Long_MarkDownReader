import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const matrix = JSON.parse(read('shared/xlsx-compatibility-matrix.json'))
const formulaCapabilities = JSON.parse(read('shared/xlsx-formula-capabilities.json'))
const linkedDataCapabilities = JSON.parse(read('shared/xlsx-linked-data-capabilities.json'))
const pivotProducerFixture = JSON.parse(read('src-tauri/tests/fixtures/workbook/pivot-producer-apache-poi.json'))
const fixture = JSON.parse(read('src-tauri/tests/fixtures/workbook/compatibility-baseline.json'))
const formulaFixture = JSON.parse(read('src-tauri/tests/fixtures/workbook/formula-function-matrix.json'))
const model = read('src-tauri/src/formats/workbook.rs')
const engine = read('src-tauri/src/commands/workbook.rs')
const calculation = read('src-tauri/src/formats/workbook_calculation.rs')
const linkedDataEngine = read('src-tauri/src/formats/workbook_linked_data.rs')
const pivotPreviewEngine = read('src-tauri/src/formats/workbook_pivot.rs')
const ooxml = read('src-tauri/src/formats/workbook_ooxml.rs')
const tauriLib = read('src-tauri/src/lib.rs')
const pivotAuditCli = read('src-tauri/src/bin/xlsx-pivot-audit-copy.rs')
const pivotProducerAudit = read('scripts/verify-s8-7e3b-xlsx-pivot-roundtrip.ps1')
const pivotLibreOfficeAudit = read('scripts/verify-s8-7e3b-libreoffice-pivot.py')
const view = read('src/views/WorkbookView.vue')
const conditionalExpression = read('src/utils/conditionalExpression.ts')
const generator = read('src-tauri/examples/generate_workbook_fixture.rs')
const formulaGenerator = read('src-tauri/examples/generate_formula_function_fixture.rs')
const chartGenerator = read('src-tauri/examples/generate_chart_visual_fixture.rs')
const chartFixture = JSON.parse(read('src-tauri/tests/fixtures/workbook/chart-visual-matrix.json'))
const chartFixturePath = path.join(root, 'src-tauri/tests/fixtures/workbook', chartFixture.fixture)
const formulaFixturePath = path.join(root, 'src-tauri/tests/fixtures/workbook', formulaFixture.fixture)
const configCommand = read('src-tauri/src/commands/config.rs')
const chartVisualEvidence = [
  'professional-light-column.jpg',
  'professional-light-line.jpg',
  'professional-light-pie.jpg',
  'professional-light-scatter.jpg',
  'professional-dark-column.jpg',
  'high-contrast-column.jpg',
  'desktop-edit-saved.jpg',
  'desktop-reopen-verified.jpg',
]

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
if (formulaCapabilities.schemaVersion !== 1 || formulaCapabilities.engine.id !== 'ironcalc' || formulaCapabilities.engine.version !== '0.7.1') fail('S8-6A formula capability header drift')
const verifiedFormulaFunctions = new Set(formulaCapabilities.families.flatMap(family => {
  if (family.status !== 'verified' || !family.id || !family.functions.length) fail('S8-6 formula family is incomplete')
  return family.functions
}))
for (const [familyId, functions] of Object.entries({
  conditional_aggregate: ['SUMIF', 'COUNTIF', 'AVERAGEIF'],
  lookup_reference: ['VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH'],
  multi_criteria_aggregate: ['SUMIFS', 'COUNTIFS', 'AVERAGEIFS'],
  date: ['DATE', 'YEAR', 'MONTH', 'DAY'],
  modern_lookup: ['XLOOKUP'],
  volatile: ['OFFSET', 'INDIRECT', 'RAND', 'RANDBETWEEN', 'TODAY', 'NOW'],
})) {
  const family = formulaCapabilities.families.find(item => item.id === familyId)
  if (!family || family.status !== 'verified' || family.functions.join(',') !== functions.join(',')) fail(`S8-6 ${familyId} capability drift`)
}
if (!fs.existsSync(formulaFixturePath) || fs.statSync(formulaFixturePath).size < 5_000) fail('S8-6 formula fixture is missing or incomplete')
for (const item of formulaFixture.cases) {
  if (!item.id || !item.cell || !item.expectedValue || !item.expectedKind) fail('S8-6 formula fixture case is incomplete')
  for (const fn of (item.function ?? '').split(',').filter(Boolean)) {
    if (!verifiedFormulaFunctions.has(fn)) fail(`S8-6 ${fn} fixture function is not in the verified inventory`)
    if (!formulaGenerator.includes(`${fn}(`)) fail(`S8-6 ${fn} generator evidence missing`)
  }
}
for (const scenario of ['division-by-zero', 'dependent-error-propagation', 'IFERROR-recovery', 'unknown-function']) {
  if (!formulaCapabilities.errorContract.verifiedScenarios.includes(scenario)) fail(`S8-6A ${scenario} error contract missing`)
}
if (!calculation.includes('recalculates_verified_function_families_from_real_xlsx_fixture') || !calculation.includes('classifies_formula_errors_and_preserves_dependency_propagation') || !calculation.includes('fn error_category')) fail('S8-6A calculation regression evidence missing')
if (!engine.includes('formula_function_matrix_recalculates_through_command_boundary')) fail('S8-6A command-boundary evidence missing')
for (const scenario of ['exact-match', 'ascending-approximate-match', 'cross-sheet-range', 'text-result-type-preservation', 'not-found-error', 'IFERROR-recovery']) {
  if (!formulaCapabilities.lookupContract.verifiedScenarios.includes(scenario)) fail(`S8-6B ${scenario} lookup contract missing`)
}
for (const scenario of ['numeric-comparison', 'single-character-wildcard']) {
  if (!formulaCapabilities.lookupContract.criteriaScenarios.includes(scenario)) fail(`S8-6B ${scenario} criteria contract missing`)
}
if (!calculation.includes('recalculates_verified_conditional_and_lookup_families') || !calculation.includes('classifies_lookup_not_found_as_not_available')) fail('S8-6B calculation regression evidence missing')
for (const scenario of ['multiple-criteria', 'cross-column-criteria', 'no-match-zero']) {
  if (!formulaCapabilities.multiCriteriaContract.verifiedScenarios.includes(scenario)) fail(`S8-6C ${scenario} multi-criteria contract missing`)
}
for (const scenario of ['date-serial', 'year-month-day-extraction', 'leap-year', 'invalid-input-error']) {
  if (!formulaCapabilities.dateContract.verifiedScenarios.includes(scenario)) fail(`S8-6C ${scenario} date contract missing`)
}
if (!formulaCapabilities.excludedFromContract.includes('multi-criteria-range-mismatch-semantics')) fail('S8-6C range mismatch exclusion missing')
if (!calculation.includes('recalculates_verified_multi_criteria_and_date_families') || !calculation.includes('classifies_invalid_date_input_as_value')) fail('S8-6C calculation regression evidence missing')
for (const scenario of ['exact-match', 'cross-sheet-range', 'text-result-type-preservation', 'not-found-fallback', 'not-found-error', 'IFERROR-recovery', 'reverse-search', 'wildcard-match', 'next-smaller-match', 'row-vector']) {
  if (!formulaCapabilities.lookupContract.modernScenarios.includes(scenario)) fail(`S8-6D ${scenario} modern lookup contract missing`)
}
for (const exclusion of ['XMATCH-and-other-modern-lookup-functions', 'XLOOKUP-array-return-and-spill-results']) {
  if (!formulaCapabilities.excludedFromContract.includes(exclusion)) fail(`S8-6D ${exclusion} exclusion missing`)
}
if (!calculation.includes('recalculates_verified_xlookup_scenarios') || !calculation.includes('classifies_xlookup_not_found_as_not_available') || !calculation.includes('recalculates_xlookup_with_unsaved_dependency_edit')) fail('S8-6D calculation regression evidence missing')
for (const scenario of ['offset-range-reference', 'indirect-same-sheet-reference', 'indirect-cross-sheet-reference', 'unsaved-edit-dependency', 'random-unit-interval', 'random-inclusive-fixed-bound', 'UTC-clock-day-relation']) {
  if (!formulaCapabilities.volatileContract.verifiedScenarios.includes(scenario)) fail(`S8-6E ${scenario} volatile contract missing`)
}
if (formulaCapabilities.volatileContract.recalculationMode !== 'explicit-request-only' || formulaCapabilities.volatileContract.resultPersistence !== 'in-memory-only' || !formulaCapabilities.volatileContract.notEquivalentToExcelAutomaticRecalculation) fail('S8-6E volatile execution boundary drift')
if (formulaCapabilities.unsupportedCalculationBoundary.arrayAndDynamicArrayPolicy !== 'reject-before-engine-import' || formulaCapabilities.unsupportedCalculationBoundary.externalWorkbookPolicy !== 'offline-reject-before-engine-import' || !formulaCapabilities.unsupportedCalculationBoundary.preserveSourcePackage) fail('S8-6E unsupported calculation boundary drift')
if (!calculation.includes('recalculates_verified_volatile_scenarios') || !calculation.includes('recalculates_volatile_references_with_unsaved_dependency_edits') || !calculation.includes('rejects_array_and_dynamic_array_calculation') || !calculation.includes('rejects_external_workbook_calculation_offline') || !engine.includes('formula_calculation_command_rejects_external_workbook_offline')) fail('S8-6E calculation regression evidence missing')
const volatileFeature = matrix.features.find(item => item.id === 'volatile_functions')
const dynamicArrayFeature = matrix.features.find(item => item.id === 'dynamic_arrays')
if (!volatileFeature || volatileFeature.calculate !== 'limited') fail('S8-6E volatile capability status drift')
if (!dynamicArrayFeature || dynamicArrayFeature.calculate !== 'planned' || !ooxml.includes('validate_workbook_calculation_boundary')) fail('S8-6E array boundary status drift')
if (linkedDataCapabilities.schemaVersion !== 1 || linkedDataCapabilities.mode !== 'offline_read_only') fail('S8-7A linked data capability header drift')
for (const [key, expected] of Object.entries({ metadataVisible: true, refreshAllowed: false, objectEditingAllowed: false, externalTargetsFollowed: false, sensitiveFieldsExposed: false })) {
  if (linkedDataCapabilities.policy[key] !== expected) fail(`S8-7A linked data policy ${key} drift`)
}
for (const id of ['pivot_table', 'slicer', 'external_workbook_link', 'data_connection']) {
  const object = linkedDataCapabilities.objectTypes.find(item => item.id === id)
  if (!object || object.refresh !== 'blocked' || object.preservation !== 'byte_verified') fail(`S8-7A ${id} object contract drift`)
}
const pivotAudit = linkedDataCapabilities.pivotAudit
if (!pivotAudit || pivotAudit.sourceScope !== 'local_worksheet_only' || pivotAudit.refreshExecution !== 'blocked' || pivotAudit.candidateStatus !== 'candidate_for_rebuild') fail('S8-7B pivot audit policy drift')
for (const structure of ['source_range', 'output_location', 'cache_fields', 'cache_records', 'row_fields', 'column_fields', 'page_fields', 'data_fields']) {
  if (!pivotAudit.inspectedStructures?.includes(structure)) fail(`S8-7B pivot audit structure ${structure} missing`)
}
for (const aggregate of ['sum', 'count', 'average', 'max', 'min', 'product', 'countNums']) {
  if (!pivotAudit.verifiedAggregations?.includes(aggregate)) fail(`S8-7B pivot aggregation ${aggregate} missing`)
}
for (const gate of ['source_semantics', 'aggregation_semantics', 'cache_rebuild', 'package_round_trip']) {
  if (!pivotAudit.requiredGates?.includes(gate)) fail(`S8-7B pivot gate ${gate} missing`)
}
const pivotPreview = pivotAudit.preview
if (!pivotPreview || pivotPreview.execution !== 'in_memory_only' || pivotPreview.sourceOfTruth !== 'current_worksheet_values' || pivotPreview.unsavedDrafts !== 'supported_non_formula') fail('S8-7C pivot preview execution contract drift')
for (const key of ['writesWorkbook', 'writesPivotCache', 'writesPivotDefinition']) {
  if (pivotPreview[key] !== false) fail(`S8-7C pivot preview ${key} boundary drift`)
}
for (const [key, expected] of Object.entries({ maxSourceRows: 50000, maxSourceColumns: 256, maxGroups: 10000, maxDraftEdits: 10000 })) {
  if (pivotPreview[key] !== expected) fail(`S8-7C pivot preview ${key} limit drift`)
}
if (pivotPreview.pageFields !== 'blocked') fail('S8-7C pivot preview page field boundary drift')
const pivotWritebackAudit = pivotAudit.writebackAudit
if (!pivotWritebackAudit || pivotWritebackAudit.execution !== 'blocked' || pivotWritebackAudit.structureCandidateEnablesWrite !== false || pivotWritebackAudit.fixtureExpectedStatus !== 'blocked') fail('S8-7D pivot writeback policy drift')
for (const status of ['blocked', 'structure_candidate']) {
  if (!pivotWritebackAudit.statusValues?.includes(status)) fail(`S8-7D pivot writeback status ${status} missing`)
}
for (const structure of ['pivot_field_items', 'row_items', 'column_items', 'output_cells', 'page_fields']) {
  if (!pivotWritebackAudit.inspectedStructures?.includes(structure)) fail(`S8-7D pivot writeback structure ${structure} missing`)
}
for (const gate of ['signature_check', 'impact_preview', 'atomic_replace', 'rollback', 'untouched_part_preservation', 'excel_or_libreoffice_round_trip']) {
  if (!pivotWritebackAudit.requiredReleaseGates?.includes(gate)) fail(`S8-7D pivot release gate ${gate} missing`)
}
const producerFixture = pivotWritebackAudit.producerFixture
if (!producerFixture || producerFixture.stage !== 'S8-7E1' || producerFixture.status !== 'structural_baseline_verified' || producerFixture.desktopRefreshSaveRoundTrip !== 'pending' || producerFixture.writesEnabled !== false) fail('S8-7E1 producer fixture policy drift')
if (producerFixture.pivotTables !== 2 || producerFixture.structureCandidates !== 1 || producerFixture.blockedPivots !== 1 || producerFixture.ordinaryCellPatchPreservesPivotParts !== true) fail('S8-7E1 producer fixture expectations drift')
if (producerFixture.manifest !== 'src-tauri/tests/fixtures/workbook/pivot-producer-apache-poi.json' || producerFixture.path !== 'src-tauri/tests/fixtures/workbook/pivot-producer-apache-poi.xlsx') fail('S8-7E1 producer fixture path drift')
const producerFixturePath = path.join(root, producerFixture.path)
if (!fs.existsSync(producerFixturePath) || fs.statSync(producerFixturePath).size !== pivotProducerFixture.size) fail('S8-7E1 producer fixture missing or size drift')
const producerFixtureSha256 = createHash('sha256').update(fs.readFileSync(producerFixturePath)).digest('hex').toUpperCase()
if (producerFixtureSha256 !== pivotProducerFixture.sha256 || producerFixtureSha256 !== producerFixture.sha256) fail('S8-7E1 producer fixture hash drift')
if (pivotProducerFixture.upstreamCommit !== '3184a18b40caad5b63630a4379de34d50268f3c5' || pivotProducerFixture.license !== 'Apache-2.0') fail('S8-7E1 producer fixture provenance drift')
const isolatedRebuildPlan = pivotWritebackAudit.isolatedRebuildPlan
if (!isolatedRebuildPlan || isolatedRebuildPlan.stage !== 'S8-7E2A' || isolatedRebuildPlan.execution !== 'temporary_copy_only' || isolatedRebuildPlan.signatureCheck !== 'required' || isolatedRebuildPlan.temporaryCopyDigest !== 'must_match_source') fail('S8-7E2A isolated rebuild plan policy drift')
if (isolatedRebuildPlan.writesUserFile !== false || isolatedRebuildPlan.actualRebuild !== 'pending' || isolatedRebuildPlan.atomicReplace !== 'blocked' || isolatedRebuildPlan.desktopRefreshSaveRoundTrip !== 'pending') fail('S8-7E2A write boundary drift')
for (const status of ['blocked', 'isolated_dry_run_ready']) {
  if (!isolatedRebuildPlan.statusValues?.includes(status)) fail(`S8-7E2A rebuild plan status ${status} missing`)
}
for (const role of ['cache_definition', 'cache_records', 'pivot_table', 'output_worksheet']) {
  if (!isolatedRebuildPlan.affectedRoles?.includes(role)) fail(`S8-7E2A affected role ${role} missing`)
}
const isolatedCacheRebuild = pivotWritebackAudit.isolatedCacheRebuild
if (!isolatedCacheRebuild || isolatedCacheRebuild.stage !== 'S8-7E2B' || isolatedCacheRebuild.execution !== 'temporary_copy_only' || isolatedCacheRebuild.status !== 'isolated_cache_rebuilt') fail('S8-7E2B isolated cache rebuild policy drift')
if (isolatedCacheRebuild.rebuiltRoles?.join(',') !== 'cache_definition,cache_records' || isolatedCacheRebuild.formulaSources !== 'blocked' || isolatedCacheRebuild.mixedTypeFields !== 'blocked' || isolatedCacheRebuild.newSharedItems !== 'blocked_until_pivot_items_rebuild') fail('S8-7E2B cache rebuild boundary drift')
for (const valueType of ['string', 'number', 'date']) {
  if (!isolatedCacheRebuild.verifiedValueTypes?.includes(valueType)) fail(`S8-7E2B verified value type ${valueType} missing`)
}
for (const valueType of ['boolean', 'error', 'blank']) {
  if (!isolatedCacheRebuild.implementedButUnverifiedValueTypes?.includes(valueType)) fail(`S8-7E2B unverified value type ${valueType} boundary missing`)
}
for (const key of ['packageValidation', 'semanticReparse', 'untouchedPartPreservation']) {
  if (isolatedCacheRebuild[key] !== 'required') fail(`S8-7E2B ${key} gate drift`)
}
if (isolatedCacheRebuild.writesUserFile !== false || isolatedCacheRebuild.pivotItemsRebuild !== 'completed_in_S8-7E2C' || isolatedCacheRebuild.outputCellsRebuild !== 'completed_in_S8-7E2C' || isolatedCacheRebuild.atomicReplace !== 'blocked' || isolatedCacheRebuild.desktopRefreshSaveRoundTrip !== 'pending') fail('S8-7E2B release boundary drift')
const synchronizedRebuild = pivotWritebackAudit.isolatedSynchronizedRebuild
if (!synchronizedRebuild || synchronizedRebuild.stage !== 'S8-7E2C' || synchronizedRebuild.execution !== 'temporary_copy_only' || synchronizedRebuild.status !== 'isolated_pivot_rebuilt') fail('S8-7E2C synchronized rebuild policy drift')
if (synchronizedRebuild.rebuiltRoles?.join(',') !== 'cache_definition,cache_records,pivot_table,output_worksheet' || synchronizedRebuild.failureBehavior !== 'discard_temporary_copy' || synchronizedRebuild.writesUserFile !== false) fail('S8-7E2C synchronized rebuild transaction boundary drift')
const verifiedLayout = synchronizedRebuild.verifiedLayout
if (!verifiedLayout || verifiedLayout.rowFields !== 1 || verifiedLayout.columnFields !== 1 || verifiedLayout.dataFields !== 1 || verifiedLayout.pageFields !== 0 || verifiedLayout.aggregation !== 'sum' || verifiedLayout.preservesHiddenItems !== true || verifiedLayout.requiresExistingSharedItems !== true) fail('S8-7E2C verified layout boundary drift')
for (const structure of ['pivot_field_items', 'row_items', 'column_items', 'output_cells', 'row_totals', 'column_totals', 'grand_total']) {
  if (!synchronizedRebuild.synchronizedStructures?.includes(structure)) fail(`S8-7E2C synchronized structure ${structure} missing`)
}
for (const key of ['outputValueReparse', 'packageValidation', 'semanticReparse', 'untouchedPartPreservation']) {
  if (synchronizedRebuild[key] !== 'required') fail(`S8-7E2C ${key} gate drift`)
}
if (synchronizedRebuild.multiAxisOrMultiMeasure !== 'blocked' || synchronizedRebuild.newSharedItems !== 'completed_in_S8-7E2D' || synchronizedRebuild.atomicReplace !== 'blocked' || synchronizedRebuild.desktopRefreshSaveRoundTrip !== 'pending') fail('S8-7E2C release boundary drift')
const layoutResize = pivotWritebackAudit.isolatedLayoutResize
if (!layoutResize || layoutResize.stage !== 'S8-7E2D' || layoutResize.execution !== 'temporary_copy_only' || layoutResize.status !== 'isolated_layout_resized') fail('S8-7E2D layout resize policy drift')
if (layoutResize.newSharedItems !== 'supported_for_verified_axes' || layoutResize.removedSharedItems !== 'supported_for_verified_axes' || layoutResize.outputRangeResize !== 'supported' || layoutResize.preservesExistingHiddenState !== true || layoutResize.newItemsDefaultVisible !== true) fail('S8-7E2D shared item or layout boundary drift')
for (const structure of ['cache_shared_items', 'cache_records', 'pivot_field_items', 'row_items', 'column_items', 'pivot_location', 'output_cells', 'stale_output_cleanup', 'style_extension']) {
  if (!layoutResize.synchronizedStructures?.includes(structure)) fail(`S8-7E2D synchronized structure ${structure} missing`)
}
for (const key of ['staleOutputCleanup', 'styleExtension', 'outputValueReparse', 'packageValidation', 'semanticReparse', 'untouchedPartPreservation']) {
  if (layoutResize[key] !== 'required') fail(`S8-7E2D ${key} gate drift`)
}
if (layoutResize.failureBehavior !== 'discard_temporary_copy' || layoutResize.writesUserFile !== false || layoutResize.multiAxisOrMultiMeasure !== 'semantic_validation_completed_in_S8-7E2E' || layoutResize.atomicReplace !== 'blocked' || layoutResize.desktopRefreshSaveRoundTrip !== 'pending') fail('S8-7E2D release boundary drift')
const aggregationAndLayoutVariants = pivotWritebackAudit.isolatedAggregationAndLayoutVariants
if (!aggregationAndLayoutVariants || aggregationAndLayoutVariants.stage !== 'S8-7E2E' || aggregationAndLayoutVariants.execution !== 'temporary_copy_and_memory_only' || aggregationAndLayoutVariants.status !== 'isolated_variants_verified') fail('S8-7E2E aggregation and layout variant policy drift')
if (aggregationAndLayoutVariants.verifiedAggregations?.join(',') !== 'sum,count,average,max,min,product,countNums' || aggregationAndLayoutVariants.aggregationPackageRebuild !== 'verified_for_all_seven') fail('S8-7E2E aggregation package matrix drift')
const semanticLayouts = aggregationAndLayoutVariants.semanticLayouts
if (!semanticLayouts || semanticLayouts.rowOnly?.rowFields !== 1 || semanticLayouts.rowOnly?.columnFields !== 0 || semanticLayouts.rowOnly?.dataFields !== 1 || semanticLayouts.rowOnly?.status !== 'semantic_verified') fail('S8-7E2E row-only semantic layout drift')
if (semanticLayouts.columnOnly?.rowFields !== 0 || semanticLayouts.columnOnly?.columnFields !== 1 || semanticLayouts.columnOnly?.dataFields !== 1 || semanticLayouts.columnOnly?.status !== 'semantic_verified') fail('S8-7E2E column-only semantic layout drift')
if (semanticLayouts.multiMeasure?.rowFields !== 1 || semanticLayouts.multiMeasure?.columnFields !== 1 || semanticLayouts.multiMeasure?.dataFields !== 3 || semanticLayouts.multiMeasure?.aggregations?.join(',') !== 'sum,count,average' || semanticLayouts.multiMeasure?.status !== 'semantic_verified') fail('S8-7E2E multi-measure semantic layout drift')
for (const gate of ['aggregation_variant_packages', 'non_sum_output_reparse', 'single_axis_semantics', 'multi_measure_semantics', 'package_validation', 'semantic_reparse', 'output_value_reparse', 'untouched_part_preservation', 'source_package_unchanged']) {
  if (!aggregationAndLayoutVariants.requiredGates?.includes(gate)) fail(`S8-7E2E required gate ${gate} missing`)
}
if (aggregationAndLayoutVariants.singleAxisPackageRewrite !== 'completed_in_S8-7E2F' || aggregationAndLayoutVariants.multiMeasurePackageRewrite !== 'completed_in_S8-7E2F' || aggregationAndLayoutVariants.failureBehavior !== 'discard_temporary_copy' || aggregationAndLayoutVariants.writesUserFile !== false || aggregationAndLayoutVariants.multiLevelAxis !== 'blocked' || aggregationAndLayoutVariants.pageFields !== 'blocked' || aggregationAndLayoutVariants.atomicReplace !== 'blocked' || aggregationAndLayoutVariants.desktopRefreshSaveRoundTrip !== 'pending') fail('S8-7E2E release boundary drift')
const layoutPackageVariants = pivotWritebackAudit.isolatedLayoutPackageVariants
if (!layoutPackageVariants || layoutPackageVariants.stage !== 'S8-7E2F' || layoutPackageVariants.execution !== 'temporary_copy_only' || layoutPackageVariants.status !== 'isolated_layout_packages_verified' || layoutPackageVariants.packageVariantCount !== 3) fail('S8-7E2F layout package policy drift')
const packageLayouts = layoutPackageVariants.layouts
if (!packageLayouts || packageLayouts.rowOnly?.rowFields !== 1 || packageLayouts.rowOnly?.columnFields !== 0 || packageLayouts.rowOnly?.dataFields !== 1 || packageLayouts.rowOnly?.outputRange !== 'A3:B7' || packageLayouts.rowOnly?.outputCellCount !== 10) fail('S8-7E2F row-only package drift')
if (packageLayouts.columnOnly?.rowFields !== 0 || packageLayouts.columnOnly?.columnFields !== 1 || packageLayouts.columnOnly?.dataFields !== 1 || packageLayouts.columnOnly?.outputRange !== 'A3:E4' || packageLayouts.columnOnly?.outputCellCount !== 10) fail('S8-7E2F column-only package drift')
if (packageLayouts.multiMeasure?.rowFields !== 1 || packageLayouts.multiMeasure?.columnFields !== 1 || packageLayouts.multiMeasure?.dataFields !== 3 || packageLayouts.multiMeasure?.aggregations?.join(',') !== 'sum,count,average' || packageLayouts.multiMeasure?.outputRange !== 'A3:M7' || packageLayouts.multiMeasure?.outputCellCount !== 65 || packageLayouts.multiMeasure?.dataAxisField !== -2) fail('S8-7E2F multi-measure package drift')
for (const structure of ['pivot_fields', 'row_fields', 'column_fields', 'data_fields', 'row_items', 'column_items', 'pivot_location', 'output_cells', 'stale_output_cleanup', 'output_styles']) {
  if (!layoutPackageVariants.synchronizedStructures?.includes(structure)) fail(`S8-7E2F synchronized structure ${structure} missing`)
}
for (const gate of ['package_validation', 'semantic_reparse', 'output_value_reparse', 'output_style_reparse', 'untouched_part_preservation', 'source_package_unchanged']) {
  if (!layoutPackageVariants.requiredGates?.includes(gate)) fail(`S8-7E2F required gate ${gate} missing`)
}
if (layoutPackageVariants.failureBehavior !== 'discard_temporary_copy' || layoutPackageVariants.writesUserFile !== false || layoutPackageVariants.multiLevelAxis !== 'blocked' || layoutPackageVariants.pageFields !== 'blocked' || layoutPackageVariants.atomicReplace !== 'blocked' || layoutPackageVariants.desktopRefreshSaveRoundTrip !== 'pending') fail('S8-7E2F release boundary drift')
const pivotCopySave = pivotWritebackAudit.verifiedPivotCopySave
if (!pivotCopySave || pivotCopySave.stage !== 'S8-7E3A' || pivotCopySave.execution !== 'same_directory_new_copy_only' || pivotCopySave.status !== 'verified_new_copy_save') fail('S8-7E3A Pivot copy-save policy drift')
if (pivotCopySave.verifiedLayout?.rowFields !== 1 || pivotCopySave.verifiedLayout?.columnFields !== 1 || pivotCopySave.verifiedLayout?.dataFields !== 1 || pivotCopySave.verifiedLayout?.aggregation !== 'sum' || pivotCopySave.verifiedLayout?.pageFields !== 0) fail('S8-7E3A verified layout drift')
for (const gate of ['source_signature', 'isolated_output_digest', 'target_absent', 'atomic_new_file_create', 'target_byte_reparse', 'package_validation', 'semantic_reparse', 'output_value_reparse', 'untouched_part_preservation', 'source_package_unchanged', 'exact_failure_cleanup']) {
  if (!pivotCopySave.requiredGates?.includes(gate)) fail(`S8-7E3A required gate ${gate} missing`)
}
if (pivotCopySave.targetScope !== 'same_directory_xlsx' || pivotCopySave.opensSavedCopy !== true || pivotCopySave.sourceOverwrite !== 'blocked' || pivotCopySave.existingTargetOverwrite !== 'blocked' || pivotCopySave.unsavedDrafts !== 'blocked' || pivotCopySave.multiMeasureSave !== 'blocked' || pivotCopySave.multiLevelAxis !== 'blocked' || pivotCopySave.pageFields !== 'blocked' || pivotCopySave.externalData !== 'blocked' || pivotCopySave.desktopProducerRoundTrip !== 'verified_in_S8-7E3B') fail('S8-7E3A release boundary drift')
const pivotProducerRoundTrip = pivotWritebackAudit.desktopProducerRoundTrip
if (!pivotProducerRoundTrip || pivotProducerRoundTrip.stage !== 'S8-7E3B' || pivotProducerRoundTrip.status !== 'verified' || pivotProducerRoundTrip.verifiedProducerCount !== 3 || pivotProducerRoundTrip.requiredProducerCount !== 3) fail('S8-7E3B producer matrix policy drift')
if (pivotProducerRoundTrip.requiredProducerIds?.join(',') !== 'microsoft-excel,wps-spreadsheets,libreoffice-calc' || pivotProducerRoundTrip.repairPromptObserved !== false || pivotProducerRoundTrip.sourceOverwrite !== 'blocked' || pivotProducerRoundTrip.existingTargetOverwrite !== 'blocked' || pivotProducerRoundTrip.expandedSaveWhitelist !== false) fail('S8-7E3B release boundary drift')
if (pivotProducerRoundTrip.verifiedLayout?.rowFields !== 1 || pivotProducerRoundTrip.verifiedLayout?.columnFields !== 1 || pivotProducerRoundTrip.verifiedLayout?.dataFields !== 1 || pivotProducerRoundTrip.verifiedLayout?.aggregation !== 'sum' || pivotProducerRoundTrip.verifiedLayout?.pageFields !== 0 || pivotProducerRoundTrip.verifiedLayout?.outputRange !== 'A3:D7' || pivotProducerRoundTrip.verifiedLayout?.keyCell !== 'D7' || pivotProducerRoundTrip.verifiedLayout?.keyValue !== 4) fail('S8-7E3B verified layout drift')
for (const step of ['open_longedit_copy', 'refresh_standard_pivot', 'save_xlsx', 'quit_process', 'reopen_in_new_process', 'verify_pivot_identity', 'verify_output_range', 'verify_output_value', 'reparse_in_longedit']) {
  if (!pivotProducerRoundTrip.workflow?.includes(step)) fail(`S8-7E3B workflow step ${step} missing`)
}
if (!fs.existsSync(path.join(root, pivotProducerRoundTrip.matrix)) || !fs.existsSync(path.join(root, pivotProducerRoundTrip.baseline))) fail('S8-7E3B evidence or baseline missing')
if (!engine.includes('pub fn generate_workbook_pivot_audit_copy') || !engine.includes('pivot_producer_round_trip_outputs_reopen_with_stable_semantics') || !tauriLib.includes('pub use commands::workbook::generate_workbook_pivot_audit_copy')) fail('S8-7E3B LongEdit audit-copy or reverse-reopen evidence missing')
if (!pivotAuditCli.includes('generate_workbook_pivot_audit_copy') || !pivotProducerAudit.includes('Excel.Application') || !pivotProducerAudit.includes('KET.Application') || !pivotProducerAudit.includes('processRestarted = $true') || !pivotLibreOfficeAudit.includes('pivot.refresh()')) fail('S8-7E3B producer automation evidence missing')
if (!fs.existsSync(path.join(root, linkedDataCapabilities.fixture))) fail('S8-7A linked data fixture missing')
if (!fixture.documentFeatures.pivotCacheRecords || fixture.currentEngineExpectations.pivotAudit !== 'supported') fail('S8-7B fixture audit expectation missing')
if (!model.includes('pub summary: WorkbookLinkedDataSummary') || !model.includes('pub policy: WorkbookLinkedDataPolicy')) fail('S8-7A linked data model summary missing')
if (!ooxml.includes('build_workbook_linked_data')) fail('S8-7A linked data parser summary missing')
if (!engine.includes('offline_read_only') || !view.includes('高级数据对象审计') || !view.includes('安全策略已生效') || !view.includes('连接字符串、命令、凭据和完整路径不会发送到界面')) fail('S8-7A linked data audit UI or command evidence missing')
if (!model.includes('pub audit: WorkbookPivotAudit') || !linkedDataEngine.includes('inspect_pivot_cache') || !linkedDataEngine.includes('candidate_for_rebuild') || !linkedDataEngine.includes('record_widths_valid') || !linkedDataEngine.includes('声明数量与实际记录不一致')) fail('S8-7B pivot audit backend evidence missing')
if (!view.includes('结构满足受限重建候选条件') || !view.includes('本阶段仍不执行刷新或写回') || !view.includes('缓存记录')) fail('S8-7B pivot audit UI evidence missing')
if (!model.includes('pub struct WorkbookPivotPreviewResult') || !engine.includes('pub async fn preview_workbook_pivot') || !tauriLib.includes('preview_workbook_pivot,') || !pivotPreviewEngine.includes('MAX_PIVOT_SOURCE_ROWS: usize = 50_000') || !pivotPreviewEngine.includes('MAX_PIVOT_SOURCE_COLUMNS: usize = 256') || !pivotPreviewEngine.includes('MAX_PIVOT_PREVIEW_GROUPS: usize = 10_000') || !pivotPreviewEngine.includes('MAX_PIVOT_PREVIEW_EDITS: usize = 10_000')) fail('S8-7C pivot preview backend or registration evidence missing')
if (!pivotPreviewEngine.includes('verifies_all_preview_aggregations_and_non_numeric_semantics') || !engine.includes('pivot_preview_uses_unsaved_drafts_without_modifying_workbook')) fail('S8-7C pivot preview regression evidence missing')
if (!view.includes('内存聚合预览') || !view.includes('未覆盖工作表、Pivot Cache、透视定义或原文件')) fail('S8-7C pivot preview UI boundary evidence missing')
if (fixture.currentEngineExpectations.pivotWritebackAudit !== 'blocked_missing_items_and_output') fail('S8-7D fixture writeback audit expectation missing')
if (!model.includes('pub struct WorkbookPivotWritebackAudit') || !linkedDataEngine.includes('inspect_pivot_writeback') || !linkedDataEngine.includes('structure_candidate') || !linkedDataEngine.includes('透视字段缺少完整 items 索引') || !linkedDataEngine.includes('声明的透视输出区域没有可验证单元格')) fail('S8-7D pivot writeback audit backend evidence missing')
if (!linkedDataEngine.includes('recognizes_complete_writeback_structure_without_enabling_writes') || !engine.includes('pivot.audit.writeback.status, \"blocked\"')) fail('S8-7D pivot writeback audit regression evidence missing')
if (!engine.includes('apache_poi_producer_fixture_exposes_complete_and_blocked_pivot_shapes') || !engine.includes('"xl/pivotTables/pivotTable2.xml"') || !engine.includes('"xl/pivotCache/pivotCacheRecords2.xml"')) fail('S8-7E1 producer fixture regression evidence missing')
if (!model.includes('pub struct WorkbookPivotRebuildPlan') || !ooxml.includes('pub fn plan_workbook_pivot_rebuild') || !engine.includes('pub async fn preview_workbook_pivot_rebuild') || !tauriLib.includes('preview_workbook_pivot_rebuild,') || !engine.includes('pivot_rebuild_plan_isolatedly_maps_four_parts_and_rejects_unsafe_candidates')) fail('S8-7E2A isolated rebuild plan backend evidence missing')
if (!view.includes("invoke<WorkbookPivotRebuildPlan>('preview_workbook_pivot_rebuild'") || !view.includes('隔离重建影响清单') || !view.includes('用户文件写入：禁用')) fail('S8-7E2A isolated rebuild plan UI evidence missing')
if (!model.includes('pub struct WorkbookPivotCacheRebuildResult') || !pivotPreviewEngine.includes('pub(crate) fn read_pivot_source_snapshot') || !ooxml.includes('pub(crate) fn rebuild_workbook_pivot_cache_isolated') || !engine.includes('pub async fn rebuild_workbook_pivot_cache_isolated_copy') || !tauriLib.includes('rebuild_workbook_pivot_cache_isolated_copy,')) fail('S8-7E2B isolated cache rebuild backend evidence missing')
if (!engine.includes('maxDate=\\\"2022-01-03T00:00:00\\\"') || !engine.includes('未进入现有 sharedItems') || !engine.includes('来源区域公式') || !engine.includes('混合类型')) fail('S8-7E2B cache rebuild regression evidence missing')
if (!view.includes("invoke<WorkbookPivotCacheRebuildResult>('rebuild_workbook_pivot_cache_isolated_copy'") || !view.includes('隔离 Cache 重建已通过') || !view.includes('用户文件未修改')) fail('S8-7E2B isolated cache rebuild UI evidence missing')
if (!model.includes('pub struct WorkbookPivotSynchronizedRebuildResult') || !ooxml.includes('pub(crate) fn rebuild_workbook_pivot_isolated') || !engine.includes('pub async fn rebuild_workbook_pivot_isolated_copy') || !tauriLib.includes('rebuild_workbook_pivot_isolated_copy,')) fail('S8-7E2C synchronized rebuild backend evidence missing')
if (!engine.includes('visible_row_item_count, 2') || !engine.includes('output_cell_count, 13') || !engine.includes('Some(&Data::Float(13.0))') || !engine.includes('blocked_synchronized')) fail('S8-7E2C synchronized rebuild regression evidence missing')
if (!view.includes("invoke<WorkbookPivotSynchronizedRebuildResult>('rebuild_workbook_pivot_isolated_copy'") || !view.includes('隔离透视表同步重建已通过') || !view.includes('输出值复读')) fail('S8-7E2C synchronized rebuild UI evidence missing')
if (!model.includes('pub struct WorkbookPivotExpandedRebuildResult') || !ooxml.includes('pub(crate) fn rebuild_workbook_pivot_expanded_isolated') || !engine.includes('pub async fn rebuild_workbook_pivot_expanded_isolated_copy') || !tauriLib.includes('rebuild_workbook_pivot_expanded_isolated_copy,')) fail('S8-7E2D expanded rebuild backend evidence missing')
if (!engine.includes('added_shared_item_count, 2') || !engine.includes('new_output_range, \"A3:E8\"') || !engine.includes('new_output_range, \"A3:C6\"') || !engine.includes('cleared_stale_cell_count >= 7') || !engine.includes('extended_style_cell_count > 0')) fail('S8-7E2D layout resize regression evidence missing')
if (!view.includes("invoke<WorkbookPivotExpandedRebuildResult>('rebuild_workbook_pivot_expanded_isolated_copy'") || !view.includes('隔离布局扩缩容已通过') || !view.includes('清理旧单元格') || !view.includes('延伸样式')) fail('S8-7E2D expanded rebuild UI evidence missing')
if (!model.includes('pub struct WorkbookPivotVariantVerificationResult') || !ooxml.includes('pub(crate) fn verify_workbook_pivot_variants_isolated') || !engine.includes('pub async fn verify_workbook_pivot_variants_isolated_copy') || !tauriLib.includes('verify_workbook_pivot_variants_isolated_copy,')) fail('S8-7E2E variant verification backend evidence missing')
if (!engine.includes('variants.package_variant_count, 10') || !engine.includes('variants.layout_package_variant_count, 3') || !engine.includes('variants.semantic_variant_count, 3') || !engine.includes('(\"multi_measure\", 1, 1, 3)') || !ooxml.includes('rebuilds_all_pivot_aggregations_from_raw_records_before_totals')) fail('S8-7E2E variant verification regression evidence missing')
if (!model.includes('pub styled_output_cell_count: usize') || !ooxml.includes('build_pivot_layout_variant_package') || !ooxml.includes('single_axis_package_rewrite') || !ooxml.includes('multi_measure_package_rewrite') || !ooxml.includes('布局变体包输出样式复读失败') || !engine.includes('\"A3:B7\"') || !engine.includes('\"A3:E4\"') || !engine.includes('\"A3:M7\"')) fail('S8-7E2F layout package backend or regression evidence missing')
if (!view.includes("invoke<WorkbookPivotVariantVerificationResult>('verify_workbook_pivot_variants_isolated_copy'") || !view.includes('聚合与布局变体已通过') || !view.includes('单行轴') || !view.includes('多度量') || !view.includes('个布局包') || !view.includes('个样式复读')) fail('S8-7E2F layout package UI evidence missing')
if (!model.includes('pub struct WorkbookPivotSavedCopyResult') || !engine.includes('pub async fn save_workbook_pivot_copy') || !engine.includes('write_new_bytes(target_path, &output)') || !engine.includes('saved_copy.status, \"saved_verified\"') || !tauriLib.includes('save_workbook_pivot_copy,')) fail('S8-7E3A Pivot copy-save backend or regression evidence missing')
if (!view.includes("invoke<WorkbookPivotSavedCopyResult>('save_workbook_pivot_copy'") || !view.includes('另存 Pivot 新副本并打开') || !view.includes('源文件未修改') || !view.includes('请先保存或放弃未保存的工作簿更改')) fail('S8-7E3A Pivot copy-save UI evidence missing')
if (!view.includes('事务写回审计') || !view.includes('写回仍禁用') || !view.includes('Excel/LibreOffice 真实往返证据')) fail('S8-7D pivot writeback audit UI evidence missing')
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
if (!drawings || drawings.read !== 'supported' || drawings.view !== 'limited' || drawings.edit !== 'limited' || drawings.roundTrip !== 'supported') fail('charts_and_drawings S8-4D4 status drift')
if (!model.includes('pub drawings: Vec<WorkbookDrawingObject>') || !model.includes('pub drawing_part: String') || !model.includes('pub anchor_index: usize') || !model.includes('pub charts: WorkbookCapabilityLevel')) fail('drawing model/capability evidence missing')
if (!ooxml.includes('read_sheet_drawings') || !ooxml.includes('parse_chart_part') || !ooxml.includes('patch_workbook_drawing') || !ooxml.includes('patch_chart_presentation_xml') || !ooxml.includes('patch_chart_data_labels_xml') || !ooxml.includes('patch_chart_series_name_xml') || !ooxml.includes('patch_chart_series_color_xml') || !ooxml.includes('updates_two_cell_drawing_metadata_and_anchor_without_rebuilding_chart_parts') || !ooxml.includes('updates_chart_title_and_internal_series_references_with_semantic_verification') || !ooxml.includes('creates_changes_and_deletes_standard_chart_lifecycle') || !ooxml.includes('keeps_advanced_point_data_labels_read_only')) fail('drawing S8-4D3 parser/transaction evidence missing')
const expectedChartTypes = ['column', 'line', 'pie', 'scatter']
if (chartFixture.sheet !== 'Chart Matrix' || chartFixture.charts.map(chart => chart.type).join(',') !== expectedChartTypes.join(',')) fail('S8-4D4 chart visual matrix contract drift')
if (!fs.existsSync(chartFixturePath) || fs.statSync(chartFixturePath).size < 10_000) fail('S8-4D4 chart visual fixture is missing or incomplete')
for (const chart of chartFixture.charts) {
  if (!chart.title || !chart.legend || !Number.isInteger(chart.series) || chart.series < 1) fail(`S8-4D4 ${chart.type} fixture metadata is incomplete`)
  if (!chartGenerator.includes(`ChartType::${chart.type[0].toUpperCase()}${chart.type.slice(1)}`)) fail(`S8-4D4 ${chart.type} generator evidence missing`)
}
if (!engine.includes('chart_visual_matrix_round_trips_through_command_boundary')) fail('S8-4D4 command round-trip evidence missing')
if (!configCommand.includes('LONGEDIT_E2E_LIBRARY') || !configCommand.includes('#[cfg(debug_assertions)]')) fail('S8-4D4 isolated desktop harness evidence missing')
for (const evidence of chartVisualEvidence) {
  const evidencePath = path.join(root, 'docs/evidence/s8-4d4', evidence)
  if (!fs.existsSync(evidencePath) || fs.statSync(evidencePath).size < 20_000) fail(`S8-4D4 visual evidence ${evidence} is missing or incomplete`)
}
if (!generator.includes('Chart::new') || !generator.includes('Image::new')) fail('chart/image fixture evidence missing')
if (!view.includes('drawing-toolbar') || !view.includes('navigateDrawing') || !view.includes('editDrawingMetadata') || !view.includes('applyDrawingSelection') || !view.includes('editChartTitle') || !view.includes('editChartSeries') || !view.includes('editChartSeriesName') || !view.includes('applyChartSeriesColor') || !view.includes('chartThemePalette') || !view.includes('seriesColors') || !view.includes('categoryAxisTitle') || !view.includes('legendPosition') || !view.includes('createChartFromSelection') || !view.includes('changeSelectedChartType') || !view.includes('editChartAxes') || !view.includes('applyChartLegendPosition') || !view.includes('applyChartDataLabels') || !view.includes('deleteSelectedChart') || !view.includes('TableChartEditor') || !view.includes('loadChartPreview') || !view.includes("invoke<WorkbookDocument>('update_workbook_drawing'")) fail('drawing S8-4D3 selection/edit/preview evidence missing')
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
if (!printProtection || printProtection.read !== 'supported' || printProtection.view !== 'limited' || printProtection.edit !== 'limited' || printProtection.roundTrip !== 'supported') fail('print_and_protection S8-5C status drift')
if (!model.includes('pub page_layout: WorkbookPageLayout') || !model.includes('pub protection: WorkbookProtection') || !model.includes('pub sheet_protection: WorkbookCapabilityLevel') || !model.includes('WorkbookPageLayoutPayload') || !model.includes('WorkbookHeaderFooterPayload') || !model.includes('WorkbookPrintOptionsPayload')) fail('page/protection model evidence missing')
if (!ooxml.includes('parse_page_layout') || !ooxml.includes('read_workbook_protection') || !ooxml.includes('patch_workbook_page_layout') || !ooxml.includes('patch_workbook_header_footer') || !ooxml.includes('patch_workbook_print_options') || !engine.includes('page_layout_round_trips_through_command_boundary') || !engine.includes('header_footer_round_trips_through_command_boundary') || !engine.includes('print_options_round_trip_through_command_boundary') || !engine.includes('refuses_to_edit_or_reconfigure_protected_sheet')) fail('page/protection S8-5C backend evidence missing')
if (!view.includes('page-layout-toolbar') || !view.includes('sheetProtected') || !view.includes('savePageLayout') || !view.includes('saveHeaderFooter') || !view.includes('savePrintOptions') || !view.includes("invoke<WorkbookDocument>('update_workbook_page_layout'") || !view.includes("invoke<WorkbookDocument>('update_workbook_header_footer'") || !view.includes("invoke<WorkbookDocument>('update_workbook_print_options'")) fail('page/protection S8-5C frontend evidence missing')
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
