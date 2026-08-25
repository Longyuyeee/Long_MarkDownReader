import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1a1-xlsx-validation-policy.json', 'utf8'))
const source = fs.readFileSync('src/views/WorkbookView.vue', 'utf8')
const fixture = policy.fixture
const failures = []

for (const marker of [
  'class="validation-picker"',
  'class="validation-menu"',
  'inlineValidationOptionsAt',
  'chooseValidationOption',
  'commitFormulaInput()',
  'role="listbox"',
  "window.addEventListener('pointerdown', handleWindowPointerDown)",
]) {
  if (!source.includes(marker)) failures.push(`Workbook validation picker marker is missing: ${marker}`)
}
if (!fs.existsSync(fixture) || fs.statSync(fixture).size < 1_000) failures.push(`Real XLSX fixture is missing or empty: ${fixture}`)
if (policy.beforeActual.inCellPicker !== false || policy.expected.sourceUnchangedBeforeSave !== true) failures.push('M1A1 expected/actual policy is incomplete')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`M1A1 contract accepted: ${policy.target.sheet}!${policy.target.cell}, ${policy.target.options.length} literal options, explicit-save boundary.`)
