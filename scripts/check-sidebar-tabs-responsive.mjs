import fs from 'node:fs'

const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const relatedSurfaces = [
  library,
  fs.readFileSync('src/views/WorkspaceHome.vue', 'utf8'),
  fs.readFileSync('src/components/GraphView.vue', 'utf8'),
  fs.readFileSync('src/components/FileRelationContext.vue', 'utf8'),
].join('\n')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

for (const token of [
  ':class="{ compact: sidebarTabsCompact }"',
  ":data-layout=\"sidebarTabsCompact ? 'icons' : 'labels'\"",
  'const sidebarTabsCompact = computed(() => sidebarWidth.value < 460)',
  'grid-template-columns: repeat(7, minmax(0, 1fr))',
  '.sidebar-tabs-header.compact .icon-tab-text',
  '@media (prefers-reduced-motion: reduce)',
]) requireText(library, token, `sidebar responsiveness marker missing: ${token}`)

if (/\.icon-tab\.active\s+\.icon-tab-text/.test(library)) failures.push('only the active tab must not gain a text label')
if (/\.icon-tab\.active\s*\{[^}]*width\s*:/s.test(library)) failures.push('active tabs must not change navigation track width')
if (relatedSurfaces.includes('智能集合')) failures.push('the internal smart-collection term remains visible')
for (const label of ['文件', '保存', '目录', '标签', '引用', '最近', '备份']) requireText(library, `label: '${label}'`, `sidebar label missing: ${label}`)

if (failures.length) {
  console.error(`Sidebar tab responsiveness check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Sidebar tabs passed: saved views use plain language, wide layouts show stable labels, compact layouts show icons, and motion can be reduced.')
