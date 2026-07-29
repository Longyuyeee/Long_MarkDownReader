import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const matrixPath = path.join(root, 'docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json')
const baselinePath = path.join(root, 'fixtures/xlsx/output-reopen/s8-7e3g-longedit-multi-axis.xlsx')
const cliPath = path.join(root, 'src-tauri/src/bin/xlsx-pivot-audit-copy.rs')
const enginePath = path.join(root, 'src-tauri/src/commands/workbook.rs')
const libPath = path.join(root, 'src-tauri/src/lib.rs')

const failures = []
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'))
const baseline = await fs.readFile(baselinePath).catch(() => null)
const cli = await fs.readFile(cliPath, 'utf8')
const engine = await fs.readFile(enginePath, 'utf8')
const lib = await fs.readFile(libPath, 'utf8')

if (matrix.schemaVersion !== 1 || matrix.stage !== 'S8-7E3G') failures.push('matrix identity drifted')
if (matrix.status !== 'blocked_preflight' || matrix.complete !== false || matrix.verifiedCount !== 0 || matrix.requiredCount !== 3) {
  failures.push('S8-7E3G must remain blocked_preflight until the 3/3 producer matrix is real')
}
if (matrix.sourceOverwriteAllowed !== false || matrix.reliableSaveAllowed !== false) {
  failures.push('multi-axis reliable save and source overwrite must remain blocked')
}
const producerIds = ['microsoft-excel', 'wps-spreadsheets', 'libreoffice-calc']
if (JSON.stringify(matrix.requiredProducerIds) !== JSON.stringify(producerIds)) failures.push('required producer order drifted')

const baselineMeta = matrix.baseline
if (!baselineMeta || baselineMeta.status !== 'audit_copy_verified' || baselineMeta.stage !== 'S8-7E3G-A') {
  failures.push('LongEdit baseline audit-copy state is invalid')
} else {
  if (baselineMeta.outputRange !== 'A3:I12' || baselineMeta.outputCellCount !== 80 || baselineMeta.previewGroupCount !== 16 || baselineMeta.grandTotal !== 424) {
    failures.push('LongEdit baseline semantics drifted')
  }
  if (baselineMeta.rowFieldCount !== 2 || baselineMeta.columnFieldCount !== 2 || baselineMeta.dataFieldCount !== 1 || baselineMeta.pageFieldCount !== 0) {
    failures.push('LongEdit baseline multi-axis field shape drifted')
  }
  if (baselineMeta.sourceOverwriteAllowed !== false || baselineMeta.reliableSaveAllowed !== false || baselineMeta.saveMode !== 'producer_roundtrip_input_only') {
    failures.push('LongEdit baseline safety boundary drifted')
  }
}

if (!baseline || baseline.length !== baselineMeta?.bytes || baseline.length < 10_000) {
  failures.push('LongEdit multi-axis baseline is missing or truncated')
} else if (crypto.createHash('sha256').update(baseline).digest('hex') !== baselineMeta.sha256) {
  failures.push('LongEdit multi-axis baseline digest drifted')
}

const producers = new Map((matrix.producers || []).map(producer => [producer.id, producer]))
for (const producerId of producerIds) {
  const producer = producers.get(producerId)
  if (!producer) {
    failures.push(`missing producer placeholder: ${producerId}`)
    continue
  }
  if (!['pending_environment', 'pending_full_matrix'].includes(producer.status)) {
    failures.push(`${producerId} must stay pending until real round-trip evidence is committed`)
  }
  for (const gate of ['open_baseline', 'refresh', 'save', 'quit_process', 'reopen_in_new_process', 'verify_no_repair_prompt', 'reparse_longedit_semantics']) {
    if (!producer.requiredGates?.includes(gate)) failures.push(`${producerId} missing required gate ${gate}`)
  }
}

if (!matrix.blockedUntil?.includes('three_producer_roundtrip_verified')) failures.push('release blocker for 3/3 producer round-trip is missing')
if (!cli.includes('variant == "multi_axis"') || !cli.includes('generate_workbook_pivot_multi_axis_audit_copy')) {
  failures.push('multi_axis audit-copy CLI route is missing')
}
if (!engine.includes('pub fn generate_workbook_pivot_multi_axis_audit_copy') || !engine.includes('audit_copy_verified') || !engine.includes('producer_roundtrip_input_only')) {
  failures.push('multi-axis audit-copy backend evidence is missing')
}
if (!engine.includes('multi_axis_audit_copy_generates_producer_roundtrip_input_without_changing_source')) {
  failures.push('multi-axis audit-copy regression evidence is missing')
}
if (!lib.includes('generate_workbook_pivot_multi_axis_audit_copy')) failures.push('multi-axis audit-copy export is missing')

if (failures.length) throw new Error(`S8-7E3G multi-axis Pivot preflight gate failed:\n- ${failures.join('\n- ')}`)
console.log('S8-7E3G XLSX Pivot multi-axis producer preflight OK: LongEdit baseline fixed, 3/3 producer matrix still blocked')
