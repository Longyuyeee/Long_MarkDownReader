import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { validateOdtReleaseState } from './odt-release-state-machine.mjs'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const contract = JSON.parse(read('shared/odt-read-contract.json'))
const matrix = JSON.parse(read('fixtures/odt/producers/matrix.json'))
const registry = JSON.parse(read('shared/file-formats.json'))
const desktopManifest = JSON.parse(read('docs/evidence/e1b-odt-desktop/audit-manifest.json'))
const parser = read('src-tauri/src/formats/odt.rs')
const command = read('src-tauri/src/commands/odt.rs')
const indexCommand = read('src-tauri/src/commands/index.rs')
const persistentIndex = read('src-tauri/src/services/knowledge_index.rs')
const view = read('src/views/OdtReaderView.vue')
const fixtureGenerator = read('scripts/generate-e1b-odt-producer-fixtures.ps1')
const desktopEvidenceChecker = read('scripts/check-e1b-odt-desktop-audit.mjs')
const desktopEvidenceRunner = read('scripts/run-e1b-odt-desktop-audit.ps1')
const desktopEvidenceCapture = read('scripts/capture-e1b-odt-desktop-audit.mjs')
const closureBundleModule = read('scripts/E1BWpsClosureBundle.psm1')
const closureBundleImporter = read('scripts/import-e1b-wps-closure-bundle.ps1')
const closureBundleExporter = read('scripts/export-e1b-wps-closure-bundle.ps1')
const fail = message => { throw new Error(`E1B ODT read contract: ${message}`) }

