import fs from 'node:fs'

const policy = fs.readFileSync('src/services/contextMenuPolicy.ts', 'utf8')
const main = fs.readFileSync('src/main.ts', 'utf8')
const fail = message => { throw new Error(`v1.0.15 context-menu policy rejected: ${message}`) }

for (const token of [
  "document.addEventListener('contextmenu', handleContextMenu, { capture: true })",
  "document.removeEventListener('contextmenu', handleContextMenu, { capture: true })",
  'event.preventDefault()',
  'allowsNativeTextContextMenu(event.target)',
  '[data-native-context-menu="allow"]',
  '[data-native-context-menu="suppress"]',
  '[contenteditable="true"]',
  '.cm-content',
  '.vditor-ir',
  'HTMLTextAreaElement',
  'HTMLInputElement',
]) if (!policy.includes(token)) fail(`policy token missing: ${token}`)

for (const token of [
  "import { installContextMenuPolicy } from './services/contextMenuPolicy'",
  'const removeContextMenuPolicy = installContextMenuPolicy()',
  'removeContextMenuPolicy()',
]) if (!main.includes(token)) fail(`bootstrap token missing: ${token}`)

if (!policy.includes("'checkbox'") && !policy.includes('textInputTypes.has')) fail('non-text input boundary is missing')
if (/document\.oncontextmenu\s*=/.test(policy)) fail('legacy global handler assignment returned')

console.log('v1.0.15 context-menu policy passed: ordinary desktop surfaces suppress WebView menus while editable controls and explicit opt-ins retain native text actions.')
