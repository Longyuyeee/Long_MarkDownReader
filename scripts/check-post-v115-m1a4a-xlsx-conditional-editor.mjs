import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1a4a-xlsx-conditional-editor-policy.json', 'utf8'))
const source = fs.readFileSync('src/views/WorkbookView.vue', 'utf8')
const fixture = policy.fixture
const failures = []

for (const marker of [
  'class="conditional-format-modal"',
  'class="conditional-style-grid"',
  'class="conditional-preview"',
  'conditionalFormatDraftError',
  'saveConditionalFormatDraft',
  'openAdvancedConditionalFormatEditor',
  '应用并写入文件',
]) {
  if (!source.includes(marker)) failures.push(`Conditional-format editor marker is missing: ${marker}`)
}
if (!fs.existsSync(fixture) || fs.statSync(fixture).size < 1_000) failures.push(`Real XLSX fixture is missing or empty: ${fixture}`)
if (policy.beforeActual.singleVisibleForm !== false || policy.expected.visualStyleCount !== 5) failures.push('M1A4A expected/actual policy is incomplete')
if (policy.expected.narrowViewportScrollable !== true) failures.push('M1A4A narrow viewport reachability is not enforced')
if (policy.deferred.objectDraftUndoExplicitSave !== 'M1A4B') failures.push('M1A4B save-boundary deferral is not explicit')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`M1A4A contract accepted: ${policy.target.sheet}!${policy.target.cell}, ${policy.expected.visualStyleCount} visual presets, M1A4B boundary retained.`)
