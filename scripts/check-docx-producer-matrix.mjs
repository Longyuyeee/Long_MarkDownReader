import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const producerRoot = new URL('fixtures/docx/producers/', root)
const matrix = JSON.parse(await readFile(new URL('matrix.json', producerRoot), 'utf8'))
const failures = []
const allowedStatuses = new Set(['pending', 'verified'])
const requiredIds = ['microsoft-word-16', 'wps-writer', 'libreoffice-writer']
const entries = Array.isArray(matrix.producers) ? matrix.producers : []
const ids = new Set()

const readOptional = async url => {
  try {
    return await readFile(url)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const safeLeafName = value => typeof value === 'string'
  && value.length > 0
  && !value.includes('/')
  && !value.includes('\\')
  && value !== '.'
  && value !== '..'

if (matrix.schemaVersion !== 1) failures.push('matrix schemaVersion must be 1')
if (JSON.stringify(matrix.requiredProducerIds) !== JSON.stringify(requiredIds)) {
  failures.push('matrix requiredProducerIds must contain the exact Word/WPS/LibreOffice gate order')
}
if (entries.length !== requiredIds.length) failures.push('matrix must contain exactly three producer entries')

for (const entry of entries) {
  if (!requiredIds.includes(entry.id) || ids.has(entry.id)) {
    failures.push(`invalid or duplicate producer id: ${entry.id}`)
    continue
  }
  ids.add(entry.id)
  if (!entry.producer || !allowedStatuses.has(entry.status)) {
    failures.push(`invalid producer metadata: ${entry.id}`)
    continue
  }
  if (!safeLeafName(entry.manifest) || !safeLeafName(entry.fixture)) {
    failures.push(`producer evidence paths must be leaf names: ${entry.id}`)
    continue
  }

  const manifestUrl = new URL(entry.manifest, producerRoot)
  const fixtureUrl = new URL(entry.fixture, producerRoot)
  const manifestBytes = await readOptional(manifestUrl)
  const fixture = await readOptional(fixtureUrl)

  if (entry.status === 'pending') {
    if (typeof entry.evidenceDependency !== 'string' || entry.evidenceDependency.length < 20) {
      failures.push(`pending producer must declare its real environment dependency: ${entry.id}`)
    }
    if (manifestBytes || fixture) {
      failures.push(`pending producer must not ship unverified evidence files: ${entry.id}`)
    }
    continue
  }

  if (entry.evidenceDependency !== null || !manifestBytes || !fixture) {
    failures.push(`verified producer must have both evidence files and no pending dependency: ${entry.id}`)
    continue
  }

  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    failures.push(`producer manifest is not valid JSON: ${entry.id}`)
    continue
  }
  const digest = createHash('sha256').update(fixture).digest('hex')
  const generatedAt = Date.parse(manifest.generatedAt)
  const expected = manifest.expected
  if (manifest.schemaVersion !== 1
    || manifest.id !== entry.id
    || manifest.file !== entry.fixture
    || manifest.producer !== entry.producer
    || typeof manifest.productVersion !== 'string'
    || manifest.productVersion.length === 0
    || typeof manifest.fileVersion !== 'string'
    || manifest.fileVersion.length === 0
    || !Number.isFinite(generatedAt)
    || typeof manifest.generator !== 'string'
    || manifest.generator.length === 0
    || typeof manifest.privacyNormalization !== 'string'
    || manifest.privacyNormalization.length < 20
    || manifest.producerReopenVerified !== true
    || manifest.sha256 !== digest
    || typeof manifest.redistribution !== 'string'
    || manifest.redistribution.length < 20
    || !expected
    || typeof expected.heading !== 'string'
    || expected.heading.length === 0
    || expected.listItems < 1
    || expected.tables < 1
    || expected.images < 1
    || fixture.length < 20_000) {
    failures.push(`verified producer evidence is incomplete or inconsistent: ${entry.id}`)
  }
}

for (const id of requiredIds) {
  if (!ids.has(id)) failures.push(`required producer is missing: ${id}`)
}

if (failures.length) {
  console.error('DOCX producer matrix gate failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

const verified = entries.filter(entry => entry.status === 'verified')
const pending = entries.filter(entry => entry.status === 'pending').map(entry => entry.id)
console.log(`DOCX producer matrix gate passed: ${verified.length}/${requiredIds.length} verified; pending: ${pending.join(', ')}`)
