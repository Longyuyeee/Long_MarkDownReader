import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as naive from 'naive-ui'
import LibraryMode from '/src/views/LibraryMode.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia = createPinia(), store = useAppStore(pinia)
window.historyAudit = { calls: [], pending: [], store }
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback: () => 1,
  invoke: async (command, args) => {
    window.historyAudit.calls.push({ command, args })
    if (command === 'list_history') return new Promise(resolve => window.historyAudit.pending.push({ path: args.path, resolve }))
    if (command === 'plugin:event|listen') return 1
    if (command === 'plugin:event|unlisten') return
    if (command === 'plugin:app|version') return '1.0.26'
    if (command === 'get_folder_order') return { items: [], pinned: [] }
    if (command === 'get_library_stats') return { file_count: 2, total_words: 100 }
    if (command === 'get_knowledge_index_status') return { state: 'ready', schemaVersion: 1, sourceCount: 2, objectCount: 2, relationCount: 0, progress: 100, cacheBytes: 0, recoveryAvailable: false }
    if (command === 'delete_history_version') return
    if (['scan_directory', 'get_all_tags', 'discover_external_applications', 'summarize_graph_relations', 'find_backlinks', 'extract_wikilinks'].includes(command)) return []
    throw Error(`Unexpected audit IPC: ${command}`)
  },
}
store.activeLibraryPath = 'C:/audit'
store.libraries = [{ name: '历史验收资料库', path: 'C:/audit' }]
store.tabs = ['A', 'B'].map(name => ({ id: `C:/audit/${name}.md`, path: `C:/audit/${name}.md`, title: `${name}.md`, content: `${name} 当前正文`, isDirty: false }))
store.activeTabId = 'C:/audit/A.md'
store.loadConfig = async () => {}
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'LibraryMode', component: LibraryMode }] })
await router.push({ name: 'LibraryMode', query: { path: store.activeTabId } })
const app = createApp({ render: () => h(naive.NConfigProvider, {}, { default: () => h(naive.NDialogProvider, {}, { default: () => h(naive.NMessageProvider, {}, { default: () => h(LibraryMode) }) }) }) })
for (const [name, component] of Object.entries(naive)) if (/^N[A-Z]/.test(name)) app.component(name, component)
app.use(pinia).use(router).mount('#app')
document.body.style.margin = '0'; document.body.dataset.theme = 'white'
document.querySelector('#app').style.height = '100vh'
