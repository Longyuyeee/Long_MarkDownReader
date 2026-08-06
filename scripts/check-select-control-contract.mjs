import fs from 'node:fs'
import path from 'node:path'

const fail = message => {
  console.error(message)
  process.exit(1)
}
const read = file => fs.readFileSync(file, 'utf8')
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}
const collectVueFiles = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name)
  return entry.isDirectory() ? collectVueFiles(target) : entry.name.endsWith('.vue') ? [target] : []
})

const vueFiles = collectVueFiles('src')
const nativeSelectFiles = vueFiles.filter(file => /<select\b/.test(read(file)))
const nativeSelectCount = nativeSelectFiles.reduce((total, file) => total + (read(file).match(/<select\b/g) || []).length, 0)
if (nativeSelectCount < 50 || nativeSelectFiles.length < 12) fail(`Native select coverage unexpectedly shrank: ${nativeSelectCount} controls in ${nativeSelectFiles.length} files.`)

const tokens = read('src/styles/tokens.scss')
requireTokens(tokens, 'Native select contract', [
  'select:not([multiple]):not([size])',
  'appearance: none',
  '-webkit-appearance: none',
  'linear-gradient(45deg, transparent 50%, var(--theme-text-secondary) 50%)',
  'select:not([multiple]):not([size]):focus-visible',
  'select:not([multiple]):not([size]):hover:not(:disabled)',
  'select:disabled',
  'select option,',
  'background-color: var(--theme-surface)',
])

const app = read('src/App.vue')
requireTokens(app, 'Naive select and dropdown theme', [
  'Select: {',
  'InternalSelection: {',
  'InternalSelectMenu: {',
  'optionColorPending:',
  'optionColorActive:',
  'Dropdown: {',
  'optionColorHover:',
  'dividerColor:',
])

const themes = read('src/styles/themes.scss')
if (!/body\[data-theme="dark"\]\s*\{\s*color-scheme: dark;/.test(themes)) fail('Dark theme must request dark native popup controls.')
if (!/body\[data-theme="contrast"\]\s*\{\s*color-scheme: dark;/.test(themes)) fail('High-contrast theme must request dark native popup controls.')

console.log(`Select control contract passed: ${nativeSelectCount} native selects across ${nativeSelectFiles.length} files and Naive popup menus share themed interaction states.`)
