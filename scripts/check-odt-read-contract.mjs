import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const contract = JSON.parse(read('shared/odt-read-contract.json'))
const matrix = JSON.parse(read('fixtures/odt/producers/matrix.json'))
const registry = JSON.parse(read('shared/file-formats.json'))
const parser = read('src-tauri/src/formats/odt.rs')
const command = read('src-tauri/src/commands/odt.rs')
const indexCommand = read('src-tauri/src/commands/index.rs')
const persistentIndex = read('src-tauri/src/services/knowledge_index.rs')
const view = read('src/views/OdtReaderView.vue')
const fail = message => { throw new Error(`E1B ODT read contract: ${message}`) }

if (contract.schemaVersion !== 1 || contract.stage !== 'E1B') fail('invalid stage header')
if (contract.complete || !contract.implementationComplete || contract.releaseGatePassed) {
  fail('checkpoint completion state drift')
}
if (contract.nextStage !== 'E1B-producer-gate-closure') fail('next stage drift')
if (registry.formats.some(format => format.extensions.includes('.odt'))) {
  fail('.odt must remain unregistered until the producer gate passes')
}
for (const field of ['commandImplemented', 'uiImplemented', 'indexImplemented']) {
  if (contract.productExposure?.[field] !== true) fail(`${field} evidence missing`)
}
if (contract.productExposure?.registeredAsSupported || contract.productExposure?.writeEnabled) {
  fail('product exposure or write boundary drift')
}

const limits = {
  blocks: ['MAX_ODT_BLOCKS', '50_000'],
  textChars: ['MAX_ODT_TEXT_CHARS', '8_000_000'],
  tableRows: ['MAX_ODT_TABLE_ROWS', '50_000'],
  tableCells: ['MAX_ODT_TABLE_CELLS', '100_000'],
  repeat: ['MAX_ODT_REPEAT', '1_024'],
  imageReferences: ['MAX_ODT_IMAGE_REFS', '256'],
  previewImages: ['MAX_ODT_PREVIEW_IMAGES', '32'],
  previewImageBytes: ['MAX_ODT_PREVIEW_IMAGE_BYTES', '4 * 1024 * 1024'],
  previewTotalBytes: ['MAX_ODT_PREVIEW_TOTAL_BYTES', '12 * 1024 * 1024']
}
for (const [field, [constant, expression]] of Object.entries(limits)) {
  const implementation = field.startsWith('preview') ? command : parser
  if (!Number.isInteger(contract.limits?.[field]) || contract.limits[field] <= 0) fail(`invalid ${field}`)
  if (!implementation.includes(`const ${constant}`) || !implementation.includes(expression)) {
    fail(`implementation limit drift for ${field}`)
  }
}
for (const kind of ['heading', 'paragraph', 'list-item', 'table', 'internal-image', 'metadata']) {
  if (!contract.semanticCoverage?.includes(kind)) fail(`semantic coverage missing: ${kind}`)
}
if (!parser.includes('inspect_odf_package(source, ".odt")')
  || !parser.includes('"encrypted-content"')
  || !command.includes('read_odt_document')
  || !view.includes('read_odt_document')
  || !indexCommand.includes('"odt-block"')
  || !persistentIndex.includes('"odt-block"')) {
  fail('read, risk, UI, or locator implementation evidence missing')
}

const required = ['microsoft-word-16', 'wps-writer', 'libreoffice-writer']
if (matrix.requiredProducerIds?.join(',') !== required.join(',')) fail('producer inventory drift')
for (const id of required) {
  const expectedStatus = contract.producerGate.verified.includes(id) ? 'verified' : 'blocked'
  const producer = matrix.producers?.find(candidate => candidate.id === id)
  if (!producer || producer.status !== expectedStatus) fail(`producer status drift: ${id}`)
  if (expectedStatus === 'blocked') {
    if (producer.fixture || producer.manifest || producer.blocker !== contract.producerGate.blocked[id]) {
      fail(`blocked producer evidence drift: ${id}`)
    }
    continue
  }
  const fixturePath = path.join(root, 'fixtures/odt/producers', producer.fixture)
  const manifest = JSON.parse(read(`fixtures/odt/producers/${producer.manifest}`))
  const bytes = fs.readFileSync(fixturePath)
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  if (manifest.sha256 !== digest || manifest.size !== bytes.length
    || !manifest.nativeOdtSave || !manifest.sameProducerReopenVerified || !manifest.privacySanitized) {
    fail(`verified producer manifest drift: ${id}`)
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail(`verified producer is not ZIP: ${id}`)
}

console.log('E1B ODT checkpoint OK: implementation complete, LibreOffice fixture verified, Word/WPS producer gate blocked, product exposure disabled')
