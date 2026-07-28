import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const evidenceRoot = path.resolve('docs/evidence/c5a2-pptx-image-output-reopen')
const artifactPath = path.resolve('fixtures/pptx/output-reopen/c5a-image-copy.pptx')
const c5aManifestPath = path.resolve('docs/evidence/c5a-pptx-image-replacement/audit-manifest.json')
const matrix = JSON.parse(await fs.readFile(path.join(evidenceRoot, 'matrix.json'), 'utf8')
  .catch(error => { throw new Error(`C5A2 evidence is missing: ${error.message}`) }))
const c5aManifest = JSON.parse(await fs.readFile(c5aManifestPath, 'utf8'))
const artifact = await fs.readFile(artifactPath)
const artifactSha256 = createHash('sha256').update(artifact).digest('hex')
const failures = []

if (matrix.schemaVersion !== 1 || matrix.stage !== 'C5A2') failures.push('C5A2 matrix schema/stage is invalid')
const requiredIds = ['microsoft-powerpoint', 'wps-presentation', 'libreoffice-impress']
if ((matrix.requiredProducerIds || []).join(',') !== requiredIds.join(',')) failures.push('C5A2 must retain the required 3-producer order')
if (matrix.requiredCount !== 3 || matrix.verifiedCount !== 3 || matrix.complete !== true || matrix.status !== 'verified') failures.push('C5A2 must retain a complete 3/3 producer matrix')
if (matrix.output?.file !== 'c5a-image-copy.pptx') failures.push('C5A2 output filename is invalid')
if (matrix.output?.bytes !== artifact.length || matrix.output?.bytes !== c5aManifest.outputBytes) failures.push('C5A2 output byte count disagrees with the locked artifact')
if (matrix.output?.sha256Before !== artifactSha256 || matrix.output?.sha256After !== artifactSha256 || artifactSha256 !== c5aManifest.outputSha256) failures.push('C5A2 output SHA-256 disagrees with C5A1 or changed during reopen')
if (matrix.output?.sourceUnchanged !== true) failures.push('C5A2 must prove read-only reopen left the artifact unchanged')
if (matrix.output?.changedPackagePart !== 'ppt/media/image1.png' || matrix.output?.targetSlideNumber !== 2 || matrix.output?.targetShapeName !== 'WPS producer image') failures.push('C5A2 target identity is invalid')

const producerById = new Map((matrix.producers || []).map(item => [item.id, item]))
for (const id of requiredIds) {
  const producer = producerById.get(id)
  if (!producer || producer.status !== 'verified') failures.push(`C5A2 producer is not verified: ${id}`)
  if (!producer?.version || !producer?.method || producer.evidenceDependency !== null) failures.push(`C5A2 producer evidence is incomplete: ${id}`)
  if (producer?.slideCount !== 3 || producer?.targetShapeName !== 'WPS producer image') failures.push(`C5A2 producer did not retain the target structure: ${id}`)
  if (!(producer?.exportedImageBytes > 100)) failures.push(`C5A2 producer did not emit non-empty image/render evidence: ${id}`)
}
for (const id of ['microsoft-powerpoint', 'wps-presentation']) {
  if (producerById.get(id)?.targetShapeType !== 13) failures.push(`C5A2 COM producer did not expose an embedded picture: ${id}`)
}
if (producerById.get('libreoffice-impress')?.targetShapeType !== 'rendered-picture') failures.push('C5A2 LibreOffice render evidence is invalid')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('C5A2 PPTX image-output reopen evidence passed: 3/3 producers, target picture decoded, artifact unchanged.')
