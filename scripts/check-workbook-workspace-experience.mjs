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
  'class="linked-data-trigger"',
  '透视表与数据连接',
  'linkedDataSummaryText',
  'summary.totalObjectCount',
  '当前仅查看',
  'LongEdit 不会自动刷新数据',
  '不会访问外部文件或网络地址',
])
if (view.includes('class="linked-data-toolbar"')) fail('Linked data summary restored a permanent workbook row.')
if (view.includes('title="高级数据对象审计"')) fail('Internal audit wording returned to the primary workbook UI.')

requireTokens(view, 'Workbook compact responsive shell', [
  'min-height: var(--workspace-toolbar-height)',
  '.sheet-tabs { min-height: 35px',
  '@media (max-width: 1180px)',
  '.workbook-actions .linked-data-trigger span { display: none; }',
  ':not(.linked-data-trigger)',
])

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
if (!/\| UX-32 \|[^\n]+\| 待复测 \|/.test(audit)) fail('UX-32 must remain pending installed-build retest.')

console.log('Workbook workspace contract passed: compact linked-data entry, responsive reachability, and opaque frozen grid surfaces.')
