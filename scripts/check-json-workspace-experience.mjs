import fs from 'node:fs'
import { hasEa5cRequirementAcceptance } from './lib/ea5c-requirement-acceptance.mjs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const view = read('src/views/JsonEditorView.vue')
requireTokens(view, 'JSON path guidance', [
  '字段路径与快速定位',
  '按字段名、路径或值查找内容',
  '$.items[0].name',
  '@click="showSourceRange(entry)"',
  '字段路径已复制：${pathSummary}',
  'path.length > 80',
  '修复 JSON 语法后，这里会列出可定位的字段路径',
  '先展示前 200 项，输入关键词可筛选全部已分析路径',
])
requireTokens(view, 'JSON tree virtualization', [
  'const treeIndex = computed(() =>',
  'const children = new Map<number, JsonPathEntry[]>()',
  'const expandedTreePaths = computed(() =>',
  'if (collapsedTreeNodes.value.has(entry.start)) continue',
  'const treeWindow = computed(() =>',
  'TREE_ROW_HEIGHT',
  'TREE_OVERSCAN_ROWS',
  ':style="{ height: `${treeVirtualHeight}px` }"',
  ':style="{ transform: `translateY(${treeWindowOffset}px)` }"',
  '@scroll.passive="handleTreeScroll"',
  'LARGE_TREE_AUTO_COLLAPSE_NODES',
])
requireTokens(view, 'JSON visual hierarchy', [
  "useResponsiveInspector(780)",
  "'inspector-hidden': !inspectorVisible",
  '隐藏结构与诊断',
  '收起编辑工具',
  'advanced-editor-actions',
  '.path-help',
  '.tree-row[data-kind="string"]',
  '.metric-grid > div:nth-child(2)',
])
if (view.includes('MAX_TREE_RENDER_NODES')) fail('JSON tree still uses the old fixed 2,000-row render cap.')
if (view.includes('当前层级仅渲染前 2,000 个可见节点')) fail('JSON tree still exposes the old truncation behavior.')

const backend = read('src-tauri/src/formats/json.rs')
requireTokens(backend, 'Rust JSON analysis budget', [
  'const MAX_JSON_SOURCE_BYTES: usize = 16 * 1024 * 1024;',
  'const MAX_JSON_NODES: usize = 200_000;',
  'const MAX_JSON_PATH_ENTRIES: usize = 20_000;',
  'pub fn analyze_json_source(content: &str, jsonc: bool)',
])
if (!view.includes("invoke<JsonSourceAnalysis>('analyze_json_source'")) fail('JSON analysis no longer runs through the Rust command boundary.')

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
for (const id of ['UX-25', 'UX-26', 'UX-28']) {
  if (!hasEa5cRequirementAcceptance(id, audit)) fail(`${id} is missing its EA-5C accepted evidence boundary.`)
}

console.log('JSON workspace contract passed: guided paths, collapsible diagnostics, indexed expansion, and virtual tree rows.')
