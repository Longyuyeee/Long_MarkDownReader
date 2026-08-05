import fs from 'node:fs'

const table = fs.readFileSync('src/views/TableView.vue', 'utf8')
const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const viewState = fs.readFileSync('src/services/workspaceViewState.ts', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-38C table grid rejected: ${message}`) }

for (const token of [
  'type="number" :value="frozenColumns"',
  ':max="maxFrozenColumns"',
  'const frozenColumns = ref(1)',
  'const maxFrozenColumns = computed(() => Math.min(12',
  'const frozenColumnStyle = (column: number)',
  'columnWidths.value.slice(0, column).reduce',
  "'frozen-edge': column === frozenColumns - 1",
  'background: var(--theme-card)',
  "title: '创建可视化 Table 副本？'",
  "title: 'Table 副本已创建'",
  "positiveText: '打开新文件'",
  "negativeText: '在文件树中定位'",
  "new CustomEvent('longedit:library-file-created'",
  "new CustomEvent('longedit:reveal-library-file'",
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
if (/message\.success\([^\n]+\)[\s\S]{0,120}openManagedFile\(router, path, \{\}, 'replace'\)/.test(table)) fail('conversion returned to an unexplained automatic route change')
if (!packageJson.scripts?.['check:ux38c-table-grid-experience']) fail('package checker command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38c-table-grid-experience')) fail('checker is outside the development audit chain')

console.log('UX-38C table grid contract passed: variable frozen columns, opaque sticky layers, explicit conversion preview, and open-or-locate completion are present.')
