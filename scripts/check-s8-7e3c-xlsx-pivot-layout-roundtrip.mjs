import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const matrixPath = path.join(root, 'docs/evidence/s8-7e3c-xlsx-pivot-layout-roundtrip/matrix.json')
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'))
const failures = []
const producerIds = ['microsoft-excel', 'wps-spreadsheets', 'libreoffice-calc']
const specs = new Map([
  ['row_only', { outputRange: 'A3:B6', keyCell: 'B6', keyValue: 4 }],
  ['column_only', { outputRange: 'A3:D5', keyCell: 'D5', keyValue: 4 }],
  ['multi_measure', { outputRange: 'A3:J8', keyCell: 'J8', keyValue: 2 }],
])

if (matrix.schemaVersion !== 1 || matrix.stage !== 'S8-7E3C') failures.push('matrix identity is invalid')
if (matrix.status !== 'verified' || matrix.complete !== true || matrix.verifiedCount !== 9 || matrix.requiredCount !== 9) {
  failures.push('matrix must remain complete at 9/9 verified')
}
if (matrix.sourceOverwriteAllowed !== false) failures.push('source overwrite must remain blocked')
if (JSON.stringify(matrix.requiredLayoutIds) !== JSON.stringify([...specs.keys()])) failures.push('required layout order drifted')
if (JSON.stringify(matrix.requiredProducerIds) !== JSON.stringify(producerIds)) failures.push('required producer order drifted')

const layouts = new Map((matrix.layouts || []).map(layout => [layout.id, layout]))
for (const [layoutId, spec] of specs) {
  const layout = layouts.get(layoutId)
  if (!layout || layout.status !== 'verified') {
    failures.push(`missing verified layout: ${layoutId}`)
    continue
  }
  if (layout.outputRange !== spec.outputRange || layout.keyCell !== spec.keyCell || layout.keyValue !== spec.keyValue) {
    failures.push(`${layoutId} semantic contract drifted`)
  }
  if (layout.source?.sourceOverwriteAllowed !== false) failures.push(`${layoutId} source overwrite boundary drifted`)
  const baselinePath = path.join(root, 'fixtures/xlsx/output-reopen', layout.source?.file || '')
  const baseline = await fs.readFile(baselinePath).catch(() => null)
  if (!baseline || baseline.length !== layout.source?.bytes || baseline.length < 10_000) {
    failures.push(`${layoutId} LongEdit baseline is missing or truncated`)
  } else if (crypto.createHash('sha256').update(baseline).digest('hex') !== layout.source.sha256) {
    failures.push(`${layoutId} LongEdit baseline digest drifted`)
  }
  const producers = new Map((layout.producers || []).map(producer => [producer.id, producer]))
  for (const producerId of producerIds) {
    const producer = producers.get(producerId)
    if (!producer) {
      failures.push(`${layoutId} missing producer: ${producerId}`)
      continue
    }
    if (producer.status !== 'verified' || !producer.version) failures.push(`${layoutId}/${producerId} is not versioned and verified`)
    for (const gate of ['refreshSucceeded', 'saveSucceeded', 'processRestarted', 'reopenVerified']) {
      if (producer[gate] !== true) failures.push(`${layoutId}/${producerId} did not pass ${gate}`)
    }
    if (producer.repairPromptObserved !== false) failures.push(`${layoutId}/${producerId} reported a repair prompt`)
    for (const snapshotName of ['before', 'afterSave', 'afterReopen']) {
      const snapshot = producer[snapshotName]
      const identityValid = producerId === 'libreoffice-calc'
        ? typeof snapshot?.pivotName === 'string' && snapshot.pivotName.length > 0
        : snapshot?.pivotName === 'PivotTable1'
      if (snapshot?.pivotCount !== 1 || !identityValid
        || Math.abs(Number(snapshot?.keyValue) - spec.keyValue) > 1e-9) {
        failures.push(`${layoutId}/${producerId} ${snapshotName} semantics are invalid`)
      }
    }
    if (producerId !== 'libreoffice-calc'
      && (producer.before?.outputRange !== spec.outputRange || producer.before?.keyCell !== spec.keyCell)) {
      failures.push(`${layoutId}/${producerId} baseline range is invalid`)
    }
    if (producer.afterSave?.outputRange !== producer.afterReopen?.outputRange
      || producer.afterSave?.keyCell !== producer.afterReopen?.keyCell
      || Math.abs(Number(producer.afterSave?.keyValue) - Number(producer.afterReopen?.keyValue)) > 1e-9) {
      failures.push(`${layoutId}/${producerId} normalized state changed after reopen`)
    }
    const outputPath = path.join(root, 'fixtures/xlsx/output-reopen', producer.outputFile || '')
    const bytes = await fs.readFile(outputPath).catch(() => null)
    if (!bytes || bytes.length !== producer.outputBytes || bytes.length < 10_000) {
      failures.push(`${layoutId}/${producerId} output is missing or truncated`)
    } else if (crypto.createHash('sha256').update(bytes).digest('hex') !== producer.outputSha256) {
      failures.push(`${layoutId}/${producerId} output digest drifted`)
    }
  }
}

if (failures.length) throw new Error(`S8-7E3C Pivot layout round-trip gate failed:\n- ${failures.join('\n- ')}`)
console.log('S8-7E3C XLSX Pivot layout producer round-trip OK: 3 layouts x 3 producers = 9/9 verified')
