import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [evidenceText, manifestText, odfSource, editSource, generator, registryText] = await Promise.all([
  read('docs/evidence/post-v115-m1ca-odf-feasibility/audit.json'),
  read('src-tauri/tests/fixtures/odf-content/manifest.json'),
  read('src-tauri/src/formats/odf.rs'),
  read('src-tauri/src/formats/odf_edit.rs'),
  read('scripts/generate-e1c-ods-odp-fixtures.ps1'),
  read('shared/file-formats.json'),
])
const evidence = JSON.parse(evidenceText)
const manifest = JSON.parse(manifestText)
const registry = JSON.parse(registryText)
const failures = []
const requireFact = (condition, message) => { if (!condition) failures.push(message) }
const requireText = (source, value, message) => requireFact(source.includes(value), message)

requireFact(evidence.schemaVersion === 1 && evidence.stage === 'M1C-A-odf-feasibility' && evidence.status === 'passed', 'M1C-A evidence identity drifted')
requireFact(evidence.expected?.validOdsFormula === 'of:=SUM([.A2];8)' && evidence.expected?.validOdsCachedValue === '50', 'M1C-A expected formula baseline drifted')
requireFact(evidence.actual?.rustOdfTestsPassed >= 14 && evidence.actual?.formats?.length === 2, 'M1C-A real test totals are incomplete')
requireFact(evidence.actual?.libreOffice?.independentPdfReopen === true, 'M1C-A LibreOffice producer reopen is missing')
requireFact(evidence.actual?.wps?.status === 'blocked' && evidence.actual?.wps?.countsAsProducerPass === false, 'M1C-A WPS blocker must not count as a pass')
requireFact(evidence.decision?.nextStage === 'M1C-B-ODS-bounded-cell-value' && evidence.decision?.releaseCandidate === false, 'M1C-A next-stage boundary drifted')
requireFact(evidence.privacy?.localAbsolutePathsIncluded === false && evidence.privacy?.userDocumentBodiesIncluded === false, 'M1C-A privacy boundary drifted')

for (const result of evidence.actual?.formats || []) {
  const manifestItem = manifest.files?.find(item => item.formatId === result.formatId)
  const fixtureUrl = new URL(`src-tauri/tests/fixtures/odf-content/${manifestItem?.evidence?.file || ''}`, root)
  try {
    const bytes = await readFile(fixtureUrl)
    requireFact((await stat(fixtureUrl)).size === result.bytes, `M1C-A ${result.formatId} size drifted`)
    requireFact(createHash('sha256').update(bytes).digest('hex') === result.sha256, `M1C-A ${result.formatId} digest drifted`)
    requireFact(result.sourceUnchanged === true && result.libreOfficePdfBytes > 1000 && result.entryCount > 2, `M1C-A ${result.formatId} external reopen evidence is incomplete`)
  } catch {
    failures.push(`M1C-A ${result.formatId} fixture is missing`)
  }
}
const ods = evidence.actual?.formats?.find(item => item.formatId === 'ods')
const odp = evidence.actual?.formats?.find(item => item.formatId === 'odp')
requireFact(ods?.formula === 'of:=SUM([.A2];8)' && ods?.cachedValue === '50', 'M1C-A actual ODS formula is invalid')
requireFact(odp?.notesPreserved === false, 'M1C-A ODP notes boundary must reflect the real producer result')
requireText(odfSource, 'matches!(local_name, b"script" | b"event-listener")', 'M1C-A empty script container false-positive fix is missing')
requireText(odfSource, 'empty_script_containers_are_not_reported_as_macros', 'M1C-A script risk regression test is missing')
for (const value of ['raw_copy_file(file)', 'unchanged_parts_verified', 'structural_reparse_verified', 'protected_part_count', 'writes_user_file: false']) {
  requireText(editSource, value, `M1C-A isolated package contract is missing ${value}`)
}
requireText(generator, 'table:formula="SUM([.A2];8)"', 'M1C-A valid ODS formula seed is missing')
const currentOds = registry.formats?.find(item => item.id === 'ods')
const currentOdp = registry.formats?.find(item => item.id === 'odp')
requireFact(
  currentOds?.userCapability?.level === 'basic-edit'
    && currentOds?.userCapability?.saveMode === 'copy'
    && currentOds?.adapters?.writer === 'odf-cell-value',
  'M1C-A baseline must remain compatible with the later bounded ODS editor',
)
requireFact(currentOdp?.userCapability?.level === 'preview-only' && currentOdp?.capabilities?.edit === 'unsupported', 'M1C-A ODP read-only boundary drifted')
requireFact(!/[A-Z]:\\Users\\|[A-Z]:\\Project\\/i.test(evidenceText), 'M1C-A evidence exposes a local absolute path')

if (failures.length) {
  console.error('M1C-A ODF feasibility contract failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('M1C-A ODF feasibility verified: real ODS/ODP, valid formula, exact part baseline, LibreOffice reopen, WPS blocker recorded.')
