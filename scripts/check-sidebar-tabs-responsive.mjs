import fs from 'node:fs'

const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

for (const token of [
  'data-layout="icons"',
  'grid-template-columns: repeat(7, minmax(0, 1fr))',
  'clip-path: inset(50%)',
  '@media (prefers-reduced-motion: reduce)',
]) requireText(library, token, `sidebar responsiveness marker missing: ${token}`)

if (/\.icon-tab\.active\s+\.icon-tab-text/.test(library)) failures.push('only the active tab must not gain a text label')
if (/\.icon-tab\.active\s*\{[^}]*width\s*:/s.test(library)) failures.push('active tabs must not change navigation track width')
// The user's R3 correction requests one row of icons; accessible labels and
// explanations remain, and all seven functions must stay reachable.
for (const label of ['文件', '大纲', '最近', '历史', '智能集合', '关系', '标签']) requireText(library, `label: '${label}'`, `sidebar label missing: ${label}`)
for (const description of ['智能集合：保存并重复使用文件搜索的关键词、目录、格式、标签与时间条件', '标签：管理 Markdown 正文中的 #标签名，仅适用于 Markdown', '关系：查看当前 Markdown 的链出与反向链接']) {
  requireText(library, description, `sidebar purpose missing: ${description}`)
}
if (library.includes("label: '保存'") || library.includes("label: '引用'") || library.includes("label: '搜索'")) failures.push('misleading legacy sidebar labels remain visible')

if (failures.length) {
  console.error(`Sidebar tab responsiveness check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Sidebar tabs passed: seven icons keep one navigation row, accessible names, purpose explanations and reduced motion.')
