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

const channels = hex => [0, 2, 4].map(index => Number.parseInt(hex.slice(index + 1, index + 3), 16) / 255)
const luminance = hex => {
  const [red, green, blue] = channels(hex).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

const themes = read('src/styles/themes.scss')
const coveredThemes = new Set()
const syntaxColors = ['text', 'keyword', 'string', 'number', 'comment', 'function', 'variable', 'property', 'tag', 'attribute', 'type', 'constant', 'regexp', 'escape', 'meta', 'operator', 'punctuation', 'link', 'invalid']
const requiredColors = ['surface', 'panel', 'gutter', 'gutter-text', 'border', ...syntaxColors, 'cursor', 'accent']
const requiredEffects = ['active-line', 'selection', 'selection-match', 'search-match', 'search-selected', 'bracket-match', 'invalid-surface']
const blocks = [...themes.matchAll(/((?:body\[data-theme="[^"]+"\](?:,\s*)?)+)\s*\{([^{}]*--code-editor-surface:[^{}]*)\}/g)]

for (const block of blocks) {
  const names = [...block[1].matchAll(/data-theme="([^"]+)"/g)].map(match => match[1])
  const colors = Object.fromEntries([...block[2].matchAll(/--code-editor-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]))
  for (const token of requiredColors) if (!colors[token]) fail(`Code editor palette is missing ${token}: ${names.join(', ')}`)
  for (const token of requiredEffects) {
    if (!block[2].includes(`--code-editor-${token}: rgba(`)) fail(`Code editor effect is missing ${token}: ${names.join(', ')}`)
  }
  for (const token of syntaxColors) {
    const ratio = contrast(colors[token], colors.surface)
    if (ratio < 4.5) fail(`${names.join(', ')} ${token} contrast is ${ratio.toFixed(2)}:1`)
  }
  if (contrast(colors.cursor, colors.surface) < 3) fail(`${names.join(', ')} cursor contrast is below 3:1`)
  if (contrast(colors['gutter-text'], colors.gutter) < 4.5) fail(`${names.join(', ')} gutter text contrast is below 4.5:1`)
  names.forEach(name => coveredThemes.add(name))
}

const expectedThemes = ['white', 'green', 'blue', 'pink', 'cream', 'purple', 'amber', 'dark', 'contrast']
for (const theme of expectedThemes) if (!coveredThemes.has(theme)) fail(`Code editor palette does not cover ${theme}`)

const sharedTheme = read('src/config/codeMirrorTheme.ts')
requireTokens(sharedTheme, 'Shared CodeMirror theme', [
  'syntaxHighlighting(syntaxTheme)',
  'tags.tagName',
  'tags.attributeName',
  'tags.angleBracket',
  'tags.processingInstruction',
  'var(--code-editor-constant)',
  'var(--code-editor-regexp)',
  'var(--code-editor-escape)',
  "'.cm-cursor, .cm-dropCursor'",
  "'.cm-selectionBackground, ::selection'",
  "'.cm-selectionMatch'",
  "'.cm-searchMatch'",
  "'.cm-matchingBracket'",
  "'.cm-gutters'",
  "'.cm-panels'",
  "'.cm-tooltip'",
  "'.cm-tooltip-autocomplete > ul > li[aria-selected]'",
])

const workspaces = [
  'src/views/TextEditorView.vue',
  'src/views/JsonEditorView.vue',
  'src/views/YamlEditorView.vue',
  'src/views/XmlEditorView.vue',
  'src/views/TomlEditorView.vue',
  'src/views/LogViewerView.vue',
]
for (const path of workspaces) {
  const source = read(path)
  if (!source.includes("import { codeMirrorThemeExtensions } from '../config/codeMirrorTheme'")) fail(`${path} does not import the shared CodeMirror theme.`)
  if (!source.includes('...codeMirrorThemeExtensions')) fail(`${path} does not attach the shared CodeMirror theme.`)
  if (source.includes('EditorView.theme(')) fail(`${path} still owns a private CodeMirror theme.`)
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
for (const id of ['UX-24', 'UX-27']) {
  if (!hasEa5cRequirementAcceptance(id, audit)) fail(`${id} is missing its EA-5C accepted evidence boundary.`)
}

console.log('Six CodeMirror workspaces share one rich semantic theme; 9 palettes meet syntax, gutter, and cursor contrast contracts.')
