import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [
  registryText,
  officeAuditText,
  manifestText,
  backend,
  externalApps,
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
  read('src-tauri/tests/fixtures/legacy-doc/manifest.json'),
  read('src-tauri/src/commands/legacy_office.rs'),
  read('src-tauri/src/commands/external_apps.rs'),
  read('src-tauri/src/commands/mod.rs'),
  read('src-tauri/src/lib.rs'),
  read('src/config/fileFormats.ts'),
  read('src/router/index.ts'),
  read('src/views/LibraryMode.vue'),
  read('src/views/LegacyOfficeView.vue'),
  read('scripts/generate-e2b-legacy-doc-fixture.ps1'),
])

const registry = JSON.parse(registryText)
const officeAudit = JSON.parse(officeAuditText)
const manifest = JSON.parse(manifestText)
const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}

const format = registry.formats?.find(candidate => candidate.id === 'legacy-doc')
if (!format || format.extensions?.length !== 1 || format.extensions[0] !== '.doc') {
  failures.push('E2B .doc format registration missing or ambiguous')
} else {
  if (format.routeName !== 'LegacyOffice') failures.push('E2B right-pane route drift')
  if (format.maxBytes !== 64 * 1024 * 1024) failures.push('E2B source size boundary drift')
  if (format.userCapability?.level !== 'external-open' || format.userCapability?.saveMode !== 'none') {
    failures.push('E2B public capability overclaims native DOC editing')
  }
  for (const capability of ['read', 'edit', 'create', 'index']) {
    if (format.capabilities?.[capability] !== 'unsupported') failures.push(`E2B ${capability} must remain unsupported`)
  }
  for (const adapter of ['reader', 'writer', 'creator', 'indexer']) {
    if (format.adapters?.[adapter] !== null) failures.push(`E2B adapter must remain absent: ${adapter}`)
  }
}

const audit = officeAudit.formats?.find(candidate => candidate.extension === '.doc')
if (audit?.conversion !== 'explicit-new-copy-after-preflight'
  || audit?.e2bPreflightStatus !== 'verified-real-cfb-fixture'
  || audit?.e2bConversionStatus !== 'verified-isolated-docx-copy') {
  failures.push('E2B compatibility audit status drift')
}

if (manifest.schemaVersion !== 1 || manifest.stage !== 'E2B'
  || manifest.source?.preserved !== true
  || manifest.producer?.isolatedProfile !== true
  || manifest.producer?.independentSourceReopen !== true
  || manifest.converter?.isolatedProfiles !== true
  || manifest.converter?.independentOutputReopen !== true) {
  failures.push('E2B evidence manifest qualification drift')
}

for (const [kind, header] of [['source', 'd0cf11e0a1b11ae1'], ['output', '504b']]) {
  const item = manifest[kind]
  const fixtureUrl = new URL(`src-tauri/tests/fixtures/legacy-doc/${item?.file || ''}`, root)
  try {
    const bytes = await readFile(fixtureUrl)
    const fixtureStat = await stat(fixtureUrl)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (fixtureStat.size !== item.bytes || digest !== item.sha256) failures.push(`E2B ${kind} fixture size/hash drift`)
    if (!bytes.subarray(0, header.length / 2).equals(Buffer.from(header, 'hex'))) failures.push(`E2B ${kind} container signature drift`)
    const localIdentity = process.env.USERNAME || ''
    const privateNeedles = [localIdentity, 'E:\\Project\\', 'C:\\Users\\39633\\']
      .filter(Boolean)
      .flatMap(value => [Buffer.from(value, 'utf8'), Buffer.from(value, 'utf16le')])
    if (privateNeedles.some(needle => bytes.includes(needle))) failures.push(`E2B ${kind} fixture contains a local identity or absolute path`)
  } catch {
    failures.push(`E2B ${kind} fixture is missing`)
  }
}

for (const [value, message] of [
  ['WorkspaceGuard::new(library_root)', 'E2B commands must remain workspace-scoped'],
  ['CompoundFile::open', 'E2B CFB parser missing'],
  ['FIB_IDENT', 'E2B MS-DOC FIB validation missing'],
  ['encrypted-content', 'E2B encrypted-content gate missing'],
  ['"vba"', 'E2B VBA gate missing'],
  ['ole-object', 'E2B OLE object gate missing'],
  ['external-link', 'E2B external-link warning missing'],
  ['expected_source_sha256', 'E2B stale-source digest gate missing'],
  ['IsolatedConversionWorkspace', 'E2B isolated conversion workspace missing'],
  ['UserInstallation=', 'E2B isolated LibreOffice profile missing'],
  ['CONVERSION_TIMEOUT', 'E2B conversion timeout missing'],
  ['taskkill.exe', 'E2B Windows process-tree termination missing'],
  ['outputs.len() != 1', 'E2B output allowlist missing'],
  ['parse_docx(&converted)', 'E2B pre-commit DOCX structural reread missing'],
  ['write_new_bytes', 'E2B reliable new-file commit missing'],
  ['fs::remove_file(target)', 'E2B target rollback missing'],
  ['converts_real_doc_through_the_product_isolation_path', 'E2B product-path desktop audit test missing'],
]) requireText(backend, value, message)

requireText(externalApps, 'discover_external_executable', 'E2B must use fresh E2A converter discovery')
requireText(commandModule, 'pub mod legacy_office;', 'E2B command module is not exported')
requireText(tauriLib, 'preflight_legacy_doc', 'E2B preflight command is not registered')
requireText(tauriLib, 'convert_legacy_doc_to_docx_copy', 'E2B conversion command is not registered')
requireText(formatConfig, "'LegacyOffice'", 'E2B route is not included in the library shell')
requireText(router, "name: 'LegacyOffice'", 'E2B standalone route registration missing')
requireText(library, "import('./LegacyOfficeView.vue')", 'E2B right-pane workspace is not mounted')
requireText(workspace, "'preflight_legacy_doc'", 'E2B workspace does not invoke guarded preflight')
requireText(workspace, "'convert_legacy_doc_to_docx_copy'", 'E2B workspace does not invoke explicit copy conversion')
requireText(workspace, 'expectedSourceSha256', 'E2B workspace does not bind conversion to the reviewed source')
requireText(workspace, '新的 DOCX 目标', 'E2B workspace does not require a visible new target')
requireText(generator, "'doc:MS Word 97'", 'E2B real CFB producer path missing')
requireText(generator, 'producer-profile', 'E2B producer isolation missing')
requireText(generator, 'source-reopen-profile', 'E2B independent source reopen missing')
requireText(generator, 'convert-profile', 'E2B conversion isolation missing')
requireText(generator, 'reopen-profile', 'E2B independent output reopen missing')
requireText(generator, '$sourceHashBefore -ne $sourceHashAfter', 'E2B fixture source-preservation gate missing')

if (failures.length) {
  console.error(`E2B legacy DOC contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('E2B legacy DOC contract passed: real CFB fixture, risk preflight, isolated DOCX copy conversion, source preservation, and independent reopen evidence.')
}
