import fs from 'node:fs'

const failures = []
const read = filePath => fs.readFileSync(filePath, 'utf8')
const requireTokens = (filePath, tokens) => {
  const source = read(filePath)
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${filePath} is missing color contract token: ${token}`)
  }
  return source
}

requireTokens('src/styles/tokens.scss', [
  '--workspace-border-color',
  '--workspace-control-bg',
  '--workspace-surface-raised',
  '--workspace-shadow',
  '--workspace-on-accent',
  '--status-success',
  '--status-warning',
  '--status-danger',
  '--status-info',
])
requireTokens('src/styles/themes.scss', [
  'body[data-theme="dark"]',
  'body[data-theme="contrast"]',
  '--workspace-on-accent',
  '--status-danger',
])

const workspaceViews = [
  'src/views/WorkbookView.vue',
  'src/views/PdfView.vue',
  'src/views/WorkspaceHome.vue',
  'src/views/DiagramStudio.vue',
]
const forbiddenChrome = [
  ['black alpha border', /(?:border|border-top|border-right|border-bottom|border-left|border-color):[^;\n]*rgba\(0\s*,\s*0\s*,\s*0/gi],
  ['black alpha background', /background:\s*rgba\(0\s*,\s*0\s*,\s*0/gi],
  ['white alpha background', /background:\s*rgba\(255\s*,\s*255\s*,\s*255/gi],
  ['hard-coded white foreground', /color:\s*#(?:fff|ffffff)\b/gi],
  ['black alpha shadow', /box-shadow:[^;\n]*rgba\(0\s*,\s*0\s*,\s*0/gi],
]

for (const filePath of workspaceViews) {
  const source = read(filePath)
  for (const [label, pattern] of forbiddenChrome) {
    const matches = source.match(pattern) ?? []
    if (matches.length) failures.push(`${filePath} contains ${matches.length} ${label} declaration(s)`)
  }
}

requireTokens('src/views/WorkbookView.vue', ['var(--workspace-border-color)', 'var(--workspace-control-bg)'])
requireTokens('src/views/PdfView.vue', ['var(--workspace-surface-raised)', 'var(--status-danger)'])
requireTokens('src/views/WorkspaceHome.vue', ['var(--status-warning)', 'var(--status-warning-bg)'])
requireTokens('src/views/DiagramStudio.vue', ['var(--status-success)', 'var(--status-danger-bg)'])

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI color semantics contract passed: workspace chrome uses theme-aware surface and status tokens.')
