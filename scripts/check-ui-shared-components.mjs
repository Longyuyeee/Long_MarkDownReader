import fs from 'node:fs'

const failures = []
const read = filePath => fs.readFileSync(filePath, 'utf8')
const requireTokens = (filePath, tokens) => {
  const source = read(filePath)
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${filePath} is missing shared UI primitive: ${token}`)
  }
}

const componentContracts = {
  'src/components/workspace/WorkspaceToolbar.vue': ['workspace-toolbar-shell', '--workspace-toolbar-height'],
  'src/components/workspace/WorkspaceFileIdentity.vue': ['workspace-file-identity', '<slot />'],
  'src/components/workspace/WorkspaceStatusBar.vue': ['workspace-status-bar', '--workspace-status-height'],
  'src/components/workspace/WorkspaceField.vue': ['workspace-field', '<label'],
  'src/components/workspace/WorkspaceSegmentedControl.vue': ['workspace-segmented-control', 'role="group"'],
  'src/components/workspace/WorkspaceEmptyState.vue': ['workspace-empty-state', '<component :is="as"'],
  'src/components/workspace/WorkspaceStateNotice.vue': ['workspace-state-notice', 'data-state', 'aria-live'],
}

for (const [filePath, tokens] of Object.entries(componentContracts)) {
  if (!fs.existsSync(filePath)) failures.push(`shared UI primitive is missing: ${filePath}`)
  else requireTokens(filePath, tokens)
}

requireTokens('src/views/PdfView.vue', ['<WorkspaceToolbar class="pdf-toolbar">', '<WorkspaceFileIdentity class="toolbar-leading">'])
requireTokens('src/views/WorkbookView.vue', ['<WorkspaceToolbar class="workbook-toolbar">', '<WorkspaceFileIdentity class="workbook-title">', '<WorkspaceSegmentedControl', '<WorkspaceStatusBar'])
requireTokens('src/views/DiagramStudio.vue', ['<WorkspaceToolbar class="studio-toolbar">', '<WorkspaceFileIdentity class="studio-title">', '<WorkspaceField>', '<WorkspaceStatusBar'])
requireTokens('src/views/WorkspaceHome.vue', ['<WorkspaceToolbar class="workspace-header">', '<WorkspaceEmptyState'])

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('UI shared component contract passed: seven primitives are used across four high-risk workspaces.')
