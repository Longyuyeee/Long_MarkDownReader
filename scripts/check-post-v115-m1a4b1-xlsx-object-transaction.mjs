import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1a4b1-xlsx-object-transaction-policy.json', 'utf8'))
const formatSource = fs.readFileSync('src-tauri/src/formats/workbook.rs', 'utf8')
const commandSource = fs.readFileSync('src-tauri/src/commands/workbook.rs', 'utf8')
const libSource = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const failures = []

for (const marker of [
  'pub struct WorkbookDraftWritePayload',
  'conditional_format_changes: Vec<WorkbookConditionalFormatChange>',
  'table_changes: Vec<WorkbookTableChange>',
]) if (!formatSource.includes(marker)) failures.push(`Draft payload marker is missing: ${marker}`)

for (const marker of [
  'pub async fn write_workbook_draft',
  'output = patch_workbook_conditional_format(&output, change)?',
  'output = patch_workbook_table(&output, change)?',
  'validate_workbook_package(&output)?',
  'writes_cell_conditional_format_and_table_drafts_in_one_transaction',
]) if (!commandSource.includes(marker)) failures.push(`Draft transaction marker is missing: ${marker}`)

if (!libSource.includes('write_workbook_draft,')) failures.push('Tauri command registration is missing')
if (policy.beforeActual.combinedAtomicWrite !== false || policy.expected.singleReliableWrite !== true) failures.push('M1A4B1 expected/actual policy is incomplete')
if (policy.deferred.frontendObjectDraftsUndoExplicitSave !== 'M1A4B2') failures.push('M1A4B2 frontend deferral is not explicit')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M1A4B1 contract accepted: cell, conditional-format and Table drafts share one validated write boundary.')
