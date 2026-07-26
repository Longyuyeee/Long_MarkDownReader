import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [graphCommand, tauriLib, badge, workspace, library, graphView] = await Promise.all([
  read('src-tauri/src/commands/graph.rs'),
  read('src-tauri/src/lib.rs'),
  read('src/components/RelationSummaryBadge.vue'),
  read('src/views/WorkspaceHome.vue'),
  read('src/views/LibraryMode.vue'),
  read('src/components/GraphView.vue'),
])

const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}

requireText(graphCommand, 'MAX_RELATION_SUMMARY_PATHS', 'G8 relation summaries must enforce a bounded request')
requireText(graphCommand, 'GraphRelationSummary', 'G8 must expose a typed relation summary')
requireText(graphCommand, 'incoming_count', 'G8 summaries must distinguish incoming relations')
requireText(graphCommand, 'outgoing_count', 'G8 summaries must distinguish outgoing relations')
requireText(graphCommand, 'related_count', 'G8 summaries must distinguish undirected relations')
requireText(graphCommand, 'relation_types', 'G8 summaries must expose relation types')
requireText(graphCommand, 'relation_summary_distinguishes_direction_types_and_isolation', 'G8 summary semantics must have Rust regression coverage')
requireText(tauriLib, 'summarize_graph_relations', 'G8 summary command must be registered with Tauri')
requireText(badge, '孤立风险', 'G8 summary UI must make isolation visible')
requireText(badge, "emit('open')", 'G8 summary UI must provide graph navigation')
requireText(workspace, "'summarize_graph_relations'", 'default workspace must load relation summaries')
requireText(workspace, '<RelationSummaryBadge', 'recent and starred workspace files must show relation summaries')
requireText(workspace, 'pathIdentity', 'workspace relation summaries must deduplicate equivalent Windows paths')
requireText(library, "'summarize_graph_relations'", 'library context must load relation summaries')
requireText(library, 'activeRelationSummary', 'the current library file must expose a relation summary')
requireText(library, 'relationSummary(result.path)', 'knowledge search results must expose relation summaries')
requireText(workspace, "query: { root: summary.nodeId }", 'workspace summaries must open a centered graph')
requireText(library, "query: { root: summary.nodeId }", 'library summaries must open a centered graph')
requireText(graphView, 'route.query.root', 'the graph workspace must consume centered navigation')
requireText(graphView, 'displayWorkspacePath', 'the graph workspace must not expose Windows internal path prefixes')
requireText(graphView, 'desiredLinkDistance', 'the graph layout must preserve a readable linked-node distance')

if (failures.length) {
  console.error(`Graph product contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Graph product contract check passed: bounded summaries, workspace/current/search visibility, and centered navigation.')
}
