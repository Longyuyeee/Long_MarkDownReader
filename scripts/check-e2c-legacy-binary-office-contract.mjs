import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [
  registryText,
  auditText,
  manifestText,
  backend,
  legacyBackend,
  commandModule,
  tauriLib,
  workspace,
  generator,
] = await Promise.all([
  read('shared/file-formats.json'),
  read('shared/office-compatibility-audit.json'),
  read('src-tauri/tests/fixtures/legacy-binary-office/manifest.json'),
  read('src-tauri/src/commands/legacy_binary_office.rs'),
  read('src-tauri/src/commands/legacy_office.rs'),
  read('src-tauri/src/commands/mod.rs'),
  read('src-tauri/src/lib.rs'),
  read('src/views/LegacyOfficeView.vue'),
  read('scripts/generate-e2c-legacy-binary-office-fixtures.ps1'),
])

const registry = JSON.parse(registryText)
const audit = JSON.parse(auditText)
const manifest = JSON.parse(manifestText)
const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}

const expected = {
  'legacy-xls': {
    extension: '.xls',
    maxBytes: 128 * 1024 * 1024,
    output: '.xlsx',
    auditId: 'xls',
    conversionStatus: 'verified-isolated-xlsx-copy',
  },
  'legacy-ppt': {
    extension: '.ppt',
    maxBytes: 96 * 1024 * 1024,
    output: '.pptx',
    auditId: 'ppt',
    conversionStatus: 'verified-isolated-pptx-copy',
  },
}

for (const [id, contract] of Object.entries(expected)) {
  const format = registry.formats?.find(candidate => candidate.id === id)
  if (!format || format.extensions?.length !== 1 || format.extensions[0] !== contract.extension) {
    failures.push(`E2C ${contract.extension} format registration missing or ambiguous`)
    continue
  }
  if (format.routeName !== 'LegacyOffice') failures.push(`E2C ${id} right-pane route drift`)
  if (format.maxBytes !== contract.maxBytes) failures.push(`E2C ${id} source size boundary drift`)
  if (format.userCapability?.level !== 'external-open' || format.userCapability?.saveMode !== 'none') {
    failures.push(`E2C ${id} public capability overclaims native editing`)
  }
  for (const capability of ['read', 'edit', 'create', 'index']) {
    if (format.capabilities?.[capability] !== 'unsupported') failures.push(`E2C ${id} ${capability} must remain unsupported`)
  }
  for (const adapter of ['reader', 'writer', 'creator', 'indexer']) {
    if (format.adapters?.[adapter] !== null) failures.push(`E2C ${id} adapter must remain absent: ${adapter}`)
  }

  const auditEntry = audit.formats?.find(candidate => candidate.id === contract.auditId)
  if (auditEntry?.conversion !== 'explicit-new-copy-after-preflight'
    || auditEntry?.e2cPreflightStatus !== 'verified-real-cfb-fixture'
    || auditEntry?.e2cConversionStatus !== contract.conversionStatus) {
    failures.push(`E2C ${id} compatibility audit status drift`)
  }
}

if (manifest.schemaVersion !== 1 || manifest.stage !== 'E2C'
  || manifest.producer?.projectAuthoredSeeds !== true
  || manifest.producer?.isolatedProfiles !== true
  || manifest.converter?.isolatedInputCopies !== true
  || manifest.converter?.isolatedProfiles !== true
  || manifest.converter?.independentOutputReopen !== true
  || manifest.privacy?.projectAuthoredContent !== true
  || manifest.privacy?.localAbsolutePathsExcludedFromManifest !== true) {
  failures.push('E2C evidence manifest qualification drift')
}

