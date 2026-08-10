import fs from 'node:fs'
import { hasEa5cRequirementAcceptance } from './lib/ea5c-requirement-acceptance.mjs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}
const forbidTokens = (source, label, tokens) => {
  for (const token of tokens) if (source.includes(token)) fail(`${label} forbidden token found: ${token}`)
}

const registry = JSON.parse(read('shared/file-formats.json'))
const release = JSON.parse(read('shared/release-capability-matrix.json'))
const editor = read('src/views/TextEditorView.vue')
const settings = read('src/views/SettingsView.vue')
const completion = read('src/utils/codeEditingSupport.ts')
const preview = read('src/utils/safeHtmlPreview.ts')
const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
const packageJson = JSON.parse(read('package.json'))

for (const id of ['javascript', 'typescript', 'python', 'rust', 'go', 'jvm-code', 'c-family', 'shell', 'sql', 'web-source']) {
  const format = registry.formats.find(candidate => candidate.id === id)
  if (!format || format.routeName !== 'TextEditor' || format.userCapability.level !== 'basic-edit'
    || format.userCapability.saveMode !== 'overwrite' || !format.userCapability.description.includes('只有点击保存才写入')) {
    fail(`${id} must retain explicit-save professional source editing.`)
  }
}
if (release.formats.find(format => format.id === 'web-source')?.profile !== 'lightweight-source') fail('web-source release profile mismatch.')
if (!packageJson.dependencies['@codemirror/autocomplete'] || !packageJson.dependencies['@codemirror/lint']) fail('CodeMirror completion and lint must be direct dependencies.')

requireTokens(editor, 'Text editor', [
  'basicSetup', 'StreamLanguage.define', 'runUndo', 'runRedo', 'autocompletion({ override:',
  'lintGutter()', "viewMode = ref<'source' | 'preview'>('source')", '安全网页预览',
  'sandbox=""', 'referrerpolicy="no-referrer"', ':srcdoc="safePreviewHtml"',
  "'write_text_document'", 'expectedSignature: signature.value',
])
forbidTokens(editor, 'Text editor', ['scheduleAutoSave', 'save(true)', 'textAutoSaveEnabled'])
forbidTokens(settings, 'Settings', ['TXT 自动保存'])
requireTokens(completion, 'Code assistance', [
  'MAX_COMPLETION_SCAN_CHARS', 'MAX_DIAGNOSTIC_SCAN_CHARS', 'MAX_DOCUMENT_COMPLETIONS',
  'HTML_TAGS', 'documentWords', 'collectBasicSourceDiagnostics',
])
requireTokens(preview, 'Safe HTML preview', [
  'DOMParser', 'BLOCKED_ELEMENTS', "default-src 'none'", "script-src 'none'",
  "connect-src 'none'", "img-src data:", "form-action 'none'", "base-uri 'none'",
  "name.startsWith('on')", 'URL_ATTRIBUTES',
])
if (!hasEa5cRequirementAcceptance('UX-30', audit)) fail('UX-30 is missing its EA-5C accepted evidence boundary.')

console.log('Professional code editing, explicit save, and sandboxed HTML preview contract passed.')
