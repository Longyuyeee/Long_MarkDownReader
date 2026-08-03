import fs from 'node:fs'

const failures = []
const read = filePath => fs.readFileSync(filePath, 'utf8')
const requireTokens = (filePath, tokens) => {
  const source = read(filePath)
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${filePath} is missing state contract token: ${token}`)
  }
}

const stateComponent = 'src/components/workspace/WorkspaceStateNotice.vue'
if (!fs.existsSync(stateComponent)) failures.push(`${stateComponent} is missing`)
else {
  requireTokens(stateComponent, [
    "'loading'", "'empty'", "'error'", "'readonly'", "'limited'", "'external'", "'saved'",
    "role = computed", "aria-live", "data-state", "tone-danger", "tone-warning", "tone-success",
  ])
}

requireTokens('src/components/workspace/WorkspaceEmptyState.vue', ['data-state="empty"', 'role="status"'])
requireTokens('src/views/WorkbookView.vue', [
  'WorkspaceStateNotice', 'kind="loading"', 'kind="error"', 'kind="readonly"', 'kind="external"',
])
requireTokens('src/views/PdfView.vue', [
  'WorkspaceStateNotice', 'kind="loading"', 'kind="error"', "'saved'", "'limited'",
])
requireTokens('src/views/DiagramStudio.vue', [
  'WorkspaceStateNotice', 'kind="loading"', 'kind="error"', 'kind="limited"',
])
requireTokens('src/views/WorkspaceHome.vue', [
  'WorkspaceStateNotice', 'kind="error"', '<WorkspaceEmptyState',
])

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI state semantics contract passed: seven states are represented across the shared workspace primitives.')
