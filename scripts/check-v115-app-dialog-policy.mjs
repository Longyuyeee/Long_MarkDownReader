import fs from 'node:fs'
import path from 'node:path'

const fail = message => { throw new Error(`v1.0.15 app-dialog policy rejected: ${message}`) }
const collect = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name)
  if (entry.isDirectory()) return collect(target)
  return /\.(?:vue|ts)$/.test(entry.name) ? [target] : []
})
const sources = collect('src').map(file => ({ file, source: fs.readFileSync(file, 'utf8') }))
const nativeConfirmOrAlert = sources.filter(({ source }) => /window\.(?:confirm|alert)\s*\(/.test(source))
if (nativeConfirmOrAlert.length) fail(`native confirm/alert remains in: ${nativeConfirmOrAlert.map(item => item.file).join(', ')}`)

const promptCount = sources.reduce((count, { source }) => count + (source.match(/window\.prompt\s*\(/g)?.length || 0), 0)
if (promptCount > 54) fail(`native prompt inventory regressed: ${promptCount} > 54`)

const helper = fs.readFileSync('src/services/appDialog.ts', 'utf8')
for (const token of [
  'export const confirmAppAction',
  'positiveButtonProps',
  'negativeButtonProps',
  'onPositiveClick',
  'onNegativeClick',
  'onClose',
  'onEsc',
  'onMaskClick',
]) if (!helper.includes(token)) fail(`application dialog token missing: ${token}`)

for (const file of [
  'src/components/WorkspaceTabs.vue',
  'src/views/TextEditorView.vue',
  'src/views/JsonEditorView.vue',
  'src/views/YamlEditorView.vue',
  'src/views/XmlEditorView.vue',
  'src/views/TomlEditorView.vue',
  'src/views/DrawioEditorView.vue',
  'src/views/DiagramStudio.vue',
  'src/views/CanvasView.vue',
  'src/views/PdfView.vue',
  'src/views/WorkbookView.vue',
  'src/views/TempMode.vue',
]) if (!fs.readFileSync(file, 'utf8').includes('confirmAppAction')) fail(`application confirmation missing: ${file}`)

console.log(`v1.0.15 app-dialog policy passed: native confirm/alert count is 0; ${promptCount} parameter prompts remain in the form-migration inventory.`)
