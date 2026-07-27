import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const fixtureRoot = new URL('fixtures/pptx/producers/', root)
const matrix = JSON.parse(await readFile(new URL('matrix.json', fixtureRoot), 'utf8'))
const failures = []

if (matrix.schemaVersion !== 1 || matrix.stage !== 'C3A') failures.push('PPTX producer matrix schema/stage mismatch')
if (matrix.requiredCount !== 3 || matrix.verifiedCount !== 2 || matrix.complete !== false) failures.push('C3A matrix must honestly report 2/3 verified producers')
if (matrix.requiredProducerIds?.join(',') !== 'microsoft-powerpoint-16,wps-presentation,libreoffice-impress') failures.push('C3 producer set must remain PowerPoint/WPS/LibreOffice')

for (const producer of matrix.producers || []) {
  if (!matrix.requiredProducerIds.includes(producer.id)) failures.push(`unexpected PPTX producer ${producer.id}`)
  if (producer.status === 'pending') {
    if (producer.id !== 'wps-presentation' || producer.fixture || producer.manifest || !producer.evidenceDependency) failures.push('pending WPS evidence must remain explicit and must not claim fixture files')
    continue
  }
  if (producer.status !== 'verified' || !producer.fixture || !producer.manifest || producer.evidenceDependency) {
    failures.push(`invalid verified producer entry ${producer.id}`)
    continue
  }
  const manifest = JSON.parse(await readFile(new URL(producer.manifest, fixtureRoot), 'utf8'))
  const fixture = await readFile(new URL(producer.fixture, fixtureRoot))
  const digest = createHash('sha256').update(fixture).digest('hex')
  if (manifest.schemaVersion !== 1 || manifest.id !== producer.id || manifest.file !== producer.fixture) failures.push(`manifest identity mismatch for ${producer.id}`)
  if (manifest.sha256 !== digest) failures.push(`fixture SHA-256 mismatch for ${producer.id}`)
  if (manifest.redistributable !== true || manifest.verification?.producerReopen !== 'verified') failures.push(`producer reopen/redistribution evidence missing for ${producer.id}`)
  for (const capability of ['text', 'images', 'shapes', 'notes', 'themes']) {
    if (manifest.expected?.[capability] !== true) failures.push(`${producer.id} does not cover ${capability}`)
  }
  if (!Number.isInteger(manifest.expected?.slideCount) || manifest.expected.slideCount < 2) failures.push(`${producer.id} slide count evidence is incomplete`)
  if (!fixture.subarray(0, 2).equals(Buffer.from('PK'))) failures.push(`${producer.id} fixture is not an OOXML ZIP package`)
}

if (failures.length) {
  console.error(`PPTX producer matrix failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`)
  process.exit(1)
}
console.log('PPTX C3A producer matrix passed: 2/3 verified, WPS evidence explicitly pending')
