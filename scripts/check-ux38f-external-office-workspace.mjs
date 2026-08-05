import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38F external Office workspace rejected: ${message}`); process.exit(1) }
const panel = read('src/components/workspace/ExternalApplicationPanel.vue')
const external = read('src/views/ExternalOfficeView.vue')
const legacy = read('src/views/LegacyOfficeView.vue')
const state = read('src/services/workspaceViewState.ts')
for (const token of ['discover_external_applications', 'open_workspace_file_externally', "selectedId = ref('system-default')", 'sourcePreservedAtHandoff', '未在此电脑上检测到', '@container (max-width: 520px)']) if (!panel.includes(token)) fail(`external application panel token missing: ${token}`)
for (const [name, source] of [['WPS native', external], ['legacy Office', legacy]]) {
  if (!source.includes('<ExternalApplicationPanel :path="documentPath" />')) fail(`${name} workspace does not expose direct external open`)
  if (!source.includes('container-type: inline-size') || !source.includes('@container (max-width: 640px)')) fail(`${name} workspace is not container responsive`)
}
if (!legacy.includes('overflow-x: hidden') || !legacy.includes('box-sizing: border-box; width: 100%')) fail('legacy narrow layout can expose a native horizontal track')
for (const token of ['recallWorkspaceViewState(documentPath.value)?.draft', 'rememberWorkspaceViewState(documentPath.value']) if (!legacy.includes(token)) fail(`legacy target restoration token missing: ${token}`)
for (const token of ['externalApplication?: string', 'draft?: string']) if (!state.includes(token)) fail(`workspace state token missing: ${token}`)
const registry = JSON.parse(read('shared/file-formats.json'))
for (const id of ['legacy-doc', 'legacy-xls', 'legacy-ppt', 'wps-document', 'wps-spreadsheet', 'wps-presentation']) {
  const format = registry.formats.find(item => item.id === id)
  if (format?.userCapability?.level !== 'external-open' || format.userCapability.saveMode !== 'none') fail(`${id} capability boundary drift`)
}
const evidenceRoot = 'docs/evidence/ux38f-external-office'
const manifestPath = path.join(evidenceRoot, 'manifest.json')
const evidencePath = path.join(evidenceRoot, 'interaction-evidence.json')
const manifest = JSON.parse(read(manifestPath))
const evidence = JSON.parse(read(evidencePath))
if (manifest.stage !== 'UX-38F' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('visual evidence is not accepted')
if (manifest.sourceCommit !== evidence.sourceCommit || evidence.sourceCommit !== '84ceaf8d0e44dd7af387944fe4f38753dfef16b2') fail('evidence is not bound to the accepted product commit')
for (const key of ['allFormatsLoaded', 'directExternalOpenVisible', 'capabilityBoundaryVisible', 'allContextsRestored', 'allNarrowLayoutsStable', 'allSourceFilesUnchanged']) if (evidence[key] !== true) fail(`evidence gate failed: ${key}`)
if (evidence.externalApplicationLaunched !== false || evidence.conversionExecuted !== false || evidence.runtimeErrorCount !== 0 || evidence.unexpectedDialogCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('execution/runtime/privacy/release boundary drift')
if (!Array.isArray(evidence.formatResults) || evidence.formatResults.length !== 6 || evidence.formatResults.some(item => item.optionCount !== 4 || !item.openButtonVisible || !item.boundaryVisible || item.loadError || !item.contextRestored || !item.narrowStable)) fail('per-format desktop evidence is incomplete')
if (manifest.evidenceSha256 !== crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')) fail('evidence digest mismatch')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 2) fail('screenshot set is incomplete')
for (const screenshot of manifest.screenshots) {
  const bytes = fs.readFileSync(path.join(evidenceRoot, screenshot.file))
  if (bytes.length !== screenshot.bytes || bytes.length < 60_000 || crypto.createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) fail(`screenshot identity failed: ${screenshot.file}`)
}
const matrix = JSON.parse(read('shared/ux38-format-experience-matrix.json'))
for (const id of ['legacy-doc', 'legacy-xls', 'legacy-ppt', 'wps-document', 'wps-spreadsheet', 'wps-presentation']) if (matrix.formats.find(item => item.id === id)?.profile !== 'ux38f-external-office') fail(`${id} experience profile drift`)
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.scripts?.['audit:ux38f-external-office'] || !packageJson.scripts?.['check:ux38f-external-office-workspace']) fail('package audit/check command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38f-external-office-workspace')) fail('checker is outside the development audit chain')
console.log('UX-38F external Office workspace passed: six formats expose direct, guarded desktop-app handoff with explicit unavailable states and restored user choices.')
