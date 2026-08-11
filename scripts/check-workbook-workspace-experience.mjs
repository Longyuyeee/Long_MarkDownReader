import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const view = read('src/views/WorkbookView.vue')
requireTokens(view, 'Workbook linked data entry', [
  'workbookActionOptions',
  "key: 'linked-data'",
  '透视表与数据连接',
  'summary.totalObjectCount',
  '当前仅查看',
  'LongEdit 不会自动刷新数据',
  '不会访问外部文件或网络地址',
])
if (view.includes('class="linked-data-toolbar"')) fail('Linked data summary restored a permanent workbook row.')
if (view.includes('title="高级数据对象审计"')) fail('Internal audit wording returned to the primary workbook UI.')

requireTokens(view, 'Workbook progressive tool shell', [
  "const activeToolPanel = ref<'none' | 'format' | 'data' | 'chart'>('none')",
  ':options="workbookToolOptions"',
  "activeToolPanel === 'format'",
  "activeToolPanel === 'data'",
  "activeToolPanel === 'chart'",
  'handleWorkbookToolSelect',
  'height: 44px; min-height: 44px',
  '.sheet-tabs { min-height: 32px',
  '@container (max-width: 680px)',
  '.workbook-actions .tool-panel-trigger span { display: none; }',
  '.workbook-actions button.primary span { display: none; }',
])
requireTokens(view, 'Workbook compact formula bar', [
  ':options="definedNameActionOptions"',
  'class="name-manager-button"',
  'handleDefinedNameAction',
  '.formula-bar .name-manager-button',
])
requireTokens(view, 'Workbook knowledge search locator', [
  "const requestedSheet = computed(() => String(route.query.sheet || ''))",
  'document.sheets.includes(requestedSheet.value)',
  "String(route.query.locatorToken || '')",
  'void selectSheet(sheet)',
])
if (!/<div[^>]+activeToolPanel === 'format'[^>]+class="format-toolbar"/.test(view)) fail('Format tools must remain collapsed until explicitly requested.')
if (!/<div[^>]+activeToolPanel === 'chart'[^>]+class="drawing-toolbar"/.test(view)) fail('Drawing tools must remain collapsed until explicitly requested.')

requireTokens(view, 'Opaque workbook grid', [
  "'--cell-fill': style.fillColor || 'var(--theme-surface)'",
  '.sheet-header { position: sticky;',
  'background: var(--theme-surface-2);',
  '.row-number { position: sticky;',
  'color-mix(in srgb, var(--theme-surface-2) 78%, var(--theme-primary))',
  'color-mix(in srgb, var(--theme-surface-2) 70%, var(--theme-primary))',
  '.workbook-cell { position: relative;',
  'background: var(--cell-fill, var(--theme-surface));',
  '.column-header.frozen,.workbook-cell.frozen',
])

const themes = read('src/styles/themes.scss')
const surfaceValues = [...themes.matchAll(/--theme-surface:\s*([^;]+);/g)].map(match => match[1].trim())
if (surfaceValues.length < 9 || surfaceValues.some(value => !/^#[0-9a-f]{6}$/i.test(value))) {
  fail('Every theme used by the workbook must expose an opaque hexadecimal --theme-surface.')
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!/\| UX-32 \|[^\n]+\| 已完成 \|/.test(audit)) fail('UX-32 must retain its accepted installed-build status.')

console.log('Workbook workspace contract passed: progressive tools, compact formula controls, responsive reachability, and opaque frozen grid surfaces.')
