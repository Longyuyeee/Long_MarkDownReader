import fs from 'node:fs'

const source = fs.readFileSync('src/views/CanvasView.vue', 'utf8')
const fail = message => { console.error(`UX-38E Canvas explicit-save contract rejected: ${message}`); process.exit(1) }
for (const token of [
  "!['dirty', 'error'].includes(saveState.value)",
  "window.confirm('Canvas 还有未保存修改",
  "window.addEventListener('beforeunload', beforeUnload)",
  'onBeforeRouteLeave(() => mayLeave())',
  "command && event.key.toLowerCase() === 's'",
]) {
  if (!source.includes(token)) fail(`required token missing: ${token}`)
}
for (const forbidden of ['setTimeout(saveCanvas', 'onBeforeRouteLeave(async () =>', 'await saveCanvas(); return true']) {
  if (source.includes(forbidden)) fail(`automatic write path remains: ${forbidden}`)
}
const registry = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const canvas = registry.formats.find(format => format.id === 'canvas')
if (canvas?.userCapability?.saveMode !== 'overwrite' || canvas.capabilities?.edit !== 'supported') fail('Canvas registry boundary drift')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (!packageJson.scripts?.['check:ux38e-canvas-explicit-save']) fail('package checker command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38e-canvas-explicit-save')) fail('checker is outside the development audit chain')
console.log('UX-38E Canvas explicit-save contract passed: edits stay in memory until Save or Ctrl+S, and unsaved navigation is guarded.')
