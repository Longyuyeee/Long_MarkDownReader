import fs from 'node:fs'
import { hasEa5cRequirementAcceptance } from './lib/ea5c-requirement-acceptance.mjs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} token missing: ${token}`)
  }
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
const requiredColors = ['surface', 'text', 'keyword', 'string', 'number', 'comment', 'function', 'variable', 'operator', 'cursor']
const blocks = [...themes.matchAll(/((?:body\[data-theme="[^"]+"\](?:,\s*)?)+)\s*\{([^{}]*--markdown-code-surface:[^{}]*)\}/g)]
for (const block of blocks) {
  const names = [...block[1].matchAll(/data-theme="([^"]+)"/g)].map(match => match[1])
  const colors = Object.fromEntries([...block[2].matchAll(/--markdown-code-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]))
  for (const token of requiredColors) if (!colors[token]) fail(`Markdown code palette is missing ${token}: ${names.join(', ')}`)
  if (!block[2].includes('--markdown-code-selection: rgba(')) fail(`Markdown selection token is missing: ${names.join(', ')}`)
  for (const token of requiredColors.filter(token => !['surface', 'cursor'].includes(token))) {
    const ratio = contrast(colors[token], colors.surface)
    if (ratio < 4.5) fail(`${names.join(', ')} ${token} contrast is ${ratio.toFixed(2)}:1`)
  }
  if (contrast(colors.cursor, colors.surface) < 3) fail(`${names.join(', ')} cursor contrast is below 3:1`)
  names.forEach(name => coveredThemes.add(name))
}

const expectedThemes = ['white', 'green', 'blue', 'pink', 'cream', 'purple', 'amber', 'dark', 'contrast']
for (const theme of expectedThemes) if (!coveredThemes.has(theme)) fail(`Markdown code palette does not cover ${theme}`)

const contentStyles = read('src/styles/vditor-content-themes.scss')
requireTokens(contentStyles, 'Vditor code rendering', [
  'caret-color: var(--markdown-code-cursor) !important',
  'background: var(--markdown-code-selection)',
  'background: var(--markdown-code-surface) !important',
  '.hljs-keyword',
  '.hljs-string',
  '.hljs-number',
  '.hljs-comment',
  '.hljs-title.function',
  '.hljs-variable.language_',
])

const resolver = read('src/config/markdownCodeTheme.ts')
requireTokens(resolver, 'Markdown appearance resolver', [
  'LIGHT_CODE_THEMES',
  'DARK_CODE_THEMES',
  'CONTRAST_CODE_THEMES',
  'resolveMarkdownEditorAppearance',
])
for (const path of ['src/views/LibraryMode.vue', 'src/views/TempMode.vue', 'src/composables/useVditorTheme.ts']) {
  if (!read(path).includes('resolveMarkdownEditorAppearance')) fail(`${path} bypasses the Markdown appearance resolver`)
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!hasEa5cRequirementAcceptance('UX-20', audit)) fail('UX-20 is missing its EA-5C accepted evidence boundary.')

console.log('Markdown code palettes cover 9 themes; syntax text meets 4.5:1 and cursors meet 3:1 contrast.')
