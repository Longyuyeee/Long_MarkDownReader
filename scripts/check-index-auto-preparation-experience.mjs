import fs from 'node:fs'

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

const library = read('src/views/LibraryMode.vue')
requireTokens(library, 'Library automatic search preparation', [
  '搜索与关联：准备中',
  '搜索与关联：可用',
  '搜索与关联：需要更新',
  '搜索与关联选项',
  '重新准备搜索与关联',
  '清除本地搜索缓存后重新准备',
  'automaticallyPreparingLibraries',
  "status.state === 'missing' || status.state === 'stale'",
  'rebuildKnowledgeIndex({ automatic: true, libraryRoot })',
  '不会删除或修改任何资料库文件',
  '资料库文件未修改',
])
if (library.includes("window.confirm('删除当前知识库的本地索引")) {
  fail('Legacy browser confirmation remains on the index clear path.')
}

const workspace = read('src/views/WorkspaceHome.vue')
requireTokens(workspace, 'Workspace automatic search preparation', [
  '搜索与关联：准备中',
  '搜索与关联：可用',
  'prepareWorkspaceSearch(store.libraryPath)',
  "invoke<IndexStatus>('rebuild_knowledge_index'",
])

const commands = read('src-tauri/src/commands/index.rs')
requireTokens(commands, 'Index command cache boundary', [
  'knowledge_index_cache_root(&app)?',
  'delete_index(&cache_root, workspace)?',
])
const service = read('src-tauri/src/services/knowledge_index.rs')
requireTokens(service, 'Index service cache boundary', [
  'let directory = index_workspace_directory(cache_root, workspace);',
  'fs::remove_dir_all(directory)',
])

console.log('Index automatic preparation experience contract passed.')
