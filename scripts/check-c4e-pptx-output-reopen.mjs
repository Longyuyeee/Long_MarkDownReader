import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('fixtures/pptx/output-reopen')
const evidenceRoot = path.resolve('docs/evidence/c4e-pptx-output-reopen')
const matrix = JSON.parse(await fs.readFile(path.join(evidenceRoot, 'matrix.json'), 'utf8'))
const generation = JSON.parse(await fs.readFile(path.join(evidenceRoot, 'generation.json'), 'utf8'))
const failures = []
if (matrix.schemaVersion !== 1 || matrix.stage !== 'C4E') failures.push('C4E matrix schema/stage is invalid')
if (generation.schemaVersion !== 1 || generation.sourceUnchanged !== true) failures.push('C4E generation must prove the source is unchanged')
const requiredIds = ['microsoft-powerpoint', 'wps-presentation', 'libreoffice-impress']
if ((matrix.requiredProducerIds || []).join(',') !== requiredIds.join(',')) failures.push('C4E must retain the required 3-producer order')
if (matrix.requiredCount !== 3 || matrix.verifiedCount !== (matrix.producers || []).filter(item => item.status === 'verified').length) failures.push('C4E verified counts are inconsistent')
if (matrix.complete !== (matrix.verifiedCount === 3)) failures.push('C4E complete flag is inconsistent')
if (matrix.status !== (matrix.complete ? 'verified' : 'partial')) failures.push('C4E status is inconsistent')
const producerById = new Map((matrix.producers || []).map(item => [item.id, item]))
for (const id of requiredIds) {
  const producer = producerById.get(id)
  if (!producer || !['verified', 'pending'].includes(producer.status)) failures.push(`C4E producer state is invalid: ${id}`)
  if (producer?.status === 'verified' && (!producer.version || !producer.method || producer.evidenceDependency !== null)) failures.push(`C4E verified evidence is incomplete: ${id}`)
  if (producer?.status === 'pending' && !producer.evidenceDependency) failures.push(`C4E pending dependency is missing: ${id}`)
}
if (producerById.get('wps-presentation')?.status !== 'verified') failures.push('C4E1 must preserve the real WPS Presentation reopen evidence')
if ((matrix.outputs || []).length !== 3 || (generation.outputs || []).length !== 3) failures.push('C4E must retain text, style, and alt-text output artifacts')
for (const output of matrix.outputs || []) {
  const bytes = await fs.readFile(path.join(root, output.file)).catch(() => null)
  if (!bytes || bytes.length !== output.bytes || output.sha256?.length !== 64) failures.push(`C4E output artifact is missing or inconsistent: ${output.file}`)
  const generated = (generation.outputs || []).find(item => item.file === output.file)
  if (!generated || generated.sha256 !== output.sha256 || generated.bytes !== output.bytes) failures.push(`C4E generation/reopen evidence disagrees: ${output.file}`)
}
if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log(`C4E PPTX output-reopen evidence passed: ${matrix.verifiedCount}/3 producers, 3 operations, source unchanged.`)
