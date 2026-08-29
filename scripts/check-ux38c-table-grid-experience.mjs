import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { textEvidenceMatchesSha256 } from './lib/text-evidence-integrity.mjs'

const table = fs.readFileSync('src/views/TableView.vue', 'utf8')
const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const viewState = fs.readFileSync('src/services/workspaceViewState.ts', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-38C table grid rejected: ${message}`) }
const evidenceRoot = 'docs/evidence/ux38c-table-grid'
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

for (const token of [
  'type="number" :value="frozenColumns"',
  ':max="maxFrozenColumns"',
  'const frozenColumns = ref(1)',
  'const maxFrozenColumns = computed(() => Math.min(12',
  'const frozenColumnStyle = (column: number)',
  'columnWidths.value.slice(0, column).reduce',
  "'frozen-edge': column === frozenColumns - 1",
  'background: var(--theme-surface)',
  '.table-row.selected .data-cell.frozen',
  'container-type: inline-size',
  '@container (max-width: 900px)',
  "title: '创建可视化 Table 副本？'",
  'Table 副本已创建：${path.split(/[\\\\/]/).pop()}，正在打开',
  'await openManagedFile(router, path)',
  "new CustomEvent('longedit:library-file-created'",
]) if (!table.includes(token)) fail(`TableView contract token missing: ${token}`)

for (const token of [
  "window.addEventListener('longedit:reveal-library-file', revealLibraryFile)",
  "window.addEventListener('longedit:library-file-created', refreshCreatedLibraryFile)",
  'selectedKeys.value = [path]',
  "treeInstRef.value?.scrollTo({ key: path, behavior: 'smooth' })",
  "window.removeEventListener('longedit:reveal-library-file', revealLibraryFile)",
]) if (!library.includes(token)) fail(`Library reveal contract token missing: ${token}`)

if (!viewState.includes('frozenColumns?: number')) fail('session view-state freeze count is not retained')
if (table.includes('freezeFirstColumn') || table.includes('toggleFreeze')) fail('boolean first-column freeze implementation returned')
if (table.includes("openManagedFile(router, path, {}, 'replace')")) fail('conversion must open the created target through the managed-file default route')
if (!packageJson.scripts?.['check:ux38c-table-grid-experience']) fail('package checker command missing')
if (!packageJson.scripts?.['audit:ux38c-table-grid']) fail('desktop audit command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38c-table-grid-experience')) fail('checker is outside the development audit chain')

const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'manifest.json'), 'utf8'))
const evidence = JSON.parse(fs.readFileSync(path.join(evidenceRoot, manifest.evidenceFile), 'utf8'))
if (manifest.stage !== 'UX-38C1' || manifest.status !== 'accepted' || manifest.visualReview !== 'accepted') fail('desktop evidence is not visually accepted')
if (manifest.sourceCommit !== 'f43ac3268db99691c31464881e18b165c19b0d5a' || evidence.sourceCommit !== manifest.sourceCommit) fail('desktop evidence is not bound to the product commit')
if (!textEvidenceMatchesSha256(path.join(evidenceRoot, manifest.evidenceFile), manifest.evidenceSha256)) fail('interaction evidence hash drift')
for (const key of ['csvLoaded', 'tsvLoaded', 'stickyPositionsStable', 'frozenLayersOpaque', 'rowSelectionNonDestructive', 'deleteDialogUsesApplicationSurface', 'conversionExplained', 'conversionResultExplained', 'generatedTableCreated', 'generatedTableLocated', 'narrowViewportStable', 'sourceFilesUnchanged']) {
  if (evidence[key] !== true) fail(`${key} is not accepted`)
}
if (evidence.frozenColumns !== 3 || evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false) fail('freeze count or runtime evidence regressed')
if (evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('privacy or release boundary drift')
if (/([A-Za-z]:\\Users\\|\\\\\?\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('evidence contains an unredacted local path')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot count drift')
for (const screenshot of manifest.screenshots) {
  const file = path.join(evidenceRoot, screenshot.file)
  if (fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 70_000 || sha256(file) !== screenshot.sha256) fail(`screenshot integrity drift: ${screenshot.file}`)
}

console.log('UX-38C table grid contract passed: current product behavior and accepted historical Tauri evidence cover variable frozen columns, opaque layers, safe row selection, disclosed conversion, automatic target opening, and narrow layout.')
