import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const evidenceRoot = path.resolve('docs/evidence/c5b-pptx-shape-output-reopen')
const artifactRoot = path.resolve('fixtures/pptx/output-reopen')
const desktopManifest = JSON.parse(await fs.readFile(
  path.resolve('docs/evidence/c5b-pptx-shape-lifecycle/audit-manifest.json'),
  'utf8',
))
const matrix = JSON.parse(await fs.readFile(path.join(evidenceRoot, 'matrix.json'), 'utf8')
  .catch(error => { throw new Error(`C5B producer evidence is missing: ${error.message}`) }))
const failures = []

if (matrix.schemaVersion !== 1 || matrix.stage !== 'C5B') failures.push('C5B matrix schema/stage is invalid')
const requiredIds = ['microsoft-powerpoint', 'wps-presentation', 'libreoffice-impress']
const operations = ['rectangle', 'ellipse', 'line', 'delete']
if ((matrix.requiredProducerIds || []).join(',') !== requiredIds.join(',')) failures.push('C5B must retain the required 3-producer order')
if ((matrix.operations || []).join(',') !== operations.join(',')) failures.push('C5B operation order is invalid')
if (matrix.requiredCount !== 3 || matrix.verifiedCount !== 3 || matrix.complete !== true || matrix.status !== 'verified') failures.push('C5B must retain a complete 3/3 producer matrix')

const desktopByOperation = new Map((desktopManifest.outputs || []).map(item => [item.operation, item]))
const matrixByOperation = new Map((matrix.outputs || []).map(item => [item.operation, item]))
for (const operation of operations) {
  const desktop = desktopByOperation.get(operation)
  const output = matrixByOperation.get(operation)
  const artifact = desktop ? await fs.readFile(path.join(artifactRoot, desktop.file)).catch(() => null) : null
  const sha256 = artifact ? createHash('sha256').update(artifact).digest('hex') : null
  if (!desktop || !output || output.file !== desktop.file) failures.push(`C5B output identity is invalid: ${operation}`)
  if (!artifact || output?.bytes !== artifact.length || output?.sha256Before !== sha256 || output?.sha256After !== sha256 || desktop?.sha256 !== sha256) {
    failures.push(`C5B output hash/size evidence is invalid: ${operation}`)
  }
  if (output?.sourceUnchanged !== true) failures.push(`C5B output was not proven read-only: ${operation}`)
}

const producerById = new Map((matrix.producers || []).map(item => [item.id, item]))
for (const id of requiredIds) {
  const producer = producerById.get(id)
  if (!producer || producer.status !== 'verified') failures.push(`C5B producer is not verified: ${id}`)
  if (!producer?.version || !producer?.method || producer.evidenceDependency !== null) failures.push(`C5B producer evidence is incomplete: ${id}`)
  const outputByOperation = new Map((producer?.outputs || []).map(item => [item.operation, item]))
  for (const operation of operations) {
    const output = outputByOperation.get(operation)
    if (!output || output.slideCount !== 3) failures.push(`C5B producer lost slide structure: ${id}/${operation}`)
    if (id === 'libreoffice-impress') {
      if (!(output?.renderedPdfBytes > 1_000)) failures.push(`C5B LibreOffice render is empty: ${operation}`)
      continue
    }
    const shapes = output?.longEditShapes || []
    if (operation === 'delete') {
      if (shapes.length !== 0) failures.push(`C5B delete output retained a shape: ${id}`)
      continue
    }
    const expectedName = `LongEdit ${operation[0].toUpperCase()}${operation.slice(1)}`
    if (shapes.length !== 1 || !shapes[0].name?.startsWith(expectedName) || shapes[0].slideNumber !== 1) {
      failures.push(`C5B producer did not recover the target shape: ${id}/${operation}`)
    }
    if (!(shapes[0]?.width > 0 && shapes[0]?.height > 0)) failures.push(`C5B producer recovered invalid geometry: ${id}/${operation}`)
    const expectedType = operation === 'line' ? 9 : 1
    if (shapes[0]?.type !== expectedType) failures.push(`C5B producer recovered an unexpected shape type: ${id}/${operation}`)
  }
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5B PPTX shape-output evidence passed: 3/3 producers, 4 operations, artifact hashes unchanged.')