for (const item of manifest.files || []) {
  const contract = expected[item.formatId]
  if (!contract || item.source?.preserved === false || item.sourcePreserved !== true) {
    failures.push(`E2C evidence entry is unknown or does not preserve its source: ${item.formatId}`)
    continue
  }
  for (const [kind, signature] of [['source', 'd0cf11e0a1b11ae1'], ['output', '504b']]) {
    const evidence = item[kind]
    const fixtureUrl = new URL(`src-tauri/tests/fixtures/legacy-binary-office/${evidence?.file || ''}`, root)
    try {
      const bytes = await readFile(fixtureUrl)
      const fixtureStat = await stat(fixtureUrl)
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (fixtureStat.size !== evidence.bytes || digest !== evidence.sha256) {
        failures.push(`E2C ${item.formatId} ${kind} fixture size/hash drift`)
      }
      if (!bytes.subarray(0, signature.length / 2).equals(Buffer.from(signature, 'hex'))) {
        failures.push(`E2C ${item.formatId} ${kind} container signature drift`)
      }
      const privateNeedles = [process.env.USERNAME || '', 'E:\\Project\\', 'C:\\Users\\']
        .filter(Boolean)
        .flatMap(value => [Buffer.from(value, 'utf8'), Buffer.from(value, 'utf16le')])
      if (privateNeedles.some(needle => bytes.includes(needle))) {
        failures.push(`E2C ${item.formatId} ${kind} fixture contains a local identity or absolute path`)
      }
    } catch {
      failures.push(`E2C ${item.formatId} ${kind} fixture is missing`)
    }
  }
}
if (manifest.files?.length !== 2) failures.push('E2C evidence must cover exactly XLS and PPT')

for (const [value, message] of [
  ['WorkspaceGuard::new(library_root)', 'E2C commands must remain workspace-scoped'],
  ['CompoundFile::open', 'E2C CFB parser missing'],
  ['BIFF_FILEPASS', 'E2C XLS encryption gate missing'],
  ['BIFF_FORMULA', 'E2C XLS formula signal missing'],
  ['BIFF_SUPBOOK', 'E2C XLS external workbook signal missing'],
  ['PowerPoint Document', 'E2C PPT identity stream validation missing'],
  ['encrypted-content', 'E2C encrypted-content gate missing'],
  ['"vba"', 'E2C VBA gate missing'],
  ['ole-object', 'E2C OLE object gate missing'],
  ['external-link', 'E2C external-link warning missing'],
  ['expected_source_sha256', 'E2C stale-source digest gate missing'],
  ['IsolatedConversionWorkspace::create', 'E2C isolated conversion workspace missing'],
  ['UserInstallation=', 'E2C isolated LibreOffice profile missing'],
  ['CONVERSION_TIMEOUT', 'E2C conversion timeout missing'],
  ['outputs.len() != 1', 'E2C output allowlist missing'],
  ['validate_workbook_package', 'E2C XLSX structural reread missing'],
  ['parse_pptx', 'E2C PPTX structural reread missing'],
  ['write_new_bytes', 'E2C reliable new-file commit missing'],
  ['fs::remove_file(target)', 'E2C target rollback missing'],
  ['converts_real_xls_and_ppt_through_the_product_isolation_path', 'E2C product desktop audit test missing'],
]) requireText(backend, value, message)

requireText(legacyBackend, 'pub(crate) fn run_with_timeout', 'E2C shared timeout helper is not available')
requireText(commandModule, 'pub mod legacy_binary_office;', 'E2C command module is not exported')
requireText(tauriLib, 'preflight_legacy_binary_office', 'E2C preflight command is not registered')
requireText(tauriLib, 'convert_legacy_binary_office_to_modern_copy', 'E2C conversion command is not registered')
requireText(workspace, "'preflight_legacy_binary_office'", 'E2C UI preflight path missing')
requireText(workspace, "'convert_legacy_binary_office_to_modern_copy'", 'E2C UI conversion path missing')
requireText(workspace, 'expectedSourceSha256', 'E2C UI stale-source token missing')
requireText(generator, 'xls:MS Excel 97', 'E2C XLS producer filter missing')
requireText(generator, 'ppt:MS PowerPoint 97', 'E2C PPT producer filter missing')
requireText(generator, 'Calc MS Excel 2007 XML', 'E2C XLSX converter filter missing')
requireText(generator, 'Impress MS PowerPoint 2007 XML', 'E2C PPTX converter filter missing')
requireText(generator, 'sourcePreserved', 'E2C fixture source digest assertion missing')

if (failures.length) {
  console.error('E2C legacy XLS/PPT contract failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('E2C legacy XLS/PPT isolated-conversion contract passed.')
