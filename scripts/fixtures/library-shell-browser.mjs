import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as naive from 'naive-ui'
import LibraryMode from '/src/views/LibraryMode.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
import '/src/styles/vditor-content-themes.scss'
import '/src/styles/display-preferences.scss'
const root = 'C:/shell-fixture'
const directories = [root + '/项目资料.md']
const pinia = createPinia(), store = useAppStore(pinia)
const disk = new Map([
  [`${root}/项目方案.md`, '# 项目方案\n\n记录想法，整理资料，继续昨天的工作。\n\n## 让记录更顺手\n\n快速笔记保存前就能选好位置，之后记住上次使用的目录。\n\n搜索资料直接在主编辑区打开，需要边看边写时再展开参考栏。\n\n## 下一步\n\n- 使用智能集合找到项目近期资料\n- 重开后继续上次工作\n- 恢复历史前先比较\n\n#产品升级\n'],
  [`${root}/会议记录.md`, '# 会议记录\n\n保存的位置应该在记录的时候就确定。\n\n常用操作容易找到，其余功能仍有明确的入口。\n'],
])
const snapshot = path => ({path,content:disk.get(path),encoding:'utf-8',encodingConfidence:'high',bom:'none',lineEnding:'lf',hasFinalNewline:true,signature:disk.get(path),contentDigest:disk.get(path),size:disk.get(path)?.length || 0,modified:1})
window.shellAudit = { calls: [], store, disk, failSave: false, commands: 0 }
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
window.addEventListener('longedit:open-command-palette', () => window.shellAudit.commands++)
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback: () => 1,
  invoke: async (command, args) => {
    window.shellAudit.calls.push({ command, args })
    if (command === 'plugin:event|listen') return 1
    if (command === 'plugin:event|unlisten') return
    if (command === 'plugin:app|version') return '1.0.26'
    if (command === 'scan_directory') return [...directories.map(path => ({name:path.split('/').pop(),path,is_dir:true})), ...[...disk.keys()].map(path => ({name:path.split('/').pop(),path,is_dir:false}))].filter(entry => entry.path.slice(0,entry.path.lastIndexOf('/')) === args.path)
    if (command === 'get_folder_order') return { items: [], pinned: [] }
    if (command === 'get_library_stats') return { file_count: 2, total_words: 300 }
    if (command === 'get_knowledge_index_status') return { state: 'ready', schemaVersion: 1, sourceCount: 2, objectCount: 2, relationCount: 0, progress: 100, cacheBytes: 0, recoveryAvailable: false }
    if (command === 'read_text_document') { if (!disk.has(args.path)) throw Error('文件不存在'); return snapshot(args.path) }
    if (command === 'write_text_document') { if (window.shellAudit.failSave) throw Error('保存失败，请重试'); disk.set(args.path,args.content); return snapshot(args.path) }
    if (command === 'create_new_folder') { const path = args.parentPath + '/新建文件夹'; directories.push(path); return path }
    if (command === 'rename_item') { const path=args.oldPath.slice(0,args.oldPath.lastIndexOf('/')+1)+args.newName; if(disk.has(path))throw Error('同名文件已存在'); disk.set(path,disk.get(args.oldPath));disk.delete(args.oldPath);return path }
    if (command === 'create_format_file') { const path = args.targetDir + '/' + (args.prefix || '新笔记') + '.md'; disk.set(path, args.content || '# 新笔记\n'); return path }
    if (command === 'search_knowledge') return [...disk.keys()].filter(path => disk.get(path).includes(args.query)).map(path => ({title:path.split('/').pop(),path,objectType:'markdown',matchKind:'body',context:'保存的位置应该在记录的时候就确定。',score:100,extractionFailed:false}))
    if (command === 'preview_search_document') return { text: disk.get(args.path), label: 'Markdown', matchFound: true, truncated: false }
    if (command === 'list_history') return []
    if (command === 'open_quick_note' || command === 'save_config') return
    if (['get_all_tags','discover_external_applications','summarize_graph_relations','find_backlinks','extract_wikilinks'].includes(command)) return []
    throw Error(`Unexpected shell fixture IPC: ${command}`)
  },
}
store.activeLibraryPath = root
store.libraries = [{ name: '工作资料库', path: root }]
store.tabs = [...disk].map(([path,content]) => ({id:path,path,title:path.split('/').pop(),content,isDirty:false}))
store.activeTabId = [...disk.keys()][0]
store.loadConfig = async () => {}
const router = createRouter({history:createMemoryHistory(),routes:[{path:'/',name:'LibraryMode',component:LibraryMode}]})
await router.push({name:'LibraryMode',query:{path:store.activeTabId}})
const app = createApp({render:() => h(naive.NConfigProvider, {}, {default:() => h(naive.NDialogProvider, {}, {default:() => h(naive.NMessageProvider, {}, {default:() => h(LibraryMode)})})})})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
document.body.style.margin = '0'; document.body.dataset.theme = 'white'; document.body.dataset.style = 'minimal'
document.querySelector('#app').style.height = '100vh'
document.querySelector('#app > div').style.height = '100%'
