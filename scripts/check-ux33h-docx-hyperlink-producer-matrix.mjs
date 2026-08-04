import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const fixtureRoot = new URL('fixtures/docx/hyperlinks/', root)
const matrix = JSON.parse(await readFile(new URL('matrix.json', fixtureRoot), 'utf8'))
const generator = await readFile(new URL('scripts/generate-ux33h-docx-hyperlink-fixtures.ps1', root), 'utf8')
const patchKernel = await readFile(new URL('src-tauri/src/formats/docx_patch.rs', root), 'utf8')
const failures = []
const expected = new Map([
  ['microsoft-word-16', { native: 4, fields: 0, editable: 2, readOnly: 2 }],
  ['wps-writer', { native: 0, fields: 4, editable: 0, readOnly: 4 }],
  ['libreoffice-writer', { native: 4, fields: 0, editable: 2, readOnly: 2 }],
])

if (matrix.schemaVersion !== 1 || matrix.stage !== 'UX-33H' || matrix.status !== 'verified') {
  failures.push('UX-33H matrix identity or status is invalid')
}
if (matrix.lifecycle !== 'producer-created-saved-exited-new-instance-reopened') {
  failures.push('UX-33H lifecycle evidence is incomplete')
}
if (!Array.isArray(matrix.producers) || matrix.producers.length !== expected.size) {
  failures.push('UX-33H matrix must contain exactly three producers')
}

for (const producer of matrix.producers || []) {
  const contract = expected.get(producer.id)
  if (!contract) {
    failures.push(`unexpected UX-33H producer: ${producer.id}`)
    continue
  }
  expected.delete(producer.id)
  if (producer.producerCreated !== true
    || producer.producerReopenVerified !== true
    || producer.nativeHyperlinkCount !== contract.native
    || producer.fieldHyperlinkCount !== contract.fields
    || producer.expectedEditableLabels !== contract.editable
    || producer.expectedReadOnlyLabels !== contract.readOnly
    || producer.externalTargetVerified !== true
    || producer.internalAnchorVerified !== true
    || typeof producer.file !== 'string'
    || producer.file.includes('/')
    || producer.file.includes('\\')) {
    failures.push(`UX-33H producer contract drifted: ${producer.id}`)
    continue
  }
  const bytes = await readFile(new URL(producer.file, fixtureRoot))
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== producer.bytes || digest !== producer.sha256 || bytes.length < 5_000) {
    failures.push(`UX-33H fixture bytes or digest drifted: ${producer.id}`)
  }
}
if (expected.size) failures.push(`missing UX-33H producers: ${[...expected.keys()].join(', ')}`)

for (const token of [
  'Word.Application',
  'KWPS.Application',
  'producer-created-saved-exited-new-instance-reopened',
  'producerReopenVerified = $true',
  'expectedEditableLabels = if ($Id -eq "wps-writer") { 0 } else { 2 }',
]) {
  if (!generator.includes(token)) failures.push(`UX-33H generator token missing: ${token}`)
}
if (!patchKernel.includes('ux33h_round_trips_native_word_and_libreoffice_labels_and_keeps_wps_fields_read_only')) {
  failures.push('UX-33H native producer Rust regression is missing')
}

if (failures.length) {
  console.error('UX-33H DOCX hyperlink producer matrix failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('UX-33H DOCX hyperlink producer matrix passed: Word/LibreOffice simple labels editable; WPS field links and all complex labels read-only.')
