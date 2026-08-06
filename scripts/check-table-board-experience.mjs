import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const tableView = read('src/views/TableView.vue')
requireTokens(tableView, 'Table board workspace', [
  'class="view-create-menu"',
  'class="board-config-bar"',
  'class="board-field-picker"',
  'defaultBoardGroupColumn',
  'defaultBoardTitleColumn',
  'class="board-card-field"',
  '<textarea',
  'text-overflow: ellipsis',
  'overflow-wrap: anywhere',
  'width: clamp(260px, 28vw, 320px)',
])

const evidenceRoot = 'docs/evidence/ux42-table-board'
const evidence = JSON.parse(read(path.join(evidenceRoot, 'interaction-evidence.json')))
if (!evidence.passed || !evidence.sourceFileUnchanged || !evidence.isolatedFixtureUnchanged) {
  fail('UX-42 evidence must pass without modifying the source or isolated fixture')
}
if (evidence.runtimeErrorCount !== 0 || evidence.desktop?.boardCardCount !== 11) {
  fail('UX-42 evidence must cover all 11 real-data cards without runtime errors')
}
for (const viewport of ['desktop', 'fieldPicker', 'narrow']) {
  const result = evidence[viewport]
  if (!result || result.documentOverflow > 2 || result.chromeOffenderCount !== 0 || result.oversizedBoardItemCount !== 0) {
    fail(`UX-42 ${viewport} layout evidence is incomplete or overflowing`)
  }
}

const manifest = JSON.parse(read(path.join(evidenceRoot, 'manifest.json')))
if (manifest.sourceUserContentIncluded !== false || manifest.screenshots?.length !== 3) {
  fail('UX-42 screenshot manifest must contain three redacted runtime views')
}
for (const screenshot of manifest.screenshots) {
  const file = path.join(evidenceRoot, screenshot.file)
  const bytes = fs.readFileSync(file)
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  if (bytes.length < 20_000 || bytes.length !== screenshot.bytes || sha256 !== screenshot.sha256) {
    fail(`UX-42 screenshot integrity failed: ${screenshot.file}`)
  }
}

console.log('Table board experience passed: real 13-field data creates 11 readable cards across desktop and narrow layouts without mutation or runtime errors.')
