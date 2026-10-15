import './note-templates-browser.mjs'
const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke, root = a.store.libraryPath
a.disk.set(root + '/项目方案.md', '# 项目方案\n\n' + Array.from({ length: 160 }, (_, i) => '## 章节 ' + i + '\n\n这是一份持续阅读的长文档，保留每次阅读的位置。\n').join('\n'))
a.store.tabs[0].content = a.disk.get(root + '/项目方案.md')
a.disk.set(root + '/记录.txt', '第一版记录\n保留这段原文。')
a.manualRelations = [{ id: 'a'.repeat(32), sourcePath: root + '/项目方案.md', targetPath: root + '/记录.txt', relationType: 'related', note: '最初的说明' }]
a.history = [[10, '第一版记录\n保留这段原文。']]
a.store.savedSearches = [
  { id: 'work', name: '工作项目', query: '', libraryPath: root, objectTypes: [], filters: { directory: '', tag: '项目', modifiedWithinDays: null }, createdAt: 1 },
  { id: 'all', name: '全部资料', query: '', libraryPath: root, objectTypes: [], filters: { directory: '', tag: '', modifiedWithinDays: null }, createdAt: 2 },
]
window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
  if (['list_file_relations', 'update_file_relation', 'remove_file_relation', 'search_smart_collection', 'list_history', 'compare_history_version', 'prepare_history_restore', 'restore_history_copy', 'save_history_version'].includes(command)) a.calls.push({ command, args })
  if (command === 'list_file_relations') return a.manualRelations.filter(entry => entry.sourcePath === args.path || entry.targetPath === args.path)
  if (command === 'update_file_relation') { if (a.failRelation) throw Error('模拟关系保存失败'); const entry = a.manualRelations.find(entry => entry.id === args.relationId); Object.assign(entry, { relationType: args.relationType, note: args.note }); return entry }
  if (command === 'remove_file_relation') { a.manualRelations = a.manualRelations.filter(entry => entry.id !== args.relationId); return }
  if (command === 'get_all_tags') return [{ tag: '项目', count: 2 }, { tag: '工作', count: 1 }]
  if (command === 'search_by_tag') return [{ name: '项目方案.md', path: root + '/项目方案.md', is_dir: false }]
  if (command === 'search_smart_collection') return { results: [...a.disk].map(([path, content]) => ({ title: path.split('/').pop(), path, objectType: path.endsWith('.txt') ? 'plain-text' : 'markdown', matchKind: 'title', context: content.slice(0, 30), score: 100, extractionFailed: false })), truncated: false }
  if (command === 'list_history') return [...a.history].reverse()
  if (command === 'save_history_version') { if (!a.history.some(([, content]) => content === args.content)) a.history.push([10 + a.history.length, args.content]); return }
  if (command === 'compare_history_version') return { disk: a.disk.get(args.path), content: a.history.find(([time]) => time === args.timestamp)[1], diskSignature: 'disk', historySignature: 'history' }
  if (command === 'prepare_history_restore') { a.history.push([10 + a.history.length, args.currentDraft]); return a.history.find(([time]) => time === args.timestamp)[1] }
  if (command === 'restore_history_copy') { const path = root + '/记录-恢复.txt'; a.disk.set(path, a.history.find(([time]) => time === args.timestamp)[1]); return path }
  return original(command, args)
}
