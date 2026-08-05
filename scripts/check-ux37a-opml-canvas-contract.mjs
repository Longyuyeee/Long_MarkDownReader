import fs from 'node:fs'

const source = fs.readFileSync('src/views/MindMapView.vue', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-37A OPML canvas rejected: ${message}`) }

for (const token of [
  '<option value="tree">树状</option>',
  '<option value="organization">组织</option>',
  '<option value="radial">放射</option>',
  '<option value="timeline">时间线</option>',
  '<option value="professional">专业</option>',
  '<option value="colorful">多彩</option>',
  '<option value="focus">专注</option>',
  '@pointerdown="startCanvasPointer"',
  '@wheel.prevent="onMapWheel"',
  'startNodePointer($event, item.node.id)',
  'const moveSelectionBox',
  'const moveSelected',
  'selectedIds.value',
  'beginNodeRename',
  'const undo =',
  'const redo =',
  '仅点击保存时写入',
  '请先点击保存，再将当前版本投影到 Canvas',
]) if (!source.includes(token)) fail(`interaction contract missing: ${token}`)

for (const forbidden of [
  'const scheduleSave',
  'setTimeout(() => { void save() }, 1500)',
  'onBeforeRouteLeave(async () => !dirty.value || await save())',
  'if (dirty.value && !(await save()))',
]) if (source.includes(forbidden)) fail(`implicit write path returned: ${forbidden}`)

for (const token of [
  "title: '思维导图还有未保存修改'",
  "content: '离开后会丢失当前草稿，源文件不会被修改。'",
  'onBeforeRouteLeave(() => mayLeave())',
  'onBeforeRouteUpdate((to, from) => to.query.path === from.query.path || mayLeave())',
  "document.value.metadata._longeditLayout = layoutMode.value",
  "node.attributes._longeditX",
  "node.attributes._longeditY",
]) if (!source.includes(token)) fail(`draft or persistence contract missing: ${token}`)

if (!packageJson.scripts?.['check:ux37a-opml-canvas']) fail('package command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux37a-opml-canvas-contract')) fail('checker is not in the development audit chain')

console.log('UX-37A OPML canvas contract passed: four layouts, three themes, pan/zoom, box and multi-selection, free dragging, keyboard movement, direct rename, undo/redo, and explicit-save-only behavior are present.')
