import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const contract = JSON.parse(read('shared/odf-package-contract.json'))
const implementation = read('src-tauri/src/formats/odf.rs')
const registry = JSON.parse(read('shared/file-formats.json'))
const fail = message => { throw new Error(`E1A ODF package contract: ${message}`) }

if (contract.schemaVersion !== 1 || contract.stage !== 'E1A' || contract.complete !== true) {
  fail('invalid stage header')
}
if (contract.nextStage !== 'E1B-odt-read-index') fail('next stage drift')

const expectedFormats = [
  ['odt', '.odt', 'application/vnd.oasis.opendocument.text'],
  ['ods', '.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
  ['odp', '.odp', 'application/vnd.oasis.opendocument.presentation']
]
for (const [id, extension, rootMime] of expectedFormats) {
  const format = contract.formats?.find(candidate => candidate.id === id)
  if (!format || format.extension !== extension || format.rootMime !== rootMime) {
    fail(`format contract drift for ${extension}`)
  }
  if (!implementation.includes(rootMime)) fail(`implementation MIME missing for ${extension}`)
}

const expectedLimits = {
  fileBytes: ['MAX_ODF_FILE_BYTES', '64 * 1024 * 1024'],
  entryCount: ['MAX_ODF_ENTRIES', '4_096'],
  uncompressedBytes: ['MAX_ODF_UNCOMPRESSED_BYTES', '256 * 1024 * 1024'],
  xmlEntryBytes: ['MAX_ODF_XML_ENTRY_BYTES', '16 * 1024 * 1024'],
  xmlTotalBytes: ['MAX_ODF_XML_TOTAL_BYTES', '64 * 1024 * 1024'],
  compressionRatio: ['MAX_ODF_COMPRESSION_RATIO', '200'],
  xmlDepth: ['MAX_ODF_XML_DEPTH', '256'],
  xmlEvents: ['MAX_ODF_XML_EVENTS', '1_000_000']
}
for (const [field, [constant, expression]] of Object.entries(expectedLimits)) {
  if (!Number.isInteger(contract.limits?.[field]) || contract.limits[field] <= 0) {
    fail(`invalid ${field} limit`)
  }
  if (!implementation.includes(`const ${constant}`) || !implementation.includes(expression)) {
    fail(`implementation limit drift for ${field}`)
  }
}

const requiredRiskCodes = ['digital-signature', 'embedded-object', 'encrypted-content', 'external-link', 'script-or-macro']
if (contract.riskCodes?.join(',') !== requiredRiskCodes.join(',')) fail('risk code order or coverage drift')
for (const risk of requiredRiskCodes) {
  if (!implementation.includes(`"${risk}"`)) fail(`implementation risk code missing: ${risk}`)
}
if (!Array.isArray(contract.requiredRejections) || contract.requiredRejections.length < 20) {
  fail('rejection inventory is incomplete')
}
for (const field of ['registeredAsSupported', 'commandExposed', 'uiExposed', 'indexEnabled', 'writeEnabled']) {
  if (contract.productExposure?.[field] !== false) fail(`${field} must remain disabled in E1A`)
}
if (!contract.fixturePolicy?.syntheticSecurityFixtures
  || !contract.fixturePolicy?.sourceBytesMustRemainUnchanged
  || contract.fixturePolicy?.executeEmbeddedContent
  || contract.fixturePolicy?.followExternalLinks) {
  fail('fixture or no-execution policy drift')
}

const registeredExtensions = registry.formats.flatMap(format => format.extensions)
if (registeredExtensions.includes('.odt')) {
  fail('.odt must remain outside the supported registry after E1B')
}
for (const extension of ['.ods', '.odp']) {
  const format = registry.formats.find(candidate => candidate.extensions?.includes(extension))
  if (!format) fail(`${extension} must be registered after E1C`)
  if (format.routeName !== 'OdfReader' || format.maxBytes !== 64 * 1024 * 1024) {
    fail(`${extension} route or size boundary drift`)
  }
  if (format.userCapability?.level !== 'preview-only' || format.userCapability?.saveMode !== 'none') {
    fail(`${extension} must remain preview-only with no save mode`)
  }
  if (format.capabilities?.read !== 'supported' || format.capabilities?.index !== 'supported'
    || format.capabilities?.edit !== 'unsupported' || format.capabilities?.create !== 'unsupported') {
    fail(`${extension} capability boundary drift`)
  }
  if (format.adapters?.reader !== 'odf-content' || format.adapters?.indexer !== 'odf-content'
    || format.adapters?.writer !== null || format.adapters?.creator !== null) {
    fail(`${extension} implementation ownership drift`)
  }
}
for (const test of [
  'accepts_minimal_odt_ods_and_odp_packages',
  'rejects_doctype_custom_entities_and_excessive_xml_depth',
  'reports_encryption_signatures_scripts_external_links_and_embedded_objects',
  'enforces_entry_uncompressed_xml_and_compression_ratio_budgets'
]) {
  if (!implementation.includes(`fn ${test}`)) fail(`required Rust evidence missing: ${test}`)
}

console.log('E1A ODF package boundary + E1C ODS/ODP exposure OK: 3 formats, 8 resource limits, 5 risk classes')
