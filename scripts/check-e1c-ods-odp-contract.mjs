import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [
  registryText,
  auditText,
  manifestText,
  parser,
  command,
  commandModule,
  formatModule,
  tauriLib,
  indexCommand,
  persistentIndex,
  formatConfig,
  router,
  library,
  workspace,
  generator,
] = await Promise.all([
  read('shared/file-formats.json'),
  read('shared/office-compatibility-audit.json'),
  read('src-tauri/tests/fixtures/odf-content/manifest.json'),
  read('src-tauri/src/formats/odf_content.rs'),
  read('src-tauri/src/commands/odf_content.rs'),
  read('src-tauri/src/commands/mod.rs'),
  read('src-tauri/src/formats/mod.rs'),
  read('src-tauri/src/lib.rs'),
  read('src-tauri/src/commands/index.rs'),
  read('src-tauri/src/services/knowledge_index.rs'),
  read('src/config/fileFormats.ts'),
  read('src/router/index.ts'),
  read('src/views/LibraryMode.vue'),
  read('src/views/OdfContentReaderView.vue'),
  read('scripts/generate-e1c-ods-odp-fixtures.ps1'),
])

const registry = JSON.parse(registryText)
const audit = JSON.parse(auditText)
const manifest = JSON.parse(manifestText)
const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}

for (const contract of [
  {
    id: 'ods',
    extension: '.ods',
    mime: 'application/vnd.oasis.opendocument.spreadsheet',
    indexStatus: 'verified-precise-cell-locator',
  },
  {
    id: 'odp',
    extension: '.odp',
    mime: 'application/vnd.oasis.opendocument.presentation',
    indexStatus: 'verified-slide-and-notes-locator',
  },
]) {
  const format = registry.formats?.find(candidate => candidate.id === contract.id)
  if (!format || format.extensions?.length !== 1 || format.extensions[0] !== contract.extension) {
    failures.push(`E1C ${contract.extension} registration missing or ambiguous`)
    continue
  }
  if (format.mimeTypes?.[0] !== contract.mime || format.routeName !== 'OdfReader') {
    failures.push(`E1C ${contract.id} identity or route drift`)
  }
  const expectedUserLevel = contract.id === 'ods' ? 'basic-edit' : 'preview-only'
  const expectedSaveMode = contract.id === 'ods' ? 'copy' : 'none'
  const expectedEdit = contract.id === 'ods' ? 'supported' : 'unsupported'
  const expectedWriter = contract.id === 'ods' ? 'odf-cell-value' : null
  if (format.maxBytes !== 64 * 1024 * 1024
    || format.userCapability?.level !== expectedUserLevel
    || format.userCapability?.saveMode !== expectedSaveMode) {
    failures.push(`E1C ${contract.id} current public capability drift`)
  }
  if (format.capabilities?.read !== 'supported'
    || format.capabilities?.index !== 'supported'
    || format.capabilities?.edit !== expectedEdit
    || format.capabilities?.create !== 'unsupported'
    || format.adapters?.reader !== 'odf-content'
    || format.adapters?.indexer !== 'odf-content'
    || format.adapters?.writer !== expectedWriter
    || format.adapters?.creator !== null) {
    failures.push(`E1C ${contract.id} adapters overclaim or omit product capability`)
  }
  const auditEntry = audit.formats?.find(candidate => candidate.id === contract.id)
  if (auditEntry?.e1cReadStatus !== 'verified-libreoffice-fixture'
    || auditEntry?.e1cIndexStatus !== contract.indexStatus
    || auditEntry?.initialProductLevel !== 'read-only-preview-and-index') {
    failures.push(`E1C ${contract.id} compatibility audit status drift`)
  }
}

if (manifest.schemaVersion !== 1 || manifest.stage !== 'E1C'
  || manifest.producer?.projectAuthoredSeeds !== true
  || manifest.producer?.isolatedProfiles !== true
  || manifest.producer?.independentReopen !== true
  || manifest.privacy?.projectAuthoredContent !== true
  || manifest.privacy?.localAbsolutePathsExcludedFromManifest !== true
  || manifest.files?.length !== 2) {
  failures.push('E1C fixture manifest qualification drift')
}

