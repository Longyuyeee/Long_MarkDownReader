import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const json = file => JSON.parse(read(file))
const failures = []

const contract = json('shared/odt-read-contract.json')
const matrix = json('fixtures/odt/producers/matrix.json')
const registry = json('shared/file-formats.json')
const backend = read('src-tauri/src/commands/odt.rs')
const lib = read('src-tauri/src/lib.rs')

if (contract.releaseState !== 'checkpoint' || contract.releaseGatePassed !== false
  || contract.productExposure?.registeredAsSupported !== false
  || contract.productExposure?.writeEnabled !== false) {
  failures.push('ODT must remain at the unreleased checkpoint while the producer gate is incomplete')
}
const verified = matrix.producers?.filter(producer => producer.status === 'verified').map(producer => producer.id).sort() || []
const blocked = matrix.producers?.filter(producer => producer.status === 'blocked').map(producer => producer.id).sort() || []
if (JSON.stringify(verified) !== JSON.stringify(['libreoffice-writer', 'microsoft-word-16'])
  || JSON.stringify(blocked) !== JSON.stringify(['wps-writer'])) {
  failures.push(`ODT producer gate drift: verified=${verified.join(',')} blocked=${blocked.join(',')}`)
}
if (registry.formats.some(format => format.extensions?.includes('.odt'))) {
  failures.push('ODT must not enter the shared registry before all three producer gates pass')
}
for (const token of [
  'let after = fs::read(path)',
  'let source_preserved = source == after',
  'ODT 文件在只读预览期间发生变化',
  'reads_verified_producer_sources_without_mutation',
]) {
  if (!backend.includes(token)) failures.push(`ODT source-preservation hardening is missing ${token}`)
}
if (backend.includes('read_external_odt_document') || lib.includes('read_external_odt_document')) {
  failures.push('external ODT commands must not exist before the producer gate closes')
}
const associations = json('src-tauri/tauri.conf.json').bundle?.fileAssociations || []
if (associations.length !== 1 || JSON.stringify(associations[0].ext) !== JSON.stringify(['md', 'markdown'])) {
  failures.push('EA-3D must not add an ODT installer association')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-3D external ODT gate passed: source preservation is hardened and WPS 2/3 keeps ODT unregistered, unassociated, and unavailable externally.')
