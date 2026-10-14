await import('./workflow-redesign-browser.mjs')
const a = window.workflowAudit, root = a.store.libraryPath, original = window.__TAURI_INTERNALS__.invoke
const GraphView = (await import('/src/components/GraphView.vue')).default
a.router.removeRoute('Graph'); a.router.addRoute({ path: '/graph', name: 'Graph', component: GraphView })
for (const [name, content] of [['测试结果.csv', '项目,结果\n界面,通过\n'], ['依据.pdf', 'synthetic PDF'], ['图片.png', 'synthetic image'], ['配置.json', '{}'], ['其他附件.xyz', 'opaque']]) a.disk.set(root+'/'+name, content)
const config = { filter: '', sortDirection: 'asc', frozenColumns: 0, columnWidths: [200, 180], cardColumns: [] }
const records = [], graph = () => ({ nodes: [...a.disk.keys()].map(path => ({ id: path, path, title: path.split('/').pop(), objectType: path.endsWith('.csv') ? 'table' : path.endsWith('.pdf') ? 'pdf' : path.endsWith('.md') ? 'markdown' : 'file', directory: path.slice(root.length+1).split('/').slice(0,-1).join('/'), size: 8, modifiedAt: 1, tags: [], searchText: '' })), edges: records.map(record => ({ source: record.sourcePath, target: record.targetPath, relationType: record.relationType, directed: record.relationType !== 'related', manualRelationIds: [record.id], mentions: [{ target: record.targetPath, alias: null, syntax: '手动添加的关系', context: record.note || '在应用中添加的资料关系', line: 0, relationType: record.relationType }] })) })
window.fileRelationsAudit = { ...a, records, graph, failSave: false, failList: false }
window.__TAURI_INTERNALS__.invoke = async (command, args) => {
  const state = window.fileRelationsAudit
  if (['list_relation_files', 'list_file_relations', 'save_file_relation', 'remove_file_relation', 'build_link_graph'].includes(command)) a.calls.push({ command, args })
  if (command === 'list_relation_files') {
    if (state.failList) throw Error('模拟文件目录不可读')
    return { files: [...a.disk.keys()].filter(path => path.toLowerCase().includes((args.query || '').toLowerCase())).map(path => ({ name: path.split('/').pop(), path, relativePath: path.slice(root.length+1) })), truncated: false }
  }
  if (command === 'list_file_relations') return structuredClone(records.filter(record => record.sourcePath === args.path || record.targetPath === args.path))
  if (command === 'save_file_relation') {
    if (state.failSave) throw Error('模拟资料关系保存失败')
    let record = records.find(record => record.sourcePath === args.sourcePath && record.targetPath === args.targetPath && record.relationType === args.relationType)
    if (!record) { record = { id: String(records.length+1).padStart(32, '0'), sourcePath: args.sourcePath, targetPath: args.targetPath, relationType: args.relationType, note: args.note }; records.push(record) }
    else record.note = args.note
    return structuredClone(record)
  }
  if (command === 'remove_file_relation') { const index = records.findIndex(record => record.id === args.relationId); if (index >= 0) records.splice(index, 1); return }
  if (command === 'build_link_graph') return graph()
  if (command === 'read_table_file') { a.calls.push({ command, args }); return { path: args.path, format: 'csv', delimiter: ',', encoding: 'utf-8', hasBom: false, lineEnding: 'lf', signature: 'table-fixture', headers: ['项目', '结果'], rows: [['界面', '通过']], columnTypes: ['text','text'], columnIds: ['task','result'], rowIds: ['row-1'], view: config, views: [{ id: 'grid', name: '表格', kind: 'grid', config }], activeView: 'grid' } }
  return original(command, args)
}
await a.router.push({ name: 'LibraryMode', query: { path: root+'/测试结果.csv' } })