for (const item of manifest.files || []) {
  const evidence = item.evidence
  const fixtureUrl = new URL(`src-tauri/tests/fixtures/odf-content/${evidence?.file || ''}`, root)
  try {
    const bytes = await readFile(fixtureUrl)
    const fixtureStat = await stat(fixtureUrl)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (!['ods', 'odp'].includes(item.formatId)
      || evidence.sourcePreserved !== true
      || fixtureStat.size !== evidence.bytes
      || digest !== evidence.sha256
      || !bytes.subarray(0, 2).equals(Buffer.from('PK'))) {
      failures.push(`E1C ${item.formatId} fixture identity/size/hash drift`)
    }
    const privateNeedles = [process.env.USERNAME || '', 'E:\\Project\\', 'C:\\Users\\']
      .filter(Boolean)
      .flatMap(value => [Buffer.from(value, 'utf8'), Buffer.from(value, 'utf16le')])
    if (privateNeedles.some(needle => bytes.includes(needle))) {
      failures.push(`E1C ${item.formatId} fixture contains a local identity or absolute path`)
    }
  } catch {
    failures.push(`E1C ${item.formatId} fixture is missing`)
  }
}

for (const [value, message] of [
  ['inspect_odf_package(source, &normalized)', 'E1C must reuse the E1A package verifier'],
  ['encrypted_entry_count > 0', 'E1C encrypted content gate missing'],
  ['MAX_ODS_SHEETS', 'E1C sheet limit missing'],
  ['MAX_ODS_ROWS', 'E1C row limit missing'],
  ['MAX_ODS_COLUMNS', 'E1C column limit missing'],
  ['MAX_ODS_CELLS', 'E1C cell limit missing'],
  ['MAX_ODP_SLIDES', 'E1C slide limit missing'],
  ['MAX_TEXT_CHARS', 'E1C text limit missing'],
  ['number-rows-repeated', 'E1C repeated row handling missing'],
  ['number-columns-repeated', 'E1C repeated column handling missing'],
  ['ods-cell', 'E1C cell locator missing'],
  ['odp-slide', 'E1C slide locator missing'],
  ['odp-notes', 'E1C notes locator missing'],
  ['parses_real_ods_and_odp_and_builds_precise_segments', 'E1C real fixture test missing'],
]) requireText(parser, value, message)

requireText(command, 'WorkspaceGuard::new(library_root)', 'E1C command must remain workspace-scoped')
requireText(command, 'resolve_existing_file(path, &["ods", "odp"])', 'E1C command extension allowlist missing')
requireText(command, 'source_preserved', 'E1C source preservation proof missing')
requireText(commandModule, 'pub mod odf_content;', 'E1C command module is not exported')
requireText(formatModule, 'pub mod odf_content;', 'E1C format module is not exported')
requireText(tauriLib, 'read_odf_content_document', 'E1C command is not registered')
requireText(indexCommand, 'build_odf_content_index_segments', 'E1C live search integration missing')
requireText(persistentIndex, 'indexer == "odf-content"', 'E1C persistent index integration missing')
requireText(persistentIndex, 'real_ods_and_odp_enter_persistent_search_with_precise_locators', 'E1C persistent index real-fixture test missing')
requireText(formatConfig, "'OdfReader'", 'E1C route is not part of the shared library shell')
requireText(router, "name: 'OdfReader'", 'E1C router entry missing')
requireText(library, "'ods', 'odp'", 'E1C search result reopening does not preserve locators')
requireText(workspace, "'read_odf_content_document'", 'E1C workspace does not invoke the guarded command')
requireText(workspace, '源文件未修改', 'E1C workspace does not expose the source-preserved boundary')
requireText(generator, "'ods:calc8'", 'E1C LibreOffice ODS producer filter missing')
requireText(generator, "'odp:impress8'", 'E1C LibreOffice ODP producer filter missing')
requireText(generator, 'independentReopen', 'E1C independent reopen evidence missing')

if (failures.length) {
  console.error('E1C ODS/ODP contract failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('E1C ODS/ODP read/index contract passed.')
