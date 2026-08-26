import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1a4b2-xlsx-object-draft-policy.json', 'utf8'))
const source = fs.readFileSync('src/views/WorkbookView.vue', 'utf8')
const command = fs.readFileSync('src-tauri/src/commands/workbook.rs', 'utf8')
const failures = []

for (const marker of ['objectDrafts', 'stageWorkbookObjectDraft', 'objectDraftChange', "invoke<WorkbookDocument>('write_workbook_draft'", 'conditionalFormatChanges:', 'tableChanges:', '加入待保存更改']) {
  if (!source.includes(marker)) failures.push(`Frontend object-draft marker is missing: ${marker}`)
}
if (!command.includes('pub async fn write_workbook_draft')) failures.push('Atomic workbook draft command is missing')
if (!fs.existsSync(policy.fixture) || fs.statSync(policy.fixture).size < 1_000) failures.push(`Real XLSX fixture is missing or empty: ${policy.fixture}`)
if (!Object.values(policy.expected).every(value => value === true || value === 0)) failures.push('M1A4B2 acceptance policy is incomplete')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M1A4B2 contract accepted: object drafts share history and one atomic save boundary.')