if (contract.schemaVersion !== 1 || contract.stage !== 'E1B') fail('invalid stage header')
for (const failure of validateOdtReleaseState({ contract, matrix, registry, desktopManifest })) {
  fail(failure)
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
if (contract.desktopEvidence?.verified !== true
  || contract.desktopEvidence?.manifest !== 'docs/evidence/e1b-odt-desktop/audit-manifest.json'
  || contract.desktopEvidence?.layouts?.join(',') !== 'normal,compact'
  || contract.desktopEvidence?.themes?.join(',') !== 'professional-light,professional-dark'
  || !contract.desktopEvidence?.searchVerified
  || !contract.desktopEvidence?.locatorVerified
  || !desktopEvidenceChecker.includes('Tauri Debug WebView2 via Chrome DevTools Protocol')) {
  fail('desktop visual evidence drift')
}
if (contract.wpsClosureAutomation?.ready !== true
  || contract.wpsClosureAutomation?.fixtureAdmission !== 'manifest-and-sha256'
  || contract.wpsClosureAutomation?.portableHandoff !== 'strict-zip-sha256-v1'
  || contract.wpsClosureAutomation?.desktopGateModes?.join(',') !== 'checkpoint,closure-candidate'
  || contract.wpsClosureAutomation?.requiredClosureEvidence?.join(',') !== 'native-odt-save,same-producer-reopen,privacy-sanitized,desktop-search,desktop-locator,source-unchanged'
  || !desktopEvidenceRunner.includes('Get-FileHash -LiteralPath $wpsFixture -Algorithm SHA256')
  || !desktopEvidenceRunner.includes('LONGEDIT_E1B_WPS')
  || !desktopEvidenceCapture.includes("'wps-light-normal-search'")
  || !desktopEvidenceCapture.includes("'wps-dark-compact-locator'")
  || !desktopEvidenceChecker.includes("'closure-candidate'")) {
  fail('WPS closure automation drift')
}
if (!closureBundleModule.includes('wps-odt-closure-handoff')
  || !closureBundleModule.includes('Existing WPS closure evidence will not be overwritten')
  || !closureBundleModule.includes('Closure bundle must contain exactly')
  || !closureBundleModule.includes('Assert-WpsFixtureEvidence')
  || !closureBundleImporter.includes('Import-E1BWpsClosureBundle')
  || !closureBundleExporter.includes('Export-E1BWpsClosureBundle')) {
  fail('WPS portable closure handoff drift')
}

const generatorSection = (start, end) => {
  const startIndex = fixtureGenerator.indexOf(`function ${start}`)
  const endIndex = fixtureGenerator.indexOf(end, startIndex)
  if (startIndex < 0 || endIndex < 0) fail(`fixture generator section missing: ${start}`)
  return fixtureGenerator.slice(startIndex, endIndex)
}
for (const [name, end] of [
  ['Export-WordOdt', 'function Export-WpsOdt'],
  ['Export-WpsOdt', 'function Invoke-LibreOffice'],
  ['Export-LibreOfficeOdt', '\ntry {']
]) {
  const section = generatorSection(name, end)
  const firstPackageCheck = section.indexOf('Test-OdtPackage $output $expected')
  const sanitizer = section.indexOf('& $metadataSanitizer -Path $output')
  const secondPackageCheck = section.indexOf('Test-OdtPackage $output $expected', firstPackageCheck + 1)
  if (firstPackageCheck < 0 || sanitizer < firstPackageCheck || secondPackageCheck < sanitizer) {
    fail(`fixture validation order drift: ${name}`)
  }
}
const wpsGenerator = generatorSection('Export-WpsOdt', 'function Invoke-LibreOffice')
if (!fixtureGenerator.includes('audit-e1b-wps-odf-environment.ps1')
  || wpsGenerator.indexOf('& $wpsEnvironmentAuditor -RequireReady') < 0
  || wpsGenerator.indexOf('& $wpsEnvironmentAuditor -RequireReady') > wpsGenerator.indexOf('New-Object -ComObject KWPS.Application')) {
  fail('WPS ODF preflight drift')
}

const required = ['microsoft-word-16', 'wps-writer', 'libreoffice-writer']
if (matrix.requiredProducerIds?.join(',') !== required.join(',')) fail('producer inventory drift')
for (const id of required) {
  const expectedStatus = contract.producerGate.verified.includes(id) ? 'verified' : 'blocked'
  const producer = matrix.producers?.find(candidate => candidate.id === id)
  if (!producer || producer.status !== expectedStatus) fail(`producer status drift: ${id}`)
  if (expectedStatus === 'blocked') {
    if (producer.fixture || producer.manifest || !producer.blockerEvidence
      || producer.blocker !== contract.producerGate.blocked[id]
      || `fixtures/odt/producers/${producer.blockerEvidence}` !== contract.producerGate.blockerEvidence?.[id]) {
      fail(`blocked producer evidence drift: ${id}`)
    }
    const blockerEvidenceSource = read(`fixtures/odt/producers/${producer.blockerEvidence}`)
    const blockerEvidence = JSON.parse(blockerEvidenceSource)
    if (blockerEvidence.schemaVersion !== 1 || blockerEvidence.stage !== 'E1B'
      || blockerEvidence.producerId !== id || blockerEvidence.status !== 'blocked'
      || blockerEvidence.blocker !== producer.blocker
      || blockerEvidence.comProgId !== 'KWPS.Application'
      || !Number.isInteger(blockerEvidence.registeredFileConverters)
      || blockerEvidence.registeredFileConverters !== 0
      || blockerEvidence.odfNamedComponentCount !== 0
      || blockerEvidence.saveProbe?.sourceFixture !== 'wps-writer.docx'
      || blockerEvidence.saveProbe?.requestedFileFormat !== 23
      || blockerEvidence.saveProbe?.outputKind !== 'ole-compound-document'
      || !blockerEvidence.saveProbe?.outputHeader?.startsWith('d0 cf 11 e0')
      || !blockerEvidence.saveProbe?.tempOutputDeleted) {
      fail(`blocked producer machine evidence drift: ${id}`)
    }
    for (const sensitiveValue of [process.env.USERNAME, process.env.USERPROFILE, root]) {
      if (sensitiveValue && blockerEvidenceSource.toLowerCase().includes(sensitiveValue.toLowerCase())) {
        fail(`blocked producer evidence leaks local identity or path: ${id}`)
      }
    }
    continue
  }
  if (producer.blockerEvidence) fail(`verified producer retains blocker evidence: ${id}`)
  const fixturePath = path.join(root, 'fixtures/odt/producers', producer.fixture)
  const manifest = JSON.parse(read(`fixtures/odt/producers/${producer.manifest}`))
  const bytes = fs.readFileSync(fixturePath)
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  if (manifest.schemaVersion !== 1 || manifest.stage !== 'E1B' || manifest.id !== id
    || manifest.file !== producer.fixture || manifest.sourceFixture !== `${id}.docx`
    || typeof manifest.expectedText !== 'string' || !manifest.expectedText
    || manifest.sha256 !== digest || manifest.size !== bytes.length
    || !manifest.nativeOdtSave || !manifest.sameProducerReopenVerified || !manifest.privacySanitized) {
    fail(`verified producer manifest drift: ${id}`)
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail(`verified producer is not ZIP: ${id}`)
  if (!bytes.includes(Buffer.from('application/vnd.oasis.opendocument.text'))) {
    fail(`verified producer ODT mimetype missing: ${id}`)
  }
}

const verifiedCount = matrix.producers.filter(producer => producer.status === 'verified').length
const blockedIds = matrix.producers.filter(producer => producer.status === 'blocked').map(producer => producer.id)
console.log(`E1B ODT ${contract.releaseState} OK: implementation complete, ${verifiedCount}/${required.length} producer fixtures verified, blocked: ${blockedIds.join(', ') || 'none'}, write disabled`)
