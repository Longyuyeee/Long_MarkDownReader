import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [graphCommand, tauriLib, badge, contextPanel, contextCache, app, workspace, library, graphView] = await Promise.all([
  read('src-tauri/src/commands/graph.rs'),
  read('src-tauri/src/lib.rs'),
  read('src/components/RelationSummaryBadge.vue'),
  read('src/components/FileRelationContext.vue'),
  read('src/services/relationContextCache.ts'),
  read('src/App.vue'),
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
requireText(graphCommand, 'KnowledgeGraphPulse', 'G9 must expose a typed knowledge network pulse')
requireText(graphCommand, 'coverage_percent', 'G9 must expose connected-object coverage')
requireText(graphCommand, 'relation_type_counts', 'G9 must aggregate relation types deterministically')
requireText(graphCommand, 'top_nodes.truncate(6)', 'G9 top connected topics must remain bounded')
requireText(graphCommand, 'knowledge_graph_pulse_exposes_coverage_relation_types_and_top_nodes', 'G9 pulse semantics must have Rust regression coverage')
requireText(graphCommand, 'incoming_count', 'G8 summaries must distinguish incoming relations')
requireText(graphCommand, 'outgoing_count', 'G8 summaries must distinguish outgoing relations')
requireText(graphCommand, 'related_count', 'G8 summaries must distinguish undirected relations')
requireText(graphCommand, 'relation_types', 'G8 summaries must expose relation types')
requireText(graphCommand, 'relation_summary_distinguishes_direction_types_and_isolation', 'G8 summary semantics must have Rust regression coverage')
requireText(tauriLib, 'summarize_graph_relations', 'G8 summary command must be registered with Tauri')
requireText(tauriLib, 'get_knowledge_graph_pulse', 'G9 pulse command must be registered with Tauri')
requireText(badge, '孤立风险', 'G8 summary UI must make isolation visible')
requireText(badge, "emit('open')", 'G8 summary UI must provide graph navigation')
requireText(workspace, "'summarize_graph_relations'", 'default workspace must load relation summaries')
requireText(workspace, '<RelationSummaryBadge', 'recent and starred workspace files must show relation summaries')
requireText(workspace, '知识网络脉搏', 'default workspace must make the graph pulse visible')
requireText(workspace, "'get_knowledge_graph_pulse'", 'default workspace must load the graph pulse')
requireText(workspace, 'graphPulse.coveragePercent', 'default workspace must show graph coverage')
requireText(workspace, "query: { root: nodeId }", 'top connected topics must open a centered graph')
requireText(workspace, 'pathIdentity', 'workspace relation summaries must deduplicate equivalent Windows paths')
requireText(library, "'summarize_graph_relations'", 'library context must load relation summaries')
requireText(library, 'activeRelationSummary', 'the current library file must expose a relation summary')
requireText(library, 'relationSummary(result.path)', 'knowledge search results must expose relation summaries')
requireText(workspace, "query: { root: summary.nodeId }", 'workspace summaries must open a centered graph')
requireText(library, "query: { root: summary.nodeId }", 'library summaries must open a centered graph')
requireText(graphView, 'route.query.root', 'the graph workspace must consume centered navigation')
requireText(graphView, 'displayWorkspacePath', 'the graph workspace must not expose Windows internal path prefixes')
requireText(graphView, 'desiredLinkDistance', 'the graph layout must preserve a readable linked-node distance')
requireText(graphCommand, 'MAX_RELATION_CONTEXT_ITEMS', 'G8-2 relation context must remain bounded')
requireText(graphCommand, 'GraphRelationContext', 'G8-2 must expose a typed relation context')
requireText(graphCommand, 'GraphRelationEvidence', 'G8-2 must preserve source evidence')
requireText(graphCommand, '"planning"', 'G8-2 must distinguish planning hierarchy')
requireText(graphCommand, '"structure"', 'G8-2 must distinguish structural relations')
requireText(graphCommand, '"fact"', 'G8-2 must distinguish evidence-backed facts')
requireText(graphCommand, 'relation_context_explains_fact_structure_and_planning_relations', 'G8-2 relation semantics must have Rust regression coverage')
requireText(graphCommand, 'relation_context_returns_safe_unindexed_state_for_managed_formats', 'G8-2 must cover formats without extractors without inventing relations')
requireText(tauriLib, 'get_graph_relation_context', 'G8-2 context command must be registered with Tauri')
requireText(contextPanel, "'get_graph_relation_context'", 'G8-2 file context must consume the typed backend command')
requireText(contextPanel, 'relationClassLabel', 'G8-2 UI must explain relation classes')
requireText(contextPanel, 'relation.evidence[0].context', 'G8-2 UI must expose relation evidence')
requireText(contextPanel, '以当前文件为中心', 'G8-2 context must preserve centered graph navigation')
requireText(contextPanel, '尚未提取这种格式的关系', 'G8-2 must state unsupported extraction honestly')
requireText(app, '<FileRelationContext', 'G8-2 context must be mounted at the shared application workspace layer')
requireText(graphCommand, '"shares-tag"', 'G8-2B must expose same-tag peers without inventing file links')
requireText(graphCommand, 'relation_context_adds_case_insensitive_shared_tag_peers', 'G8-2B shared tags must have Rust regression coverage')
requireText(contextPanel, 'collectionMemberships', 'G8-2B must expose saved collection membership in file context')
requireText(contextPanel, "'search_knowledge'", 'G8-2B collection membership must consume bounded knowledge search')
requireText(contextCache, 'MAX_CONTEXT_CACHE_ENTRIES = 32', 'G8-2B context cache must have an explicit entry bound')
requireText(contextCache, 'CONTEXT_CACHE_TTL_MS = 30_000', 'G8-2B context cache must expire quickly')
requireText(contextCache, 'clearRelationContextCache', 'G8-2B context cache must support explicit refresh invalidation')
requireText(graphCommand, 'add_pptx_document', 'C3C3 must add PPTX files and slides to the unified graph')
requireText(graphCommand, 'object_type: "pptx_slide"', 'C3C3 must expose PPTX slides as knowledge objects')
requireText(graphCommand, 'pptx_file_and_slides_are_stable_graph_and_index_objects', 'C3C3 graph and persistent-index identity must have Rust regression coverage')
requireText(graphCommand, 'focus_locator_object_id', 'C3C3 relation context must support object-level focus')
requireText(contextPanel, 'focusLocatorObjectId', 'C3C3 shared relation UI must request object-focused context')
requireText(contextPanel, "node.objectType === 'pptx_slide'", 'C3C3 relation UI must navigate back to PPTX slides')
requireText(app, ':focus-locator-object-id', 'C3C3 shared application shell must forward object focus')
requireText(graphView, "node.objectType === 'pptx_slide'", 'C3C3 graph nodes must navigate to the shared PPTX workspace')
for (const route of ['LibraryMode', 'TextEditor', 'JsonEditor', 'YamlEditor', 'XmlEditor', 'TomlEditor', 'Pdf', 'Table', 'Canvas', 'MindMap']) {
  requireText(app, `'${route}'`, `G8-2 shared context route coverage is missing ${route}`)
}

if (failures.length) {
  console.error(`Graph product contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Graph product contract check passed: bounded summaries, typed cross-format context, evidence, relation classes, and centered navigation.')
}
