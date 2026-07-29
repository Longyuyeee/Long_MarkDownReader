import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const matrixPath = path.join(root, 'docs/evidence/s8-7e3d-xlsx-pivot-aggregation-roundtrip/matrix.json')
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'))
const failures = []
const producerIds = ['microsoft-excel', 'wps-spreadsheets', 'libreoffice-calc']
const specs = new Map([
  ['count', { outputRange: 'A3:D6', keyCell: 'D6', keyValue: 2 }],
  ['average', { outputRange: 'A3:D6', keyCell: 'D6', keyValue: 2 }],
  ['max', { outputRange: 'A3:D6', keyCell: 'D6', keyValue: 3 }],
  ['min', { outputRange: 'A3:D6', keyCell: 'D6', keyValue: 1 }],
  ['product', { outputRange: 'A3:D6', keyCell: 'D6', keyValue: 3 }],
  ['countNums', { outputRange: 'A3:D6', keyCell: 'D6', keyValue: 2 }],
])

if (matrix.schemaVersion !== 1 || matrix.stage !== 'S8-7E3D') failures.push('matrix identity is invalid')
if (matrix.status !== 'verified' || matrix.complete !== true || matrix.verifiedCount !== 18 || matrix.requiredCount !== 18) {
  failures.push('matrix must remain complete at 18/18 verified')
}
if (matrix.sourceOverwriteAllowed !== false) failures.push('source overwrite must remain blocked')
if (JSON.stringify(matrix.requiredAggregationIds) !== JSON.stringify([...specs.keys()])) failures.push('required aggregation order drifted')
if (JSON.stringify(matrix.requiredProducerIds) !== JSON.stringify(producerIds)) failures.push('required producer order drifted')

const aggregations = new Map((matrix.aggregations || []).map(aggregation => [aggregation.id, aggregation]))
for (const [aggregationId, spec] of specs) {
  const aggregation = aggregations.get(aggregationId)
  if (!aggregation || aggregation.status !== 'verified') {
    failures.push(`missing verified aggregation: ${aggregationId}`)
    continue
  }
  if (aggregation.outputRange !== spec.outputRange || aggregation.keyCell !== spec.keyCell || aggregation.keyValue !== spec.keyValue) {
    failures.push(`${aggregationId} semantic contract drifted`)
  }
  if (aggregation.source?.sourceOverwriteAllowed !== false) failures.push(`${aggregationId} source overwrite boundary drifted`)
  const baselinePath = path.join(root, 'fixtures/xlsx/output-reopen', aggregation.source?.file || '')
  const baseline = await fs.readFile(baselinePath).catch(() => null)
  if (!baseline || baseline.length !== aggregation.source?.bytes || baseline.length < 10_000) {
    failures.push(`${aggregationId} LongEdit baseline is missing or truncated`)
  } else if (crypto.createHash('sha256').update(baseline).digest('hex') !== aggregation.source.sha256) {
    failures.push(`${aggregationId} LongEdit baseline digest drifted`)
  }
  const producers = new Map((aggregation.producers || []).map(producer => [producer.id, producer]))
  for (const producerId of producerIds) {
    const producer = producers.get(producerId)
    if (!producer) {
      failures.push(`${aggregationId} missing producer: ${producerId}`)
      continue
    }
    if (producer.status !== 'verified' || !producer.version) failures.push(`${aggregationId}/${producerId} is not versioned and verified`)
    for (const gate of ['refreshSucceeded', 'saveSucceeded', 'processRestarted', 'reopenVerified']) {
      if (producer[gate] !== true) failures.push(`${aggregationId}/${producerId} did not pass ${gate}`)
    }
    for (const token of ['aggregationBefore', 'aggregationAfterSave', 'aggregationAfterReopen']) {
      if (producer[token] !== aggregationId) failures.push(`${aggregationId}/${producerId} ${token} drifted to ${producer[token]}`)
    }
    if (producer.repairPromptObserved !== false) failures.push(`${aggregationId}/${producerId} reported a repair prompt`)
    for (const snapshotName of ['before', 'afterSave', 'afterReopen']) {
      const snapshot = producer[snapshotName]
      const identityValid = producerId === 'libreoffice-calc'
        ? typeof snapshot?.pivotName === 'string' && snapshot.pivotName.length > 0
        : snapshot?.pivotName === 'PivotTable1'
      if (snapshot?.pivotCount !== 1 || !identityValid
        || Math.abs(Number(snapshot?.keyValue) - spec.keyValue) > 1e-9) {
        failures.push(`${aggregationId}/${producerId} ${snapshotName} semantics are invalid`)
      }
    }
    if (producerId !== 'libreoffice-calc'
      && (producer.before?.outputRange !== spec.outputRange || producer.before?.keyCell !== spec.keyCell)) {
      failures.push(`${aggregationId}/${producerId} baseline range is invalid`)
    }
    if (producer.afterSave?.outputRange !== producer.afterReopen?.outputRange
      || producer.afterSave?.keyCell !== producer.afterReopen?.keyCell
      || Math.abs(Number(producer.afterSave?.keyValue) - Number(producer.afterReopen?.keyValue)) > 1e-9) {
      failures.push(`${aggregationId}/${producerId} normalized state changed after reopen`)
    }
    if (producer.afterReopen?.outputRange !== 'A3:D7' || producer.afterReopen?.keyCell !== 'D7') {
      failures.push(`${aggregationId}/${producerId} producer-normalized range drifted`)
    }
    const outputPath = path.join(root, 'fixtures/xlsx/output-reopen', producer.outputFile || '')
    const bytes = await fs.readFile(outputPath).catch(() => null)
    if (!bytes || bytes.length !== producer.outputBytes || bytes.length < 10_000) {
      failures.push(`${aggregationId}/${producerId} output is missing or truncated`)
    } else if (crypto.createHash('sha256').update(bytes).digest('hex') !== producer.outputSha256) {
      failures.push(`${aggregationId}/${producerId} output digest drifted`)
    }
  }
}

if (failures.length) throw new Error(`S8-7E3D Pivot aggregation round-trip gate failed:\n- ${failures.join('\n- ')}`)
console.log('S8-7E3D XLSX Pivot aggregation producer round-trip OK: 6 aggregations x 3 producers = 18/18 verified')
