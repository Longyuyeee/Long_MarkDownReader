import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(`UX-38E diagram history contract rejected: ${message}`); process.exit(1) }
const drawio = read('src/views/DrawioEditorView.vue')
const mermaid = read('src/views/DiagramStudio.vue')

for (const token of [
  'const undoStack = ref<string[]>([])',
  'const redoStack = ref<string[]>([])',
  'const undo = async () =>',
  'const redo = async () =>',
  'reloadFromDisk',
  'confirmAppAction(dialog',
  "window.addEventListener('beforeunload', beforeUnload)",
  'container-type: inline-size',
  '@container (max-width: 760px)',
]) if (!drawio.includes(token)) fail(`Draw.io token missing: ${token}`)
if (/window\.confirm\s*\(/.test(drawio)) fail('Draw.io native confirm returned')

for (const token of [
  'class="history-button" title="撤销"',
  'class="history-button" title="重做"',
  'const undoStack = ref<string[]>([])',
  'const redoStack = ref<string[]>([])',
  'const replaceSource =',
  'const undo = () =>',
  'const redo = () =>',
  "event.key.toLowerCase() === 'y'",
  'container-type: inline-size',
  '@container (max-width: 900px)',
]) if (!mermaid.includes(token)) fail(`Mermaid token missing: ${token}`)

const registry = JSON.parse(read('shared/file-formats.json'))
for (const [id, level] of [['drawio', 'basic-edit'], ['diagram', 'complete-edit']]) {
  const format = registry.formats.find(item => item.id === id)
  if (format?.userCapability?.level !== level || format.userCapability.saveMode !== 'overwrite') fail(`${id} capability boundary drift`)
}
const packageJson = JSON.parse(read('package.json'))
if (!packageJson.scripts?.['check:ux38e-diagram-history']) fail('package checker command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38e-diagram-history')) fail('checker is outside the development audit chain')
console.log('UX-38E diagram history contract passed: Draw.io and Mermaid expose guarded, explicit-save document history with container-responsive layouts.')
