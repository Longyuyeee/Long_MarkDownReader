import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const matrixPath = path.join(root, 'docs/evidence/s8-7e3b-xlsx-pivot-roundtrip/matrix.json')
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'))
const failures = []
const requiredIds = ['microsoft-excel', 'wps-spreadsheets', 'libreoffice-calc']
if (matrix.schemaVersion !== 1 || matrix.stage !== 'S8-7E3B') failures.push('matrix identity is invalid')
if (matrix.status !== 'verified' || matrix.complete !== true || matrix.verifiedCount !== 3 || matrix.requiredCount !== 3) {
  failures.push('matrix must remain complete at 3/3 verified')
}
if (JSON.stringify(matrix.requiredProducerIds) !== JSON.stringify(requiredIds)) failures.push('required producer order drifted')
if (matrix.source?.sourceOverwriteAllowed !== false || matrix.source?.outputRange !== 'A3:D7' || matrix.source?.keyValue !== 4) {
  failures.push('LongEdit source contract is invalid')
}

const entries = new Map((matrix.producers || []).map(producer => [producer.id, producer]))
for (const id of requiredIds) {
  const producer = entries.get(id)
  if (!producer) {
    failures.push(`missing producer: ${id}`)
    continue
  }
  if (producer.status !== 'verified' || !producer.version) failures.push(`${id} is not versioned and verified`)
  for (const gate of ['refreshSucceeded', 'saveSucceeded', 'processRestarted', 'reopenVerified']) {
    if (producer[gate] !== true) failures.push(`${id} did not pass ${gate}`)
  }
  if (producer.repairPromptObserved !== false) failures.push(`${id} reported a repair prompt`)
  for (const snapshot of ['before', 'afterSave', 'afterReopen']) {
    const value = producer[snapshot]
    if (value?.pivotCount !== 1 || value?.pivotName !== 'PivotTable1' || value?.outputRange !== 'A3:D7' || value?.keyCell !== 'D7' || value?.keyValue !== 4) {
      failures.push(`${id} ${snapshot} Pivot semantics are invalid`)
    }
  }
  const outputPath = path.join(root, 'fixtures/xlsx/output-reopen', producer.outputFile || '')
  const bytes = await fs.readFile(outputPath).catch(() => null)
  if (!bytes || bytes.length !== producer.outputBytes || bytes.length < 10_000) {
    failures.push(`${id} output file is missing or truncated`)
  } else {
    const digest = crypto.createHash('sha256').update(bytes).digest('hex')
    if (digest !== producer.outputSha256) failures.push(`${id} output digest drifted`)
  }
}

const baselinePath = path.join(root, 'fixtures/xlsx/output-reopen', matrix.source?.file || '')
const baseline = await fs.readFile(baselinePath).catch(() => null)
if (!baseline || baseline.length !== matrix.source?.bytes) {
  failures.push('LongEdit baseline is missing or truncated')
} else if (crypto.createHash('sha256').update(baseline).digest('hex') !== matrix.source.sha256) {
  failures.push('LongEdit baseline digest drifted')
}
if (failures.length) throw new Error(`S8-7E3B Pivot round-trip gate failed:\n- ${failures.join('\n- ')}`)
console.log('S8-7E3B XLSX Pivot producer round-trip OK: 3/3 verified')
