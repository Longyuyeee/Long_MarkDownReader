import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [
  registryText,
  officeAuditText,
  manifestText,
  backend,
  commandModule,
  tauriLib,
  formatConfig,
  router,
  library,
  workspace,
  generator,
] = await Promise.all([
  read('shared/file-formats.json'),
  read('shared/office-compatibility-audit.json'),
  read('src-tauri/tests/fixtures/wps-native/manifest.json'),
  read('src-tauri/src/commands/wps_native.rs'),
  read('src-tauri/src/commands/mod.rs'),
  read('src-tauri/src/lib.rs'),
  read('src/config/fileFormats.ts'),
  read('src/router/index.ts'),
  read('src/views/LibraryMode.vue'),
  read('src/views/ExternalOfficeView.vue'),
  read('scripts/generate-e3-wps-native-fixtures.ps1'),
])
const registry = JSON.parse(registryText)
const officeAudit = JSON.parse(officeAuditText)
const manifest = JSON.parse(manifestText)
const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}

const specs = [
  { id: 'wps-document', extension: '.wps', file: 'longedit-e3-document.wps', header: '504b0304', container: 'zip-ooxml-word', progId: 'KWps.Application' },
  { id: 'wps-spreadsheet', extension: '.et', file: 'longedit-e3-spreadsheet.et', header: '504b0304', container: 'zip-ooxml-spreadsheet', progId: 'KET.Application' },
  { id: 'wps-presentation', extension: '.dps', file: 'longedit-e3-presentation.dps', header: 'd0cf11e0a1b11ae1', container: 'compound-binary-presentation', progId: 'KWPP.Application' },
]
const formats = new Map((registry.formats || []).map(format => [format.id, format]))
const evidence = new Map((manifest.files || []).map(file => [file.formatId, file]))

if (manifest.schemaVersion !== 1 || manifest.stage !== 'E3') failures.push('E3 fixture manifest identity drift')
if (manifest.producer !== 'WPS Office'
  || manifest.directNativeSave !== true
  || manifest.independentNativeReopen !== true
  || manifest.metadataSanitized !== true
  || manifest.conversionQualified !== false) failures.push('E3 fixture qualification boundary drift')

for (const spec of specs) {
  const format = formats.get(spec.id)
  const auditFormat = officeAudit.formats?.find(candidate => candidate.extension === spec.extension)
  if (auditFormat?.e3RecognitionStatus !== 'verified-real-wps-fixture'
    || auditFormat?.observedContainer !== spec.container
    || auditFormat?.conversion !== 'blocked-until-real-fixture-qualification') {
    failures.push(`E3 recognition/conversion audit boundary drift: ${spec.id}`)
  }
  if (!format) {
    failures.push(`E3 format registration missing: ${spec.id}`)
  } else {
    if (format.extensions?.length !== 1 || format.extensions[0] !== spec.extension) failures.push(`E3 extension registration drift: ${spec.id}`)
    if (format.routeName !== 'ExternalOffice') failures.push(`E3 right-pane route drift: ${spec.id}`)
    if (format.userCapability?.level !== 'external-open' || format.userCapability?.saveMode !== 'none') failures.push(`E3 public capability overclaim: ${spec.id}`)
    for (const capability of ['read', 'edit', 'create', 'index']) {
      if (format.capabilities?.[capability] !== 'unsupported') failures.push(`E3 ${capability} must remain unsupported: ${spec.id}`)
    }
    for (const adapter of ['reader', 'writer', 'creator', 'indexer']) {
      if (format.adapters?.[adapter] !== null) failures.push(`E3 adapter must remain absent: ${spec.id}/${adapter}`)
    }
  }

  const item = evidence.get(spec.id)
  if (!item || item.file !== spec.file || item.container !== spec.container || item.automationProgId !== spec.progId) {
    failures.push(`E3 producer evidence binding drift: ${spec.id}`)
    continue
  }
  const fixtureUrl = new URL(`src-tauri/tests/fixtures/wps-native/${spec.file}`, root)
  const bytes = await readFile(fixtureUrl)
  const fixtureStat = await stat(fixtureUrl)
  const digest = createHash('sha256').update(bytes).digest('hex').toUpperCase()
  if (fixtureStat.size !== item.size || digest !== item.sha256) failures.push(`E3 fixture size/hash drift: ${spec.file}`)
  if (!bytes.subarray(0, spec.header.length / 2).equals(Buffer.from(spec.header, 'hex'))) failures.push(`E3 fixture container signature drift: ${spec.file}`)
}

requireText(backend, 'inspect_wps_native_file', 'E3 inspection command missing')
requireText(backend, 'WorkspaceGuard::new(library_root)', 'E3 inspection must remain workspace-scoped')
requireText(backend, 'file_format_for_path(path)', 'E3 inspection must consume the shared registry')
requireText(backend, 'inspect_container', 'E3 container validation missing')
requireText(backend, 'source_preserved', 'E3 source preservation report missing')
requireText(backend, 'recognizes_real_wps_native_fixture_containers_without_writing', 'E3 real fixture Rust regression missing')
requireText(commandModule, 'pub mod wps_native;', 'E3 command module is not exported')
requireText(tauriLib, 'inspect_wps_native_file', 'E3 inspection command is not registered')
requireText(formatConfig, "'ExternalOffice'", 'E3 route is not included in the library shell')
requireText(router, "name: 'ExternalOffice'", 'E3 standalone route registration missing')
requireText(library, "import('./ExternalOfficeView.vue')", 'E3 right-pane workspace is not mounted')
requireText(workspace, "'inspect_wps_native_file'", 'E3 workspace does not invoke guarded inspection')
requireText(workspace, 'SHA-256', 'E3 workspace does not expose source identity metadata')
requireText(workspace, '外部打开', 'E3 workspace does not disclose its external-only boundary')
for (const progId of specs.map(spec => spec.progId)) {
  requireText(generator, progId, `E3 fixture generator missing ${progId}`)
}
requireText(generator, '.SaveAs(', 'E3 fixture generator must use direct native SaveAs')
requireText(generator, 'Sanitize-ZipMetadata', 'E3 ZIP metadata sanitation missing')
requireText(generator, 'Sanitize-CompoundMetadata', 'E3 compound metadata sanitation missing')
requireText(generator, 'Independent WPS Presentation reopen', 'E3 independent DPS reopen gate missing')

if (failures.length) {
  console.error(`E3 WPS native contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`E3 WPS native contract passed: ${specs.length} real fixtures, direct WPS save/reopen evidence, guarded recognition, external-open-only capability.`)
}
