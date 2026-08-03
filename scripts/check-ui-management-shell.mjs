import fs from 'node:fs'

const failures = []
const read = filePath => fs.readFileSync(filePath, 'utf8')
const requireTokens = (filePath, tokens) => {
  const source = read(filePath)
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${filePath} is missing management shell contract token: ${token}`)
  }
}

requireTokens('src/styles/tokens.scss', [
  '--workspace-management-header-height',
  '--workspace-page-max-width',
  '--workspace-page-narrow-width',
  '--workspace-page-gutter',
  '--workspace-floating-gutter',
  '--workspace-inspector-width',
])

for (const filePath of [
  'src/views/WorkspaceHome.vue',
  'src/views/SettingsView.vue',
  'src/views/ReleaseCapabilitiesView.vue',
]) {
  requireTokens(filePath, [
    '<WorkspaceManagementHeader',
    '<WorkspaceManagementContent',
    "router.push({ name: 'LibraryMode' })",
  ])
  if (read(filePath).includes('router.back()')) {
    failures.push(`${filePath} must return explicitly to LibraryMode instead of browser history`)
  }
}

requireTokens('src/router/index.ts', ["path: '/'", "redirect: '/library'"])

requireTokens('src/components/GraphView.vue', [
  '<WorkspaceManagementHeader class="graph-header"',
  '<WorkspaceSegmentedControl class="view-switch"',
  '<WorkspaceStatusBar class="graph-stats"',
  "router.push({ name: 'LibraryMode' })",
  'width: var(--workspace-inspector-width)',
])
requireTokens('src/components/GraphHealthPanel.vue', [
  'width: min(var(--workspace-inspector-width)',
  'top: calc(var(--workspace-management-header-height)',
])

const graphSource = read('src/components/GraphView.vue')
if (graphSource.includes("router.push('/library')") || graphSource.includes('$router')) {
  failures.push('src/components/GraphView.vue must use the named LibraryMode route for all library returns')
}

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI management shell contract passed: management pages and the immersive graph share navigation, controls, status, and inspector dimensions.')
