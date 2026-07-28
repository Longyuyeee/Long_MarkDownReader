import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const evidenceRoot = path.resolve('docs/evidence/c5c-pptx-slide-output-reopen')
const artifactRoot = path.resolve('fixtures/pptx/output-reopen')
const desktop = JSON.parse(await fs.readFile('docs/evidence/c5c-pptx-slide-lifecycle/audit-manifest.json', 'utf8'))
const matrix = JSON.parse(await fs.readFile(path.join(evidenceRoot, 'matrix.json'), 'utf8')
  .catch(error => { throw new Error(`C5C producer evidence is missing: ${error.message}`) }))
const failures = []
const requiredIds = ['microsoft-powerpoint', 'wps-presentation', 'libreoffice-impress']
const operations = ['add', 'copy', 'delete', 'reorder']
const expectedCounts = { add: 4, copy: 4, delete: 2, reorder: 3 }

if (matrix.schemaVersion !== 1 || matrix.stage !== 'C5C') failures.push('C5C matrix schema/stage is invalid')
if ((matrix.requiredProducerIds || []).join(',') !== requiredIds.join(',')) failures.push('C5C producer order is invalid')
if ((matrix.operations || []).join(',') !== operations.join(',')) failures.push('C5C operation order is invalid')
if (matrix.requiredCount !== 3 || matrix.verifiedCount !== 3 || matrix.complete !== true || matrix.status !== 'verified') failures.push('C5C must retain a complete 3/3 producer matrix')

for (const operation of operations) {
  const desktopOutput = desktop.outputs.find(item => item.operation === operation)
  const output = matrix.outputs.find(item => item.operation === operation)
  const artifact = await fs.readFile(path.join(artifactRoot, desktopOutput?.file || '')).catch(() => null)
  const digest = artifact && createHash('sha256').update(artifact).digest('hex')
  if (!desktopOutput || !output || output.file !== desktopOutput.file || !artifact
    || output.bytes !== artifact.length || output.sha256Before !== digest || output.sha256After !== digest
    || output.sourceUnchanged !== true) {
    failures.push(`C5C output identity/hash is invalid: ${operation}`)
  }
}
for (const id of requiredIds) {
  const producer = matrix.producers.find(item => item.id === id)
  if (!producer || producer.status !== 'verified' || !producer.version || !producer.method || producer.evidenceDependency !== null) {
    failures.push(`C5C producer is incomplete: ${id}`)
    continue
  }
  for (const operation of operations) {
    const output = producer.outputs.find(item => item.operation === operation)
    if (!output || output.slideCount !== expectedCounts[operation]) failures.push(`C5C slide count is invalid: ${id}/${operation}`)
    if (id === 'libreoffice-impress' && !(output?.renderedPdfBytes > 1000)) failures.push(`C5C LibreOffice render is empty: ${operation}`)
  }
  if (id !== 'libreoffice-impress') {
    const copy = producer.outputs.find(item => item.operation === 'copy')
    const reorder = producer.outputs.find(item => item.operation === 'reorder')
    if (copy?.copiedNotesPreserved !== true) failures.push(`C5C copied notes were not preserved: ${id}`)
    if (!reorder?.firstSlideText?.includes('WPS images and relationships')) failures.push(`C5C reorder identity is invalid: ${id}`)
  }
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5C PPTX slide-output evidence passed: 3/3 producers, 4 operations, artifact hashes unchanged.')
