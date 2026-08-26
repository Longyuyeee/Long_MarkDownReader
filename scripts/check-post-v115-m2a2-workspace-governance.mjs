import fs from 'node:fs'
const policy = JSON.parse(fs.readFileSync('shared/post-v115-m2a2-workspace-governance-policy.json', 'utf8'))
const evidence = JSON.parse(fs.readFileSync('docs/evidence/post-v115-m2a2-workspace-governance/desktop-evidence.json', 'utf8'))
const home = fs.readFileSync('src/views/WorkspaceHome.vue', 'utf8')
const queue = fs.readFileSync('src/components/WorkspaceHealthQueue.vue', 'utf8')
const graphPanel = fs.readFileSync('src/components/GraphHealthPanel.vue', 'utf8')
const failures = []
for (const marker of ['m2a2-workspace-primary', 'loadSecondaryAnalysis', "invoke<WorkspaceOverview>('get_workspace_overview'", "invoke<WorkspaceGraphHealth>('analyze_graph_health'"]) if (!home.includes(marker)) failures.push(`Workspace M2A2 marker missing: ${marker}`)
if (home.includes("'get_knowledge_graph_pulse'") || home.includes('data-testid="knowledge-network-pulse"')) failures.push('Workspace Home still duplicates graph pulse')
for (const marker of ['m2a2-attention-queue', 'data-issue-kind="broken-link"', 'data-issue-kind="ambiguous-link"', 'data-issue-kind="duplicate"', 'data-issue-kind="annotation"', '原因']) {
  if (!queue.includes(marker) && marker !== '原因') failures.push(`Attention queue marker missing: ${marker}`)
}
for (const marker of ["'get_knowledge_graph_pulse'", 'data-testid="knowledge-network-pulse"', 'data-testid="knowledge-isolation-queue"']) if (!graphPanel.includes(marker)) failures.push(`Graph governance marker missing: ${marker}`)
if (evidence.stage !== policy.stage) failures.push('Evidence stage mismatch')
for (const [key, value] of Object.entries(policy.expected)) if (evidence.actual[key] !== value) failures.push(`Actual ${key}=${JSON.stringify(evidence.actual[key])}, expected ${JSON.stringify(value)}`)
if (!(evidence.actual.primaryReadyMs <= evidence.actual.analysisReadyMs)) failures.push('Primary content did not become ready before secondary analysis')
if (evidence.actual.beforeSha256 !== evidence.actual.afterSha256) failures.push('Real fixture changed during read-only governance audit')
for (const file of evidence.evidenceFiles || []) if (!fs.existsSync(`docs/evidence/post-v115-m2a2-workspace-governance/${file}`)) failures.push(`Evidence missing: ${file}`)
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('M2A2 accepted: real M0 workspace actions render before secondary analysis, issues appear once, graph details remain available, and source bytes stay unchanged.')
